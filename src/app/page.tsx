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
      <div className="mx-auto max-w-xl space-y-6 pt-6 sm:pt-12">
        <Empty title="No bills yet">
          Upload DEWA electricity bills (PDF or CSV) for your branches, or load the prepared sample dataset — three branches, six months.
        </Empty>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/upload" className="rounded-md bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white sm:py-2">
            Upload bills
          </Link>
          <form action={loadSampleAction}>
            <button className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium sm:py-2">Load sample dataset</button>
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
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl">Portfolio</h1>
          <p className="text-sm text-slate-600">
            {store.sites.length} sites · {usable.length} bills · {monthLabel(months[0])} – {monthLabel(months[months.length - 1])}
          </p>
        </div>
        <Link href="/upload" className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white sm:py-1.5">
          Add bills
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
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
            height={220}
            series={summaries.map((s, i) => ({
              name: s.site.name.split(/ [—-] /)[0],
              color: PALETTE[i % PALETTE.length],
              points: s.months.map((m) => ({ billMonth: m.billMonth, value: m.kwhPerDay })),
            }))}
          />
        </Card>
        <div className="space-y-3">
          {summaries.map((s) => (
            <Link key={s.site.id} href={`/?site=${s.site.id}`} className={`block rounded-lg border bg-white p-3 active:bg-amber-50 hover:border-amber-400 ${filterSite === s.site.id ? "border-amber-400" : "border-slate-200"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate font-medium">{s.site.name}</div>
                {s.topSeverity && <SeverityBadge s={s.topSeverity} />}
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-sm text-slate-600">
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
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-lg font-semibold">Investigate first</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {[undefined, "high", "medium", "data-quality"].map((s) => (
              <Link
                key={s ?? "all"}
                href={`/?${new URLSearchParams({ ...(filterSite ? { site: filterSite } : {}), ...(s ? { severity: s } : {}) })}`}
                className={`rounded-full border px-3 py-1 ${filterSev === s ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}
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
