import Link from "next/link";
import { analyse, monthLabel, summarise } from "@/lib/analysis";
import { readStore } from "@/lib/store";
import { fmtAed } from "@/lib/tariff";
import { Card, Empty, FindingRow, SeverityBadge, Stat } from "@/components/ui";
import { PALETTE, TrendChart } from "@/components/TrendChart";
import { loadSampleAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const store = readStore();
  if (store.bills.length === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-6 pt-12">
        <Empty title="No bills yet">
          Upload DEWA electricity bills (PDF or CSV) for your branches, or load the prepared sample dataset — three branches, six months.
        </Empty>
        <div className="flex justify-center gap-3">
          <Link href="/upload" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Upload bills
          </Link>
          <form action={loadSampleAction}>
            <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium">Load sample dataset</button>
          </form>
        </div>
      </div>
    );
  }

  const findings = analyse(store.sites, store.bills, store.settings);
  const summaries = summarise(store.sites, store.bills, findings);
  const filterSite = typeof sp.site === "string" ? sp.site : undefined;
  const filterSev = typeof sp.severity === "string" ? sp.severity : undefined;
  const shown = findings.filter((f) => (!filterSite || f.siteId === filterSite) && (!filterSev || f.severity === filterSev));

  const usable = store.bills.filter((b) => b.status !== "duplicate");
  const months = [...new Set(usable.map((b) => b.billMonth))].sort();
  const totalAed = usable.reduce((a, b) => a + b.totalAed, 0);
  const totalKwh = usable.reduce((a, b) => a + b.kwh, 0);
  const excess = findings.filter((f) => f.severity !== "data-quality").reduce((a, f) => a + f.excessAed, 0);
  const co2 = store.settings.emissionFactor.enabled ? (totalKwh * store.settings.emissionFactor.kgCo2ePerKwh) / 1000 : null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          <p className="text-sm text-slate-600">
            {store.sites.length} sites · {usable.length} bills · {monthLabel(months[0])} – {monthLabel(months[months.length - 1])}
          </p>
        </div>
        <Link href="/upload" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
          Add bills
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total spend" value={fmtAed(totalAed)} sub={`${totalKwh.toLocaleString()} kWh`} />
        <Stat
          label="Excess flagged"
          value={fmtAed(excess)}
          sub="est. above baseline / band, per flagged month"
        />
        <Stat label="Findings" value={findings.length} sub={`${findings.filter((f) => f.severity === "high").length} high · ${findings.filter((f) => f.severity === "data-quality").length} data quality`} />
        <Stat
          label="Scope 2 (location-based)"
          value={co2 !== null ? `${co2.toFixed(1)} tCO₂e` : "—"}
          sub={co2 !== null ? `${store.settings.emissionFactor.kgCo2ePerKwh} kgCO₂e/kWh, DEWA ${store.settings.emissionFactor.year}` : "Enable an emission factor in Settings"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-2 text-sm font-medium">Consumption per day by site</div>
          <TrendChart
            series={summaries.map((s, i) => ({
              name: s.site.name.split(" — ")[0],
              color: PALETTE[i % PALETTE.length],
              points: s.months.map((m) => ({ billMonth: m.billMonth, value: m.kwhPerDay })),
            }))}
          />
        </Card>
        <div className="space-y-3">
          {summaries.map((s) => (
            <Link key={s.site.id} href={`/?site=${s.site.id}`} className={`block rounded-lg border bg-white p-3 hover:border-amber-400 ${filterSite === s.site.id ? "border-amber-400" : "border-slate-200"}`}>
              <div className="flex items-center justify-between">
                <div className="font-medium">{s.site.name}</div>
                {s.topSeverity && <SeverityBadge s={s.topSeverity} />}
              </div>
              <div className="mt-1 flex justify-between text-sm text-slate-600">
                <span>{s.lastKwh.toLocaleString()} kWh last month</span>
                <span className={s.deltaPct !== null && s.deltaPct >= 20 ? "font-medium text-red-700" : ""}>
                  {s.deltaPct !== null ? `${s.deltaPct > 0 ? "+" : ""}${s.deltaPct.toFixed(0)}% vs baseline` : "no baseline"}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {fmtAed(s.totalAed)} total · {s.findingCount} finding{s.findingCount === 1 ? "" : "s"}
                {s.site.areaSqm ? ` · ${(s.totalKwh / s.months.length / s.site.areaSqm).toFixed(1)} kWh/m²/month` : ""}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-semibold">Investigate first</h2>
          <div className="flex gap-2 text-xs">
            {[undefined, "high", "medium", "data-quality"].map((s) => (
              <Link
                key={s ?? "all"}
                href={`/?${new URLSearchParams({ ...(filterSite ? { site: filterSite } : {}), ...(s ? { severity: s } : {}) })}`}
                className={`rounded-full border px-2 py-0.5 ${filterSev === s ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}
              >
                {s ?? "all"}
              </Link>
            ))}
          </div>
          {filterSite && (
            <Link href="/" className="text-xs text-amber-700 underline">
              clear site filter
            </Link>
          )}
        </div>
        {shown.length === 0 ? (
          <Empty title="Nothing to investigate">No findings match the current filters.</Empty>
        ) : (
          <div className="space-y-2">
            {shown.map((f) => (
              <FindingRow key={f.id} f={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
