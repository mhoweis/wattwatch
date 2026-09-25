import type { Bill, Site } from "./types";
import { calcBill, DEFAULT_TARIFF } from "./tariff";

export const SAMPLE_SITES: Site[] = [
  {
    id: "site-a",
    name: "Branch A — Deira Showroom",
    nameAr: "الفرع أ — معرض ديرة",
    dewaAccountNo: "2001234501",
    premisesType: "commercial",
    areaSqm: 620,
    hasOwnCooling: false,
  },
  {
    id: "site-b",
    name: "Branch B — Al Quoz Store",
    nameAr: "الفرع ب — متجر القوز",
    dewaAccountNo: "2001234502",
    premisesType: "commercial",
    areaSqm: 540,
    hasOwnCooling: true,
  },
  {
    id: "site-c",
    name: "Branch C — Jumeirah Clinic",
    nameAr: "الفرع ج — عيادة جميرا",
    dewaAccountNo: "2001234503",
    premisesType: "commercial",
    areaSqm: 310,
    hasOwnCooling: true,
  },
];

interface Row {
  siteId: string;
  month: string;
  kwh: number;
  duplicate?: boolean;
  printedDelta?: number;
}

const ROWS: Row[] = [
  { siteId: "site-a", month: "2026-03", kwh: 8940, printedDelta: 12.6 },
  { siteId: "site-a", month: "2026-04", kwh: 9120 },
  { siteId: "site-a", month: "2026-05", kwh: 9060 },
  { siteId: "site-a", month: "2026-06", kwh: 9310 },
  { siteId: "site-a", month: "2026-07", kwh: 9480 },
  { siteId: "site-a", month: "2026-08", kwh: 9390 },

  { siteId: "site-b", month: "2026-03", kwh: 7380 },
  { siteId: "site-b", month: "2026-04", kwh: 7460 },
  { siteId: "site-b", month: "2026-05", kwh: 7520 },
  { siteId: "site-b", month: "2026-06", kwh: 7610 },
  { siteId: "site-b", month: "2026-07", kwh: 9880 },
  { siteId: "site-b", month: "2026-08", kwh: 9790 },

  { siteId: "site-c", month: "2026-03", kwh: 4420 },
  { siteId: "site-c", month: "2026-04", kwh: 4510 },
  { siteId: "site-c", month: "2026-05", kwh: 4580 },
  { siteId: "site-c", month: "2026-05", kwh: 4580, duplicate: true },
  { siteId: "site-c", month: "2026-07", kwh: 4720 },
  { siteId: "site-c", month: "2026-08", kwh: 4690 },
];

function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function buildSampleBills(): Bill[] {
  return ROWS.map((r, i) => {
    const site = SAMPLE_SITES.find((s) => s.id === r.siteId)!;
    const { start, end } = monthBounds(r.month);
    const c = calcBill(r.kwh, DEFAULT_TARIFF, site.premisesType, DEFAULT_TARIFF.defaultSurchargeRate, DEFAULT_TARIFF.meterCharge);
    const printed = Math.round((c.total + (r.printedDelta ?? 0)) * 100) / 100;
    return {
      id: `sample-${i + 1}`,
      siteId: site.id,
      accountNo: site.dewaAccountNo,
      periodStart: start,
      periodEnd: end,
      billMonth: r.month,
      kwh: r.kwh,
      slabBreakdown: c.slabs,
      fuelSurchargeRate: c.surchargeRate,
      fuelSurchargeAmount: c.surcharge,
      meterCharge: c.meterCharge,
      vatAmount: c.vat,
      totalAed: printed,
      printedTotalAed: printed,
      extractionConfidence: 1,
      extractionMethod: "sample",
      status: r.duplicate ? "duplicate" : "ok",
      notes: r.duplicate ? ["Duplicate of an existing bill for the same account and period"] : undefined,
    };
  });
}

export function sampleCsv(): string {
  const header = "site,account_no,period_start,period_end,kwh,fuel_surcharge_rate,meter_charge,total_aed";
  const lines = buildSampleBills()
    .filter((b) => b.status !== "duplicate")
    .map((b) => {
      const site = SAMPLE_SITES.find((s) => s.id === b.siteId)!;
      return [site.name, b.accountNo, b.periodStart, b.periodEnd, b.kwh, b.fuelSurchargeRate, b.meterCharge, b.totalAed].join(",");
    });
  return [header, ...lines].join("\n") + "\n";
}
