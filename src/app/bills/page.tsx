import Link from "next/link";
import { kwhPerDay, monthLabel, periodDays } from "@/lib/analysis";
import { readStore } from "@/lib/store";
import { fmtAed, round2 } from "@/lib/tariff";
import { Card, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function BillsPage() {
  const store = readStore();
  const siteName = new Map(store.sites.map((s) => [s.id, s.name]));
  const bills = [...store.bills].sort((a, b) => a.siteId.localeCompare(b.siteId) || a.billMonth.localeCompare(b.billMonth));
  if (bills.length === 0) return <Empty title="No bills">Upload bills or load the sample dataset first.</Empty>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Bills</h1>
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Site</th>
              <th>Month</th>
              <th>Period</th>
              <th className="text-right">kWh</th>
              <th className="text-right">kWh/day</th>
              <th className="text-right">Total</th>
              <th>Status</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="py-1.5">{siteName.get(b.siteId) ?? b.siteId}</td>
                <td>
                  <Link href={`/bills/${b.id}`} className="text-amber-700 underline">
                    {monthLabel(b.billMonth)}
                  </Link>
                </td>
                <td className="text-slate-600">
                  {b.periodStart} → {b.periodEnd} ({periodDays(b)} d)
                </td>
                <td className="text-right font-mono">{b.kwh.toLocaleString()}</td>
                <td className="text-right font-mono">{round2(kwhPerDay(b))}</td>
                <td className="text-right font-mono">{fmtAed(b.totalAed)}</td>
                <td>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${b.status === "ok" ? "bg-emerald-100 text-emerald-800" : b.status === "duplicate" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}>{b.status}</span>
                </td>
                <td className="text-xs text-slate-500">
                  {b.extractionMethod} · {(b.extractionConfidence * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
