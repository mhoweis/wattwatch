"use client";

import { useState } from "react";
import { fmtAed, scenarioSaving } from "@/lib/tariff";
import type { EmissionFactor, PremisesType, TariffConfig } from "@/lib/types";
import { BillCompareChart } from "./charts";

const parts = (b: { energy: number; surcharge: number; meterCharge: number; vat: number }) => ({ energy: b.energy, surcharge: b.surcharge, meter: b.meterCharge, vat: b.vat });

/** Typical measures with indicative reduction share of the bill and one-off cost. Ranges are illustrative for Dubai commercial premises. */
export const PRESETS: { id: string; label: string; pct: number; capexAed: number; hint: string; cooling?: boolean }[] = [
  { id: "finding", label: "Remove the flagged excess", pct: 0, capexAed: 0, hint: "Bring consumption back to the baseline the finding was measured against." },
  { id: "setpoint", label: "AC set-point +1 °C", pct: 6, capexAed: 0, hint: "Each degree of cooling set-point is worth roughly 5–8% of a cooled site's electricity.", cooling: true },
  { id: "schedule", label: "AC / lighting timers after hours", pct: 12, capexAed: 1500, hint: "Timers or BMS schedule so plant and signage are off outside opening hours." },
  { id: "filters", label: "AC filter & coil service", pct: 4, capexAed: 800, hint: "Dirty filters and coils raise compressor run-time; a service visit typically recovers a few percent.", cooling: true },
  { id: "led", label: "LED lighting retrofit", pct: 10, capexAed: 9000, hint: "Replacing fluorescent/halogen fittings with LED; capex depends on fitting count." },
];

export function ScenarioSlider({
  kwh,
  tariff,
  premises,
  surchargeRate,
  meterCharge,
  initialReduction,
  emissionFactor,
  hasOwnCooling = true,
}: {
  kwh: number;
  tariff: TariffConfig;
  premises: PremisesType;
  surchargeRate: number;
  meterCharge: number;
  initialReduction: number;
  emissionFactor: EmissionFactor;
  hasOwnCooling?: boolean;
}) {
  const max = Math.round(kwh * 0.5);
  const clamp = (v: number) => Math.max(0, Math.min(max, Math.round(v)));
  const [reduction, setReduction] = useState(clamp(initialReduction));
  const [preset, setPreset] = useState("finding");
  const [capex, setCapex] = useState(0);
  const [showTrace, setShowTrace] = useState(false);
  const r = scenarioSaving(kwh, reduction, tariff, premises, surchargeRate, meterCharge);
  const pct = kwh > 0 ? (reduction / kwh) * 100 : 0;
  const co2 = emissionFactor.enabled ? reduction * emissionFactor.kgCo2ePerKwh : null;
  const crossesSlab = r.before.slabs.length !== r.after.slabs.length;
  const paybackMonths = capex > 0 && r.monthlySaving > 0 ? capex / r.monthlySaving : null;
  const presetInfo = PRESETS.find((p) => p.id === preset);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setPreset(p.id);
    setCapex(p.capexAed);
    setReduction(p.id === "finding" ? clamp(initialReduction) : clamp((kwh * p.pct) / 100));
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Pick a measure</div>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
          {PRESETS.filter((p) => !p.cooling || hasOwnCooling).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${preset === p.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white active:bg-amber-50"}`}
            >
              {p.label}
              {p.pct > 0 && <span className={`ml-1 text-xs ${preset === p.id ? "text-slate-300" : "text-slate-500"}`}>≈{p.pct}%</span>}
            </button>
          ))}
        </div>
        {presetInfo && <p className="mt-1 text-xs text-slate-500">{presetInfo.hint}</p>}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
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
        max={max}
        step={10}
        value={reduction}
        onChange={(e) => {
          setReduction(Number(e.target.value));
          setPreset("");
        }}
        className="w-full accent-amber-500"
      />
      <div className="flex gap-2 sm:hidden">
        {[-100, -10, 10, 100].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setReduction((v) => clamp(v + d));
              setPreset("");
            }}
            className="flex-1 rounded-md border border-slate-300 bg-white py-2 text-sm font-medium active:bg-amber-50"
          >
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-emerald-50 p-3">
          <div className="text-xs uppercase tracking-wide text-emerald-700">Monthly saving (scenario)</div>
          <div className="text-xl font-semibold text-emerald-800 sm:text-2xl">{fmtAed(r.monthlySaving)}</div>
        </div>
        <div className="rounded-md bg-emerald-50 p-3">
          <div className="text-xs uppercase tracking-wide text-emerald-700">Annualised (× 12)</div>
          <div className="text-xl font-semibold text-emerald-800 sm:text-2xl">{fmtAed(r.annualSaving)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
          One-off cost (AED)
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={capex}
            onChange={(e) => setCapex(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:text-sm"
          />
        </label>
        <div className="rounded-md border border-slate-200 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Payback</div>
          <div className="text-xl font-semibold sm:text-2xl">{paybackMonths === null ? (capex === 0 ? "Immediate" : "—") : paybackMonths < 1 ? "< 1 month" : `${paybackMonths.toFixed(1)} months`}</div>
          <div className="text-xs text-slate-500">{capex > 0 ? `12-month net: ${fmtAed(r.annualSaving - capex)}` : "no capex — operational change"}</div>
        </div>
      </div>
      <BillCompareChart before={parts(r.before)} after={parts(r.after)} />
      {co2 !== null && (
        <div className="text-sm text-slate-600">
          ≈ <b>{co2.toFixed(0)} kgCO₂e/month</b> avoided (location-based Scope 2 estimate, {emissionFactor.kgCo2ePerKwh} kgCO₂e/kWh, {emissionFactor.year}).
        </div>
      )}
      <p className="text-xs text-slate-500">
        Scenario, not a guaranteed saving. Uses the DEWA {premises} slab tariff with the fuel surcharge printed on this bill ({surchargeRate.toFixed(3)} AED/kWh) and 5% VAT.
        {crossesSlab && " The reduction crosses a slab boundary, so part of it is valued at the lower slab rate."}
      </p>
      <button type="button" onClick={() => setShowTrace((v) => !v)} className="py-1 text-sm text-amber-700 underline">
        {showTrace ? "Hide" : "Show"} calculation
      </button>
      {showTrace && (
        <table className="w-full text-sm">
          <tbody>
            {r.trace.map((l) => (
              <tr key={l.label} className="border-t border-slate-100">
                <td className="py-1 pr-2">
                  {l.label}
                  <div className="font-mono text-[11px] text-slate-500 sm:hidden">{l.formula}</div>
                </td>
                <td className="hidden py-1 pr-2 font-mono text-xs text-slate-500 sm:table-cell">{l.formula}</td>
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
