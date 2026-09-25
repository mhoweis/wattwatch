import Link from "next/link";
import { notFound } from "next/navigation";
import { analyse, kwhPerDay, monthLabel, periodDays, realisedSaving } from "@/lib/analysis";
import { readStore } from "@/lib/store";
import { fmtAed, round2 } from "@/lib/tariff";
import { Card, SeverityBadge, typeLabel } from "@/components/ui";
import { TrendChart } from "@/components/TrendChart";
import { ExcessChart, MismatchChart, PeerChart } from "@/components/charts";
import { ScenarioSlider } from "@/components/ScenarioSlider";
import { ContractorPanel } from "@/components/ContractorPanel";
import { ActionTracker } from "@/components/ActionTracker";
import { ExplainPanel } from "./ExplainPanel";

export const dynamic = "force-dynamic";

export default async function FindingPage({ params }: PageProps<"/findings/[id]">) {
  const { id } = await params;
  const findingId = decodeURIComponent(id);
  const store = readStore();
  const findings = analyse(store.sites, store.bills, store.settings);
  const f = findings.find((x) => x.id === findingId);
  if (!f) notFound();
  const site = store.sites.find((s) => s.id === f.siteId);
  if (!site) notFound();

  const evidence = f.evidenceBillIds.map((bid) => store.bills.find((b) => b.id === bid)).filter((b) => b !== undefined);
  const siteBills = store.bills.filter((b) => b.siteId === site.id && b.status !== "duplicate").sort((a, b) => a.billMonth.localeCompare(b.billMonth));
  const focusBill = evidence[0] ?? siteBills[siteBills.length - 1];
  const baselinePerDay = f.metrics.baselineKwhPerDay;
  const isConsumption = f.type === "SPIKE_VS_BASELINE" || f.type === "SUSTAINED_DRIFT" || f.type === "SLAB_BAND_JUMP" || f.type === "PEER_OUTLIER";
  const explanation = store.explanations[f.id];
  const evidenceIds = new Set(f.evidenceBillIds);
  const record = store.actions[f.id];
  const realised = isConsumption ? realisedSaving(f, site, store.bills, store.settings, record?.targetKwh) : null;

  const peerMonths = [...new Set(evidence.map((b) => b.billMonth))].sort();
  const peerSites = store.sites
    .filter((s) => s.premisesType === site.premisesType)
    .map((s) => ({
      name: s.name.split(/ [—-] /)[0],
      values: peerMonths.map((m) => {
        const b = store.bills.find((x) => x.siteId === s.id && x.billMonth === m && x.status === "ok");
        return b ? round2(kwhPerDay(b)) : null;
      }),
    }));
  const otherType = site.premisesType === "industrial" ? "commercial" : "industrial";
  const mismatchBars =
    f.type === "TOTAL_MISMATCH" && focusBill
      ? [
          { label: "Printed on bill", value: f.metrics.printed, kind: "printed" as const },
          { label: `Correct (${site.premisesType} tariff)`, value: f.metrics.recomputed, kind: "expected" as const },
          ...(f.calcTrace[3] ? [{ label: `If billed as ${otherType}`, value: f.calcTrace[3].value, kind: "match" as const }] : []),
        ]
      : null;

  const chartTitle =
    f.type === "PEER_OUTLIER" ? "kWh per day vs comparable branches" : f.type === "TOTAL_MISMATCH" ? "Printed total vs tariff recomputation" : `${site.name} — kWh per day, excess above baseline in red`;

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">
          Dashboard
        </Link>{" "}
        / {typeLabel[f.type]}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div>
          <SeverityBadge s={f.severity} />
        </div>
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">{f.headline}</h1>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">{f.whyHint}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
            <div className="text-sm font-medium">{chartTitle}</div>
            {baselinePerDay !== undefined && <div className="text-xs text-slate-500">Baseline (median of prior months): {baselinePerDay} kWh/day</div>}
          </div>
          {f.type === "PEER_OUTLIER" ? (
            <PeerChart height={220} months={peerMonths} sites={peerSites} focus={site.name.split(/ [—-] /)[0]} />
          ) : mismatchBars ? (
            <MismatchChart bars={mismatchBars} />
          ) : isConsumption ? (
            <ExcessChart
              height={220}
              baseline={baselinePerDay ?? (f.type === "SUSTAINED_DRIFT" && f.calcTrace[0] ? f.calcTrace[0].value : null)}
              points={siteBills.map((b) => ({ billMonth: b.billMonth, value: round2(kwhPerDay(b)), highlight: evidenceIds.has(b.id) }))}
            />
          ) : (
            <TrendChart height={220} series={[{ name: "kWh/day", color: "#f59e0b", points: siteBills.map((b) => ({ billMonth: b.billMonth, value: round2(kwhPerDay(b)) })) }]} />
          )}
        </Card>
        <Card>
          <div className="mb-2 text-sm font-medium">Calculation</div>
          {f.calcTrace.length === 0 ? (
            <p className="text-sm text-slate-500">No arithmetic — this is a data-quality check.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {f.calcTrace.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="py-1 pr-2">
                      <div>{l.label}</div>
                      <div className="font-mono text-[11px] text-slate-500">{l.formula}</div>
                    </td>
                    <td className="py-1 text-right font-mono whitespace-nowrap">{l.unit === "AED" ? fmtAed(l.value) : `${l.value.toLocaleString()} ${l.unit}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {isConsumption && focusBill && (
        <Card>
          <div className="mb-3 text-sm font-medium">Savings scenario — {monthLabel(focusBill.billMonth)} bill as the base</div>
          <ScenarioSlider
            kwh={focusBill.kwh}
            tariff={store.settings.tariff}
            premises={site.premisesType}
            surchargeRate={focusBill.fuelSurchargeRate}
            meterCharge={focusBill.meterCharge}
            initialReduction={f.excessKwh > 0 ? f.excessKwh : focusBill.kwh * 0.1}
            emissionFactor={store.settings.emissionFactor}
            hasOwnCooling={site.hasOwnCooling}
          />
        </Card>
      )}

      <Card>
        <div className="mb-3 text-sm font-medium">Evidence bills</div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Month</th>
              <th className="hidden md:table-cell">Period</th>
              <th className="text-right">kWh</th>
              <th className="text-right">kWh/day</th>
              <th className="hidden text-right sm:table-cell">Surcharge</th>
              <th className="text-right">Total</th>
              <th className="hidden md:table-cell">Source</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="py-1.5">
                  <Link href={`/bills/${b.id}`} className="text-amber-700 underline">
                    {monthLabel(b.billMonth)}
                  </Link>
                  {b.status === "duplicate" && <span className="ml-1 text-xs text-sky-700 sm:ml-2">dup</span>}
                </td>
                <td className="hidden text-slate-600 md:table-cell">
                  {b.periodStart} → {b.periodEnd} ({periodDays(b)} d)
                </td>
                <td className="text-right font-mono">{b.kwh.toLocaleString()}</td>
                <td className="text-right font-mono">{round2(kwhPerDay(b))}</td>
                <td className="hidden text-right font-mono sm:table-cell">{b.fuelSurchargeRate.toFixed(3)}</td>
                <td className="text-right font-mono">{fmtAed(b.totalAed)}</td>
                <td className="hidden text-xs text-slate-500 md:table-cell">
                  {b.extractionMethod} · {(b.extractionConfidence * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ActionTracker finding={f} record={record} realised={realised} isConsumption={isConsumption} />

      <ExplainPanel findingId={f.id} initial={explanation ?? null} />
      <ContractorPanel finding={f} site={site} contractors={store.contractors} />
    </div>
  );
}
