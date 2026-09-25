"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { monthLabel } from "@/lib/analysis";

export interface TrendSeries {
  name: string;
  color: string;
  points: { billMonth: string; value: number }[];
}

const PALETTE = ["#f59e0b", "#0ea5e9", "#10b981", "#8b5cf6", "#ef4444", "#64748b"];

export function TrendChart({ series, unit = "kWh/day", height = 260 }: { series: TrendSeries[]; unit?: string; height?: number }) {
  const months = [...new Set(series.flatMap((s) => s.points.map((p) => p.billMonth)))].sort();
  const data = months.map((m) => {
    const row: Record<string, string | number | null> = { month: monthLabel(m).replace(/ \d{4}$/, "") };
    for (const s of series) row[s.name] = s.points.find((p) => p.billMonth === m)?.value ?? null;
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} width={48} />
        <Tooltip formatter={(v) => `${v} ${unit}`} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color || PALETTE[i % PALETTE.length]} strokeWidth={2} dot connectNulls={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export { PALETTE };
