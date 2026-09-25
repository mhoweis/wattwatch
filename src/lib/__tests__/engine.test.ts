import { describe, expect, it } from "vitest";
import { calcBill, DEFAULT_TARIFF, scenarioSaving, splitIntoSlabs } from "../tariff";
import { analyse, moneyAtStake } from "../analysis";
import { parseCsv, toBill, type BillExtraction } from "../extract";
import type { Bill, Site } from "../types";
import { buildSampleBills, SAMPLE_SITES } from "../sample";
import { DEFAULT_SETTINGS } from "../store";

describe("tariff engine", () => {
  it("splits consumption marginally across DEWA commercial slabs", () => {
    const s = splitIntoSlabs(7200, DEFAULT_TARIFF.commercial);
    expect(s.map((x) => x.kwh)).toEqual([2000, 2000, 2000, 1200]);
    expect(s.map((x) => x.rate)).toEqual([0.23, 0.28, 0.32, 0.38]);
  });

  it("reproduces the pitch example: 1,200 kWh cut in the 6,001+ band = AED 554.40 / 6,652.80", () => {
    const r = scenarioSaving(7200, 1200, DEFAULT_TARIFF, "commercial", 0.06);
    expect(r.monthlySaving).toBe(554.4);
    expect(r.annualSaving).toBe(6652.8);
  });

  it("uses two marginal rates when a cut crosses a slab boundary", () => {
    // 6,500 → 5,500: 500 kWh at 0.38 and 500 kWh at 0.32, plus surcharge, plus VAT
    const r = scenarioSaving(6500, 1000, DEFAULT_TARIFF, "commercial", 0.06);
    const expected = (500 * 0.38 + 500 * 0.32 + 1000 * 0.06) * 1.05;
    expect(r.monthlySaving).toBeCloseTo(expected, 2);
  });

  it("computes a full bill with meter charge and VAT", () => {
    const b = calcBill(8500, DEFAULT_TARIFF, "commercial", 0.06, 35);
    const energy = 2000 * 0.23 + 2000 * 0.28 + 2000 * 0.32 + 2500 * 0.38;
    const subtotal = energy + 8500 * 0.06 + 35;
    expect(b.total).toBeCloseTo(subtotal * 1.05, 2);
  });

  it("applies the two-slab industrial table", () => {
    const s = splitIntoSlabs(12000, DEFAULT_TARIFF.industrial);
    expect(s.map((x) => x.kwh)).toEqual([10000, 2000]);
  });
});

describe("analysis engine on the sample dataset", () => {
  const findings = analyse(SAMPLE_SITES, buildSampleBills(), DEFAULT_SETTINGS);

  it("flags Branch B's July spike at ~28% as the top finding", () => {
    const top = findings[0];
    expect(top.type).toBe("SPIKE_VS_BASELINE");
    expect(top.siteId).toBe("site-b");
    expect(top.billMonth).toBe("2026-07");
    expect(top.metrics.pct).toBeGreaterThan(25);
    expect(top.metrics.pct).toBeLessThan(31);
    expect(top.severity).toBe("high");
  });

  it("detects the missing June bill and duplicated May bill for Branch C", () => {
    expect(findings.some((f) => f.type === "MISSING_BILL" && f.siteId === "site-c" && f.billMonth === "2026-06")).toBe(true);
    expect(findings.some((f) => f.type === "DUPLICATE_BILL" && f.siteId === "site-c" && f.billMonth === "2026-05")).toBe(true);
  });

  it("detects the printed-total mismatch on Branch A March", () => {
    const f = findings.find((x) => x.type === "TOTAL_MISMATCH");
    expect(f?.siteId).toBe("site-a");
    expect(f?.metrics.delta).toBeCloseTo(12.6, 2);
  });

  it("does not flag the flat Branch A as a spike", () => {
    expect(findings.some((f) => f.type === "SPIKE_VS_BASELINE" && f.siteId === "site-a")).toBe(false);
  });
});

