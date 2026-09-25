import Link from "next/link";
import { actionPlan, analyse, costOfInaction, moneyAtStake, monthLabel, realisedByMonth, realisedSaving, summarise } from "@/lib/analysis";
import { StatusPill } from "@/components/ActionTracker";
import { readStore } from "@/lib/store";
import { fmtAed } from "@/lib/tariff";
import { Card, Empty, FindingRow, SeverityBadge, Stat } from "@/components/ui";
import { PALETTE, TrendChart } from "@/components/TrendChart";
import { StakeChart } from "@/components/charts";
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
  const stake = moneyAtStake(store.sites, findings);
  const co2 = store.settings.emissionFactor.enabled ? (totalKwh * store.settings.emissionFactor.kgCo2ePerKwh) / 1000 : null;
  const inactionBySite = new Map<string, number>();
  for (const f of findings) {
    if (!["SPIKE_VS_BASELINE", "SUSTAINED_DRIFT", "SLAB_BAND_JUMP", "PEER_OUTLIER"].includes(f.type) || store.actions[f.id]?.status === "done") continue;
    const site = store.sites.find((s) => s.id === f.siteId);
    if (!site) continue;
    const cost = costOfInaction(f, site, store.bills, store.settings).aed;
    inactionBySite.set(f.siteId, Math.max(inactionBySite.get(f.siteId) ?? 0, cost));
  }
  const lostSinceDetected = [...inactionBySite.values()].reduce((sum, value) => sum + value, 0);

  const realisedById = new Map(
    findings.map((f) => {
      const site = store.sites.find((s) => s.id === f.siteId);
      const rec = store.actions[f.id];
      return [f.id, site && rec?.status === "done" ? realisedSaving(f, site, store.bills, store.settings, rec.targetKwh) : null] as const;
    }),
  );
  const verifiedAed = [...realisedById.values()].reduce((a, r) => a + Math.max(0, r?.realisedAed ?? 0), 0);
  const doneCount = findings.filter((f) => store.actions[f.id]?.status === "done").length;
  const inProgress = findings.filter((f) => store.actions[f.id]?.status === "assigned").length;
  const plan = actionPlan(store.sites, findings, store.actions);
  const doneConsumption = findings.filter((f) => ["SPIKE_VS_BASELINE", "SUSTAINED_DRIFT", "SLAB_BAND_JUMP", "PEER_OUTLIER"].includes(f.type) && store.actions[f.id]?.status === "done");
  const savingsByMonth = new Map<string, number>();
  for (const f of doneConsumption) {
    const site = store.sites.find((s) => s.id === f.siteId);
    if (!site) continue;
    for (const point of realisedByMonth(f, site, store.bills, store.settings)) savingsByMonth.set(point.billMonth, (savingsByMonth.get(point.billMonth) ?? 0) + point.aed);
  }
  const savingsHistory = [...savingsByMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).reduce<{ billMonth: string; value: number }[]>((history, [billMonth, value]) => {
    const previous = history[history.length - 1]?.value ?? 0;
    return [...history, { billMonth, value: previous + value }];
  }, []);

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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-6">
        <Stat label="Total spend" value={fmtAed(totalAed)} sub={`${totalKwh.toLocaleString()} kWh`} />
        <Stat label="Efficiency opportunity" value={fmtAed(stake.efficiencyMonthlyAed)} sub={`/month · ${fmtAed(stake.efficiencyAnnualAed)} annualised (scenario)`} />
        <Stat label="Refund to claim" value={fmtAed(stake.recoverableAed)} sub={stake.recoverableAed > 0 ? "billing errors to dispute with DEWA" : "no billing errors found"} />
        <Stat
          label="Verified saved"
          value={fmtAed(verifiedAed)}
          sub={doneCount > 0 ? `${doneCount} action${doneCount === 1 ? "" : "s"} done · ${inProgress} in progress · measured on the next bill` : inProgress > 0 ? `${inProgress} action${inProgress === 1 ? "" : "s"} in progress` : "mark actions done on a finding to track realised savings"}
        />
        <Stat label="Lost since detected" value={fmtAed(lostSinceDetected)} sub="excess paid after the finding first appeared" />
        <Stat
          label="Scope 2 (location-based)"
          value={co2 !== null ? `${co2.toFixed(1)} tCO₂e` : "—"}
          sub={co2 !== null ? `${store.settings.emissionFactor.kgCo2ePerKwh} kgCO₂e/kWh, DEWA ${store.settings.emissionFactor.year}` : "Enable an emission factor in Settings"}
        />
      </div>

      {stake.bySite.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <div className="text-sm font-medium">Money at stake by site (AED)</div>
            <div className="text-xs text-slate-500">
              {findings.length} finding{findings.length === 1 ? "" : "s"} · {findings.filter((f) => f.severity === "high").length} high · {findings.filter((f) => f.severity === "data-quality").length} data quality
            </div>
          </div>
          <p className="mb-1 text-xs text-slate-500">Excess consumption = cost above baseline/band across flagged months (largest finding per site-month). Billing errors = printed total above the correct tariff, claimable once.</p>
          <StakeChart rows={stake.bySite} />
        </Card>
      )}

      {plan.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="text-sm font-medium">Action plan — ranked by payback</div>
            <Link href="/api/plan.csv" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:border-slate-500">
              Export CSV
            </Link>
          </div>
          <div className="mt-3 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1 pr-3">Action</th>
                  <th className="pr-3">Site</th>
                  <th className="pr-3 text-right">AED/month</th>
                  <th className="pr-3 text-right">AED/year</th>
                  <th className="pr-3 text-right">Capex</th>
                  <th className="pr-3 text-right">Payback</th>
                  <th className="pr-3">Owner</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((row) => (
                  <tr key={row.findingId} className="border-t border-slate-100">
                    <td className="py-2 pr-3">
                      <Link href={`/findings/${encodeURIComponent(row.findingId)}`} className="font-medium text-amber-700 hover:underline">{row.action}</Link>
                    </td>
                    <td className="pr-3">{row.siteName}</td>
                    <td className="pr-3 text-right font-mono">{fmtAed(row.monthlyAed)}</td>
                    <td className="pr-3 text-right font-mono">{fmtAed(row.annualAed)}</td>
                    <td className="pr-3 text-right font-mono">{fmtAed(row.capexAed)}</td>
                    <td className="pr-3 text-right">{row.paybackMonths === null ? "—" : row.paybackMonths === 0 ? "Immediate" : `${row.paybackMonths.toFixed(1)} mo`}</td>
                    <td className="pr-3 text-slate-600">{row.owner ?? "—"}</td>
                    <td><StatusPill status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-2 sm:hidden">
            {plan.map((row) => (
              <li key={row.findingId}>
                <Link href={`/findings/${encodeURIComponent(row.findingId)}`} className="block rounded-lg border border-slate-200 p-3 active:bg-amber-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium">{row.action}</div>
                    <StatusPill status={row.status} />
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{row.siteName}</div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>AED/month <strong className="font-mono text-slate-700">{fmtAed(row.monthlyAed)}</strong></span>
                    <span>AED/year <strong className="font-mono text-slate-700">{fmtAed(row.annualAed)}</strong></span>
                    <span>Capex <strong className="font-mono text-slate-700">{fmtAed(row.capexAed)}</strong></span>
                    <span>Payback <strong className="text-slate-700">{row.paybackMonths === null ? "—" : row.paybackMonths === 0 ? "Immediate" : `${row.paybackMonths.toFixed(1)} mo`}</strong></span>
                  </div>
                  {(row.owner || row.dueDate) && <div className="mt-2 text-xs text-slate-500">{row.owner ?? "Unassigned"}{row.dueDate ? ` · due ${row.dueDate}` : ""}</div>}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-slate-100 pt-3 text-sm font-medium">Total annual opportunity: {fmtAed(plan.reduce((sum, row) => sum + row.annualAed, 0))}</div>
        </Card>
      )}

      {doneConsumption.length > 0 && (
        <Card>
          <div className="text-sm font-medium">Verified savings to date</div>
          <TrendChart height={220} unit="AED" series={[{ name: "Cumulative saving", color: "#059669", points: savingsHistory }]} />
          <p className="text-xs text-slate-500">Cumulative realised saving vs each finding&apos;s flagged run-rate, from actions marked done</p>
        </Card>
      )}

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
              <FindingRow key={f.id} f={f} status={store.actions[f.id] ? <StatusPill status={store.actions[f.id].status} realised={realisedById.get(f.id)} /> : undefined} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
