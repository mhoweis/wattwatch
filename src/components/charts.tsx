"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { monthLabel } from "@/lib/analysis";
import { fmtAed } from "@/lib/tariff";
import { PALETTE } from "./TrendChart";

const tick = { fontSize: 11 };
const shortMonth = (m: string) => monthLabel(m).replace(/ \d{4}$/, "");

/** kWh/day per month split into the part within baseline and the excess above it. */
export function ExcessChart({
  points,
  baseline,
  height = 220,
}: {
  points: { billMonth: string; value: number; highlight?: boolean }[];
  baseline: number | null;
  height?: number;
}) {
  const data = points.map((p) => {
    const within = baseline === null ? p.value : Math.min(p.value, baseline);
    const excess = baseline === null ? 0 : Math.max(0, p.value - baseline);
    return { month: shortMonth(p.billMonth), within: Number(within.toFixed(2)), excess: Number(excess.toFixed(2)), highlight: p.highlight ?? false };
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tick={tick} interval={0} />
        <YAxis tick={tick} width={48} />
        <Tooltip formatter={(v) => `${v} kWh/day`} />
        <Bar isAnimationActive={false} dataKey="within" stackId="a" name="within baseline" radius={[0, 0, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.highlight ? "#f59e0b" : "#cbd5e1"} />
          ))}
        </Bar>
        <Bar isAnimationActive={false} dataKey="excess" stackId="a" name="above baseline" fill="#ef4444" radius={[4, 4, 0, 0]} />
        {baseline !== null && <ReferenceLine y={baseline} stroke="#334155" strokeDasharray="4 4" label={{ value: `baseline ${baseline}`, position: "insideTopLeft", fontSize: 11, fill: "#334155" }} />}
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Grouped bars: each site's kWh/day per month, with the focus site in amber. */
export function PeerChart({ months, sites, focus, height = 220 }: { months: string[]; sites: { name: string; values: (number | null)[] }[]; focus: string; height?: number }) {
  const data = months.map((m, i) => {
    const row: Record<string, string | number | null> = { month: shortMonth(m) };
    for (const s of sites) row[s.name] = s.values[i];
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tick={tick} interval={0} />
        <YAxis tick={tick} width={48} />
        <Tooltip formatter={(v) => `${v} kWh/day`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {sites.map((s, i) => (
          <Bar isAnimationActive={false} key={s.name} dataKey={s.name} fill={s.name === focus ? "#f59e0b" : ["#94a3b8", "#64748b", "#cbd5e1", "#475569"][i % 4]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Printed total vs recomputation under each tariff category. */
export function MismatchChart({ bars, height = 200 }: { bars: { label: string; value: number; kind: "printed" | "match" | "expected" }[]; height?: number }) {
  const color = { printed: "#ef4444", match: "#f59e0b", expected: "#10b981" };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={tick} tickFormatter={(v: number) => `${Math.round(v)}`} />
        <YAxis type="category" dataKey="label" tick={tick} width={150} />
        <Tooltip formatter={(v) => fmtAed(Number(v))} />
        <Bar isAnimationActive={false} dataKey="value" radius={[0, 4, 4, 0]}>
          {bars.map((b, i) => (
            <Cell key={i} fill={color[b.kind]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal stacked bars: AED at stake per site, efficiency excess vs recoverable billing errors. */
export function StakeChart({ rows, height }: { rows: { name: string; efficiencyAed: number; recoverableAed: number }[]; height?: number }) {
  const data = rows.map((r) => ({ ...r, name: r.name.split(/ [—-] /)[0] }));
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, 36 * data.length + 60)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={tick} tickFormatter={(v: number) => `${Math.round(v).toLocaleString()}`} />
        <YAxis type="category" dataKey="name" tick={tick} width={90} />
        <Tooltip formatter={(v, name) => [fmtAed(Number(v)), name === "efficiencyAed" ? "excess consumption" : "billing error (refundable)"]} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "efficiencyAed" ? "excess consumption" : "billing error (refundable)")} />
        <Bar isAnimationActive={false} dataKey="efficiencyAed" stackId="a" fill="#f59e0b" />
        <Bar isAnimationActive={false} dataKey="recoverableAed" stackId="a" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Current vs scenario bill, stacked by charge component. */
export function BillCompareChart({ before, after, height = 160 }: { before: BillParts; after: BillParts; height?: number }) {
  const data = [
    { name: "Current bill", ...before },
    { name: "After reduction", ...after },
  ];
  const keys: (keyof BillParts)[] = ["energy", "surcharge", "meter", "vat"];
  const labels: Record<keyof BillParts, string> = { energy: "slab energy", surcharge: "fuel surcharge", meter: "meter", vat: "VAT" };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <XAxis type="number" tick={tick} tickFormatter={(v: number) => `${Math.round(v).toLocaleString()}`} />
        <YAxis type="category" dataKey="name" tick={tick} width={100} />
        <Tooltip formatter={(v, name) => [fmtAed(Number(v)), labels[name as keyof BillParts]]} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => labels[v as keyof BillParts]} />
        {keys.map((k, i) => (
          <Bar isAnimationActive={false} key={k} dataKey={k} stackId="a" fill={PALETTE[i % PALETTE.length]} radius={i === keys.length - 1 ? [0, 4, 4, 0] : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface BillParts {
  energy: number;
  surcharge: number;
  meter: number;
  vat: number;
}
