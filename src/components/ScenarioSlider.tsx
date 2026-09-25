"use client";

import { useState } from "react";
import { fmtAed, scenarioSaving } from "@/lib/tariff";
import type { EmissionFactor, PremisesType, TariffConfig } from "@/lib/types";

export function ScenarioSlider({
  kwh,
  tariff,
  premises,
  surchargeRate,
  meterCharge,
  initialReduction,
  emissionFactor,
}: {
  kwh: number;
  tariff: TariffConfig;
  premises: PremisesType;
  surchargeRate: number;
  meterCharge: number;
  initialReduction: number;
  emissionFactor: EmissionFactor;
}) {
  const [reduction, setReduction] = useState(Math.min(Math.round(initialReduction), kwh));
  const [showTrace, setShowTrace] = useState(false);
  const r = scenarioSaving(kwh, reduction, tariff, premises, surchargeRate, meterCharge);
  const pct = kwh > 0 ? (reduction / kwh) * 100 : 0;
  const co2 = emissionFactor.enabled ? reduction * emissionFactor.kgCo2ePerKwh : null;
  const crossesSlab = r.before.slabs.length !== r.after.slabs.length;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <label htmlFor="reduction" className="text-sm font-medium">
          Proposed monthly reduction
        </label>
        <span className="text-sm text-slate-600">
          <b>{reduction.toLocaleString()} kWh</b> ({pct.toFixed(0)}% of {kwh.toLocaleString()} kWh)
        </span>
      </div>
      <input
        id="reduction"
        type="range"
        min={0}
        max={Math.round(kwh * 0.5)}
        step={10}
        value={reduction}
        onChange={(e) => setReduction(Number(e.target.value))}
        className="w-full accent-amber-500"
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-emerald-50 p-3">
          <div className="text-xs uppercase tracking-wide text-emerald-700">Monthly saving (scenario)</div>
          <div className="text-2xl font-semibold text-emerald-800">{fmtAed(r.monthlySaving)}</div>
        </div>
        <div className="rounded-md bg-emerald-50 p-3">
          <div className="text-xs uppercase tracking-wide text-emerald-700">Annualised (× 12)</div>
          <div className="text-2xl font-semibold text-emerald-800">{fmtAed(r.annualSaving)}</div>
        </div>
      </div>
      {co2 !== null && (
        <div className="text-sm text-slate-600">
          ≈ <b>{co2.toFixed(0)} kgCO₂e/month</b> avoided (location-based Scope 2 estimate, {emissionFactor.kgCo2ePerKwh} kgCO₂e/kWh, {emissionFactor.year}).
        </div>
      )}
      <p className="text-xs text-slate-500">
        Scenario, not a guaranteed saving. Uses the DEWA {premises} slab tariff with the fuel surcharge printed on this bill ({surchargeRate.toFixed(3)} AED/kWh) and 5% VAT.
        {crossesSlab && " The reduction crosses a slab boundary, so part of it is valued at the lower slab rate."}
      </p>
      <button type="button" onClick={() => setShowTrace((v) => !v)} className="text-sm text-amber-700 underline">
        {showTrace ? "Hide" : "Show"} calculation
      </button>
      {showTrace && (
        <table className="w-full text-sm">
          <tbody>
            {r.trace.map((l) => (
              <tr key={l.label} className="border-t border-slate-100">
                <td className="py-1 pr-2">{l.label}</td>
                <td className="py-1 pr-2 font-mono text-xs text-slate-500">{l.formula}</td>
                <td className="py-1 text-right font-mono">
                  {l.unit === "AED" ? fmtAed(l.value) : `${l.value.toLocaleString()} ${l.unit}`}
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200">
              <td colSpan={3} className="pt-2 text-xs text-slate-500">
                Before: {r.before.slabs.map((s) => `${s.kwh} kWh @ ${s.rate}`).join(" + ")} · After: {r.after.slabs.map((s) => `${s.kwh} kWh @ ${s.rate}`).join(" + ")}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
