import type {
  CalcLine,
  PremisesType,
  SlabLine,
  TariffConfig,
  TariffSlab,
} from "./types";

export const DEFAULT_TARIFF: TariffConfig = {
  effectiveFrom: "2011-01-01",
  sourceUrl: "https://www.dewa.gov.ae/en/consumer/billing/slab-tariff",
  sourceNote:
    "DEWA slab tariff per Executive Resolution No. 16 of 2011. Fuel surcharge is published monthly by DEWA and read from each bill.",
  commercial: [
    { from: 0, to: 2000, rate: 0.23 },
    { from: 2000, to: 4000, rate: 0.28 },
    { from: 4000, to: 6000, rate: 0.32 },
    { from: 6000, to: null, rate: 0.38 },
  ],
  industrial: [
    { from: 0, to: 10000, rate: 0.23 },
    { from: 10000, to: null, rate: 0.38 },
  ],
  meterCharge: 35,
  vatRate: 0.05,
  defaultSurchargeRate: 0.06,
  surchargeMonthLabel: "August 2026",
};

export function slabsFor(t: TariffConfig, p: PremisesType): TariffSlab[] {
  return p === "industrial" ? t.industrial : t.commercial;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function splitIntoSlabs(kwh: number, slabs: TariffSlab[]): SlabLine[] {
  const lines: SlabLine[] = [];
  let remaining = Math.max(0, kwh);
  for (const s of slabs) {
    const width = s.to === null ? Infinity : s.to - s.from;
    const inBand = Math.min(remaining, width);
    if (inBand <= 0) break;
    lines.push({
      from: s.from,
      to: s.to,
      kwh: inBand,
      rate: s.rate,
      amount: round2(inBand * s.rate),
    });
    remaining -= inBand;
  }
  return lines;
}

export interface BillCalc {
  kwh: number;
  slabs: SlabLine[];
  energy: number;
  surchargeRate: number;
  surcharge: number;
  meterCharge: number;
  subtotal: number;
  vatRate: number;
  vat: number;
  total: number;
  trace: CalcLine[];
}

export function calcBill(
  kwh: number,
  tariff: TariffConfig,
  premises: PremisesType,
  surchargeRate: number = tariff.defaultSurchargeRate,
  meterCharge: number = tariff.meterCharge,
): BillCalc {
  const slabs = splitIntoSlabs(kwh, slabsFor(tariff, premises));
  const energy = round2(slabs.reduce((a, s) => a + s.amount, 0));
  const surcharge = round2(kwh * surchargeRate);
  const subtotal = round2(energy + surcharge + meterCharge);
  const vat = round2(subtotal * tariff.vatRate);
  const total = round2(subtotal + vat);
  const trace: CalcLine[] = [
    ...slabs.map<CalcLine>((s) => ({
      label: `Slab ${s.from + 1}${s.to ? `–${s.to}` : "+"} kWh`,
      formula: `${s.kwh} kWh × ${s.rate.toFixed(3)}`,
      value: s.amount,
      unit: "AED",
    })),
    {
      label: "Fuel surcharge",
      formula: `${kwh} kWh × ${surchargeRate.toFixed(3)}`,
      value: surcharge,
      unit: "AED",
    },
    { label: "Meter service charge", formula: "fixed", value: meterCharge, unit: "AED" },
    { label: "Subtotal", formula: "energy + surcharge + meter", value: subtotal, unit: "AED" },
    {
      label: `VAT ${Math.round(tariff.vatRate * 100)}%`,
      formula: `${subtotal} × ${tariff.vatRate}`,
      value: vat,
      unit: "AED",
    },
    { label: "Total", formula: "subtotal + VAT", value: total, unit: "AED" },
  ];
  return {
    kwh,
    slabs,
    energy,
    surchargeRate,
    surcharge,
    meterCharge,
    subtotal,
    vatRate: tariff.vatRate,
    vat,
    total,
    trace,
  };
}

export interface ScenarioResult {
  kwhBefore: number;
  kwhAfter: number;
  reductionKwh: number;
  monthlySaving: number;
  annualSaving: number;
  before: BillCalc;
  after: BillCalc;
  trace: CalcLine[];
}

/** Marginal saving from reducing consumption; correct across slab boundaries. */
export function scenarioSaving(
  kwhBefore: number,
  reductionKwh: number,
  tariff: TariffConfig,
  premises: PremisesType,
  surchargeRate: number = tariff.defaultSurchargeRate,
  meterCharge: number = tariff.meterCharge,
): ScenarioResult {
  const reduction = Math.min(Math.max(0, reductionKwh), kwhBefore);
  const before = calcBill(kwhBefore, tariff, premises, surchargeRate, meterCharge);
  const after = calcBill(kwhBefore - reduction, tariff, premises, surchargeRate, meterCharge);
  const monthly = round2(before.total - after.total);
  const trace: CalcLine[] = [
    { label: "Current consumption", formula: "from bill", value: kwhBefore, unit: "kWh" },
    { label: "Proposed reduction", formula: "scenario input", value: reduction, unit: "kWh" },
    { label: "Bill at current consumption", formula: "calcBill(current)", value: before.total, unit: "AED" },
    { label: "Bill after reduction", formula: "calcBill(current − reduction)", value: after.total, unit: "AED" },
    { label: "Monthly saving", formula: "before − after", value: monthly, unit: "AED" },
    { label: "Annualised saving", formula: "monthly × 12", value: round2(monthly * 12), unit: "AED" },
  ];
  return {
    kwhBefore,
    kwhAfter: kwhBefore - reduction,
    reductionKwh: reduction,
    monthlySaving: monthly,
    annualSaving: round2(monthly * 12),
    before,
    after,
    trace,
  };
}

/** Marginal all-in rate (incl. surcharge and VAT) at a given consumption level. */
export function marginalRate(
  kwh: number,
  tariff: TariffConfig,
  premises: PremisesType,
  surchargeRate: number = tariff.defaultSurchargeRate,
): number {
  const slabs = slabsFor(tariff, premises);
  const slab = slabs.find((s) => kwh > s.from && (s.to === null || kwh <= s.to)) ?? slabs[0];
  return round2((slab.rate + surchargeRate) * (1 + tariff.vatRate) * 1000) / 1000;
}

export function fmtAed(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