describe("business value and edge cases", () => {
  const settings = DEFAULT_SETTINGS;
  const site: Site = { id: "w", name: "Warehouse D — Jebel Ali", dewaAccountNo: "9", premisesType: "industrial", hasOwnCooling: true };
  const mk = (month: string, kwh: number, total?: number): Bill => {
    const x: BillExtraction = {
      accountNo: "9",
      premisesName: site.name,
      tariffCategory: "industrial",
      periodStart: `${month}-01`,
      periodEnd: `${month}-28`,
      kwh,
      fuelSurchargeRate: 0.06,
      meterCharge: 35,
      vatAmount: null,
      totalAed: total ?? calcBill(kwh, DEFAULT_TARIFF, "industrial", 0.06, 35).total,
      confidence: 1,
      fieldSources: {},
    };
    return { ...toBill(x, site.id, site.premisesType, settings, "csv"), id: `b-${month}` };
  };

  it("classifies a bill priced at the other tariff category as a recoverable overcharge", () => {
    const wrong = calcBill(12000, DEFAULT_TARIFF, "commercial", 0.06, 35).total;
    const f = analyse([site], [mk("2026-03", 12000), mk("2026-04", 12000), mk("2026-05", 12000, wrong)], settings).find((x) => x.type === "TOTAL_MISMATCH");
    expect(f?.severity).toBe("high");
    expect(f?.metrics.recoverableAed).toBeCloseTo(wrong - calcBill(12000, DEFAULT_TARIFF, "industrial", 0.06, 35).total, 2);
    expect(f?.headline).toMatch(/commercial/);
  });

  it("keeps an arbitrary mismatch as data-quality without a recoverable amount", () => {
    const f = analyse([site], [mk("2026-03", 12000, 5000)], settings).find((x) => x.type === "TOTAL_MISMATCH");
    expect(f?.severity).toBe("data-quality");
    expect(f?.metrics.recoverableAed).toBeUndefined();
  });

  it("separates efficiency excess from recoverable billing errors and does not double count a site-month", () => {
    const findings = analyse(SAMPLE_SITES, buildSampleBills(), settings);
    const m = moneyAtStake(SAMPLE_SITES, findings);
    const bMonths = new Set(findings.filter((f) => f.siteId === "site-b" && f.excessAed > 0).map((f) => f.billMonth));
    const b = m.bySite.find((s) => s.siteId === "site-b");
    const naive = findings.filter((f) => f.siteId === "site-b").reduce((a, f) => a + f.excessAed, 0);
    expect(b).toBeDefined();
    expect(b!.efficiencyAed).toBeLessThanOrEqual(naive);
    expect(bMonths.size).toBeGreaterThan(0);
    expect(m.efficiencyAnnualAed).toBeCloseTo(m.efficiencyMonthlyAed * 12, 1);
    expect(m.recoverableAed).toBe(0);
  });

  it("does not divide by zero when baseline months have zero kWh", () => {
    const bills = [mk("2026-01", 0), mk("2026-02", 0), mk("2026-03", 0), mk("2026-04", 500)];
    const findings = analyse([site], bills, settings);
    expect(findings.every((f) => Number.isFinite(f.metrics.pct ?? 0))).toBe(true);
  });

  it("marks zero consumption and invalid periods as needs_review", () => {
    const zero = mk("2026-01", 0);
    expect(zero.status).toBe("needs_review");
    const x: BillExtraction = { ...mk("2026-01", 100), accountNo: "9", premisesName: null, tariffCategory: "industrial", periodStart: "2026-02-10", periodEnd: "2026-01-10", kwh: 100, fuelSurchargeRate: 0.06, meterCharge: 35, vatAmount: null, totalAed: 100, confidence: 1, fieldSources: {} };
    const b = toBill(x, site.id, "industrial", settings, "csv");
    expect(b.status).toBe("needs_review");
    expect((b.notes ?? []).join(" ")).toMatch(/invalid/);
    const longX = { ...x, periodStart: "2026-01-01", periodEnd: "2026-03-30" };
    expect((toBill(longX, site.id, "industrial", settings, "csv").notes ?? []).join(" ")).toMatch(/outside the normal/);
  });

  it("parses CSV with BOM, quoted commas, semicolons and DD/MM/YYYY dates", () => {
    const a = parseCsv('\uFEFFsite,account_no,period_start,period_end,kwh\n"Branch A, Deira",100,01/03/2026,31/03/2026,"7,200"\n');
    expect(a.errors).toEqual([]);
    expect(a.rows[0]).toMatchObject({ site: "Branch A, Deira", period_start: "2026-03-01", kwh: 7200 });
    const b = parseCsv("site;account_no;period_start;period_end;kwh\nX;1;2026-03-01;2026-03-31;100\n");
    expect(b.rows).toHaveLength(1);
    const c = parseCsv("site,kwh\nX,100\n");
    expect(c.rows).toHaveLength(0);
    expect(c.errors.length).toBeGreaterThan(0);
    expect(parseCsv("").rows).toHaveLength(0);
  });
});
