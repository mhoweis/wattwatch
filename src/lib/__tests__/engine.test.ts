import { describe, expect, it } from "vitest";
import { calcBill, DEFAULT_TARIFF, scenarioSaving, splitIntoSlabs } from "../tariff";
import { analyse } from "../analysis";
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
