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
  const statusStyle = (s: string) => (s === "ok" ? "bg-emerald-100 text-emerald-800" : s === "duplicate" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold sm:text-2xl">Bills</h1>
      <ul className="space-y-2 md:hidden">
        {bills.map((b) => (
          <li key={b.id}>
            <Link href={`/bills/${b.id}`} className="block rounded-lg border border-slate-200 bg-white p-3 active:bg-amber-50">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-medium">{siteName.get(b.siteId) ?? b.siteId}</div>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${statusStyle(b.status)}`}>{b.status}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-amber-700">{monthLabel(b.billMonth)}</span>
                <span className="font-mono font-semibold">{fmtAed(b.totalAed)}</span>
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-slate-500">
                <span>
                  {b.kwh.toLocaleString()} kWh · {round2(kwhPerDay(b))} kWh/day · {periodDays(b)} d
                </span>
                <span>
                  {b.extractionMethod} · {(b.extractionConfidence * 100).toFixed(0)}%
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Card className="hidden md:block">
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
                  <span className={`rounded px-1.5 py-0.5 text-xs ${statusStyle(b.status)}`}>{b.status}</span>
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
