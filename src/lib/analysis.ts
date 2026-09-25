import type {
  Bill,
  CalcLine,
  Finding,
  PremisesType,
  Settings,
  Site,
  Thresholds,
} from "./types";
import { calcBill, marginalRate, round2 } from "./tariff";

export const DEFAULT_THRESHOLDS: Thresholds = {
  spikePct: 20,
  spikeHighPct: 25,
  driftPct: 10,
  peerPct: 30,
  baselineMonths: 3,
  totalMismatchAed: 1,
  minConfidence: 0.7,
};

export function periodDays(b: Bill): number {
  const a = new Date(b.periodStart).getTime();
  const z = new Date(b.periodEnd).getTime();
  return Math.max(1, Math.round((z - a) / 86400000) + 1);
}

export function kwhPerDay(b: Bill): number {
  return b.kwh / periodDays(b);
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function monthSeq(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function usable(bills: Bill[]): Bill[] {
  return bills.filter((b) => b.status === "ok");
}

function bySite(bills: Bill[]): Map<string, Bill[]> {
  const m = new Map<string, Bill[]>();
  for (const b of bills) {
    const arr = m.get(b.siteId) ?? [];
    arr.push(b);
    m.set(b.siteId, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.billMonth.localeCompare(b.billMonth));
  return m;
}

function slabIndex(kwh: number, site: Site, settings: Settings): number {
  const slabs = site.premisesType === "industrial" ? settings.tariff.industrial : settings.tariff.commercial;
  return slabs.findIndex((s) => kwh > s.from && (s.to === null || kwh <= s.to));
}

export function analyse(sites: Site[], allBills: Bill[], settings: Settings): Finding[] {
  const t = settings.thresholds;
  const findings: Finding[] = [];
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const okBills = usable(allBills);
  const grouped = bySite(okBills);

  // Data-quality findings use all bills (including duplicates / needs_review)
  for (const [siteId, bills] of bySite(allBills)) {
    const site = siteById.get(siteId);
    if (!site) continue;
    const months = bills.map((b) => b.billMonth).sort();
    if (months.length >= 2) {
      const expected = monthSeq(months[0], months[months.length - 1]);
      for (const m of expected) {
        if (!months.includes(m)) {
          findings.push({
            id: `MISSING_BILL:${siteId}:${m}`,
            siteId,
            type: "MISSING_BILL",
            severity: "data-quality",
            billMonth: m,
            headline: `${site.name}: no bill found for ${monthLabel(m)}`,
            whyHint: "Request the missing bill from DEWA or accounts payable; baselines exclude this month.",
            metrics: {},
            evidenceBillIds: bills
              .filter((b) => Math.abs(expected.indexOf(b.billMonth) - expected.indexOf(m)) === 1)
              .map((b) => b.id),
            calcTrace: [],
            excessKwh: 0,
            excessAed: 0,
            score: 1,
          });
        }
      }
    }
    for (const b of bills) {
      if (b.status === "duplicate") {
        const orig = bills.find((o) => o.id !== b.id && o.billMonth === b.billMonth && o.status !== "duplicate");
        findings.push({
          id: `DUPLICATE_BILL:${siteId}:${b.billMonth}:${b.id}`,
          siteId,
          type: "DUPLICATE_BILL",
          severity: "data-quality",
          billMonth: b.billMonth,
          headline: `${site.name}: duplicate bill for ${monthLabel(b.billMonth)} (excluded from analysis)`,
          whyHint: "Same account and overlapping period uploaded twice. Check it was not paid twice.",
          metrics: { totalAed: b.totalAed },
          evidenceBillIds: [b.id, ...(orig ? [orig.id] : [])],
          calcTrace: [],
          excessKwh: 0,
          excessAed: 0,
          score: 2,
        });
      }
      const recomputed = calcBill(b.kwh, settings.tariff, site.premisesType, b.fuelSurchargeRate, b.meterCharge).total;
      const printed = b.printedTotalAed ?? b.totalAed;
      const delta = round2(printed - recomputed);
      if (Math.abs(delta) > t.totalMismatchAed && b.status !== "duplicate") {
        const otherType: PremisesType = site.premisesType === "industrial" ? "commercial" : "industrial";
        const asOther = calcBill(b.kwh, settings.tariff, otherType, b.fuelSurchargeRate, b.meterCharge).total;
        const wrongCategory = Math.abs(printed - asOther) <= t.totalMismatchAed;
        const overcharged = wrongCategory && delta > 0;
        const trace: CalcLine[] = [
          { label: "Printed total", formula: "from bill", value: printed, unit: "AED" },
          { label: `Recomputed as ${site.premisesType}`, formula: "calcBill(kWh, tariff, surcharge, meter)", value: recomputed, unit: "AED" },
          { label: "Difference", formula: "printed − recomputed", value: delta, unit: "AED" },
        ];
        if (wrongCategory) trace.push({ label: `Recomputed as ${otherType}`, formula: "matches printed total", value: asOther, unit: "AED" });
        findings.push({
          id: `TOTAL_MISMATCH:${siteId}:${b.billMonth}:${b.id}`,
          siteId,
          type: "TOTAL_MISMATCH",
          severity: overcharged ? "high" : "data-quality",
          billMonth: b.billMonth,
          headline: wrongCategory
            ? `${site.name}: ${monthLabel(b.billMonth)} bill was charged at ${otherType} rates instead of ${site.premisesType} — ${overcharged ? `AED ${delta.toFixed(2)} overcharged` : `AED ${Math.abs(delta).toFixed(2)} undercharged`}`
            : `${site.name}: printed total differs from tariff recomputation by AED ${Math.abs(delta).toFixed(2)} (${monthLabel(b.billMonth)})`,
          whyHint: overcharged
            ? "The printed total matches the other tariff category exactly. Raise a billing dispute with DEWA citing the account's registered premises type; the difference is refundable."
            : wrongCategory
              ? "The printed total matches the other tariff category exactly. Confirm the premises type registered with DEWA (or correct it in Settings) — later bills may be re-rated."
              : "Either extraction misread a field or a charge is missing from the tariff model. Verify against the PDF.",
          metrics: { printed, recomputed, delta, ...(overcharged ? { recoverableAed: delta } : {}) },
          evidenceBillIds: [b.id],
          calcTrace: trace,
          excessKwh: 0,
          excessAed: Math.abs(delta),
          score: (overcharged ? 3 : 1) * Math.abs(delta) + 2,
        });
      }
    }
  }

  // Consumption findings
  const allMonths = [...new Set(okBills.map((b) => b.billMonth))].sort();
  for (const [siteId, bills] of grouped) {
    const site = siteById.get(siteId);
    if (!site) continue;

    for (let i = 0; i < bills.length; i++) {
      const b = bills[i];
      const prior = bills.slice(Math.max(0, i - t.baselineMonths), i);
      if (prior.length >= 2 && prior.every((p) => p.kwh > 0)) {
        const base = median(prior.map(kwhPerDay));
        const cur = kwhPerDay(b);
        const pct = ((cur - base) / base) * 100;
        if (pct >= t.spikePct) {
          const days = periodDays(b);
          const excessKwh = round2((cur - base) * days);
          const rate = marginalRate(b.kwh, settings.tariff, site.premisesType, b.fuelSurchargeRate);
          const excessAed = round2(excessKwh * rate);
          const sev = pct >= t.spikeHighPct ? "high" : "medium";
          const summer = ["05", "06", "07", "08", "09"].includes(b.billMonth.slice(5));
          const whyHint = summer && site.hasOwnCooling
            ? "Summer month at a site with its own cooling: check AC set-points, schedules and filter condition first, then after-hours equipment."
            : summer
              ? "Summer month: check tenant-side cooling/ventilation and any new equipment; compare with peer branches for the same month."
              : "No seasonal driver: check for new equipment, extended opening hours, or loads left on after hours.";
          const trace: CalcLine[] = [
            ...prior.map<CalcLine>((p) => ({
              label: `${monthLabel(p.billMonth)} usage`,
              formula: `${p.kwh} kWh ÷ ${periodDays(p)} days`,
              value: round2(kwhPerDay(p)),
              unit: "kWh/day",
            })),
            { label: `Baseline (median of ${prior.length} months)`, formula: "median(prior kWh/day)", value: round2(base), unit: "kWh/day" },
            { label: `${monthLabel(b.billMonth)} usage`, formula: `${b.kwh} kWh ÷ ${days} days`, value: round2(cur), unit: "kWh/day" },
            { label: "Change vs baseline", formula: "(current − baseline) ÷ baseline", value: round2(pct), unit: "%" },
            { label: "Excess consumption", formula: `(current − baseline) × ${days} days`, value: excessKwh, unit: "kWh" },
            { label: "Marginal all-in rate", formula: "(slab rate + surcharge) × (1 + VAT)", value: rate, unit: "AED" },
            { label: "Estimated excess cost", formula: "excess kWh × marginal rate", value: excessAed, unit: "AED" },
          ];
          findings.push({
            id: `SPIKE_VS_BASELINE:${siteId}:${b.billMonth}`,
            siteId,
            type: "SPIKE_VS_BASELINE",
            severity: sev,
            billMonth: b.billMonth,
            headline: `${site.name} electricity use rose ${Math.round(pct)}% versus its recent baseline in ${monthLabel(b.billMonth)}`,
            whyHint,
            metrics: { pct: round2(pct), baselineKwhPerDay: round2(base), currentKwhPerDay: round2(cur), excessKwh, excessAed, days },
            evidenceBillIds: [b.id, ...prior.map((p) => p.id)],
            calcTrace: trace,
            excessKwh,
            excessAed,
            score: excessAed * (sev === "high" ? 1.5 : 1.2),
          });
        }

        const prevIdx = slabIndex(median(prior.map((p) => p.kwh)), site, settings);
        const curIdx = slabIndex(b.kwh, site, settings);
        if (curIdx > prevIdx) {
          const slabs = site.premisesType === "industrial" ? settings.tariff.industrial : settings.tariff.commercial;
          const boundary = slabs[curIdx].from;
          const overKwh = b.kwh - boundary;
          const stepAed = round2(overKwh * (slabs[curIdx].rate - slabs[prevIdx].rate) * (1 + settings.tariff.vatRate));
          findings.push({
            id: `SLAB_BAND_JUMP:${siteId}:${b.billMonth}`,
            siteId,
            type: "SLAB_BAND_JUMP",
            severity: "medium",
            billMonth: b.billMonth,
            headline: `${site.name} moved into the ${boundary + 1}+ kWh tariff band in ${monthLabel(b.billMonth)}`,
            whyHint: `Every kWh above ${boundary} is billed at ${slabs[curIdx].rate.toFixed(2)} instead of ${slabs[prevIdx].rate.toFixed(2)} AED. Keeping the site under the boundary avoids the step-up.`,
            metrics: { boundary, overKwh, stepAed },
            evidenceBillIds: [b.id, ...prior.map((p) => p.id)],
            calcTrace: [
              { label: "Band boundary", formula: "tariff table", value: boundary, unit: "kWh" },
              { label: "kWh above boundary", formula: `${b.kwh} − ${boundary}`, value: overKwh, unit: "kWh" },
              { label: "Rate step-up cost", formula: `${overKwh} × (${slabs[curIdx].rate} − ${slabs[prevIdx].rate}) × 1.05`, value: stepAed, unit: "AED" },
            ],
            excessKwh: overKwh,
            excessAed: stepAed,
            score: stepAed,
          });
        }
      }

      if (i >= 3) {
        const w = bills.slice(i - 3, i + 1).map(kwhPerDay);
        const drift = w[0] > 0 && w.every((v, k) => k === 0 || v >= w[k - 1] * (1 + t.driftPct / 100));
        if (drift) {
          const pct = ((w[3] - w[0]) / w[0]) * 100;
          const excessKwh = round2((w[3] - w[0]) * periodDays(b));
          const rate = marginalRate(b.kwh, settings.tariff, site.premisesType, b.fuelSurchargeRate);
          const excessAed = round2(excessKwh * rate);
          findings.push({
            id: `SUSTAINED_DRIFT:${siteId}:${b.billMonth}`,
            siteId,
            type: "SUSTAINED_DRIFT",
            severity: "medium",
            billMonth: b.billMonth,
            headline: `${site.name} has risen ≥${t.driftPct}% month-on-month for three consecutive months (+${Math.round(pct)}% overall)`,
            whyHint: "Gradual creep usually means degrading equipment (dirty coils, refrigerant loss) or steadily longer operating hours.",
            metrics: { pct: round2(pct), excessKwh, excessAed },
            evidenceBillIds: bills.slice(i - 3, i + 1).map((x) => x.id),
            calcTrace: w.map((v, k) => ({
              label: `${monthLabel(bills[i - 3 + k].billMonth)} usage`,
              formula: "kWh ÷ days",
              value: round2(v),
              unit: "kWh/day" as const,
            })),
            excessKwh,
            excessAed,
            score: excessAed,
          });
        }
      }
    }

    // Peer outlier: same month, same premises type
    const last3 = allMonths.slice(-3);
    let hits = 0;
    const hitBills: Bill[] = [];
    const peerTrace: CalcLine[] = [];
    for (const m of last3) {
      const mine = bills.find((b) => b.billMonth === m);
      if (!mine) continue;
      const peers = okBills.filter((b) => b.billMonth === m && b.siteId !== siteId && siteById.get(b.siteId)?.premisesType === site.premisesType);
      if (peers.length < 2) continue;
      const peerMed = median(peers.map(kwhPerDay));
      if (peerMed <= 0) continue;
      const mineV = kwhPerDay(mine);
      peerTrace.push({ label: `${monthLabel(m)} site vs peer median`, formula: `${round2(mineV)} vs ${round2(peerMed)} kWh/day`, value: round2(((mineV - peerMed) / peerMed) * 100), unit: "%" });
      if (mineV >= peerMed * (1 + t.peerPct / 100)) {
        hits++;
        hitBills.push(mine);
      }
    }
    if (hits >= 2) {
      const last = hitBills[hitBills.length - 1];
      findings.push({
        id: `PEER_OUTLIER:${siteId}:${last.billMonth}`,
        siteId,
        type: "PEER_OUTLIER",
        severity: "medium",
        billMonth: last.billMonth,
        headline: `${site.name} uses ≥${t.peerPct}% more per day than comparable branches in ${hits} of the last ${last3.length} months`,
        whyHint: "Persistent gap versus peers is not seasonal. Compare floor area, opening hours and equipment inventory with the best-performing branch.",
        metrics: { hits },
        evidenceBillIds: hitBills.map((b) => b.id),
        calcTrace: peerTrace,
        excessKwh: 0,
        excessAed: 0,
        score: 5,
      });
    }
  }

  return findings.sort((a, b) => b.score - a.score);
}

export interface MoneyAtStake {
  /** Recurring excess above baseline/band, counted once per site-month (largest finding wins). */
  efficiencyMonthlyAed: number;
  efficiencyAnnualAed: number;
  /** One-off billing errors that can be disputed with DEWA. */
  recoverableAed: number;
  bySite: { siteId: string; name: string; efficiencyAed: number; recoverableAed: number }[];
}

export function moneyAtStake(sites: Site[], findings: Finding[]): MoneyAtStake {
  const perSiteMonth = new Map<string, number>();
  const recoverable = new Map<string, number>();
  for (const f of findings) {
    if (f.type === "TOTAL_MISMATCH") {
      const r = f.metrics.recoverableAed ?? 0;
      if (r > 0) recoverable.set(f.siteId, (recoverable.get(f.siteId) ?? 0) + r);
      continue;
    }
    if (f.excessAed <= 0) continue;
    const key = `${f.siteId}:${f.billMonth}`;
    perSiteMonth.set(key, Math.max(perSiteMonth.get(key) ?? 0, f.excessAed));
  }
  const bySite = sites
    .map((s) => {
      let eff = 0;
      for (const [k, v] of perSiteMonth) if (k.startsWith(`${s.id}:`)) eff += v;
      return { siteId: s.id, name: s.name, efficiencyAed: round2(eff), recoverableAed: round2(recoverable.get(s.id) ?? 0) };
    })
    .filter((s) => s.efficiencyAed > 0 || s.recoverableAed > 0)
    .sort((a, b) => b.efficiencyAed + b.recoverableAed - (a.efficiencyAed + a.recoverableAed));
  // Latest flagged month per site approximates the recurring monthly excess
  let monthly = 0;
  for (const s of sites) {
    const months = [...perSiteMonth.entries()].filter(([k]) => k.startsWith(`${s.id}:`)).sort(([a], [b]) => a.localeCompare(b));
    if (months.length) monthly += months[months.length - 1][1];
  }
  return {
    efficiencyMonthlyAed: round2(monthly),
    efficiencyAnnualAed: round2(monthly * 12),
    recoverableAed: round2([...recoverable.values()].reduce((a, b) => a + b, 0)),
    bySite,
  };
}

export interface SiteSummary {
  site: Site;
  months: { billMonth: string; kwh: number; totalAed: number; kwhPerDay: number }[];
  lastKwh: number;
  lastAed: number;
  totalAed: number;
  totalKwh: number;
  deltaPct: number | null;
  findingCount: number;
  topSeverity: "high" | "medium" | "data-quality" | null;
}

export function summarise(sites: Site[], bills: Bill[], findings: Finding[]): SiteSummary[] {
  const grouped = bySite(usable(bills));
  return sites.map((site) => {
    const bs = grouped.get(site.id) ?? [];
    const months = bs.map((b) => ({ billMonth: b.billMonth, kwh: b.kwh, totalAed: b.totalAed, kwhPerDay: round2(kwhPerDay(b)) }));
    const last = bs[bs.length - 1];
    const prior = bs.slice(Math.max(0, bs.length - 4), bs.length - 1);
    const base = prior.length >= 2 ? median(prior.map(kwhPerDay)) : null;
    const fs = findings.filter((f) => f.siteId === site.id);
    const sevOrder: SiteSummary["topSeverity"][] = ["high", "medium", "data-quality"];
    const top = sevOrder.find((s) => fs.some((f) => f.severity === s)) ?? null;
    return {
      site,
      months,
      lastKwh: last?.kwh ?? 0,
      lastAed: last?.totalAed ?? 0,
      totalAed: round2(bs.reduce((a, b) => a + b.totalAed, 0)),
      totalKwh: bs.reduce((a, b) => a + b.kwh, 0),
      deltaPct: last && base ? round2(((kwhPerDay(last) - base) / base) * 100) : null,
      findingCount: fs.length,
      topSeverity: top,
    };
  });
}
