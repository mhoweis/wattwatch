import Link from "next/link";
import { notFound } from "next/navigation";
import { analyse, kwhPerDay, monthLabel, periodDays } from "@/lib/analysis";
import { readStore } from "@/lib/store";
import { fmtAed, round2 } from "@/lib/tariff";
import { Card, SeverityBadge, typeLabel } from "@/components/ui";
import { TrendChart } from "@/components/TrendChart";
import { ScenarioSlider } from "@/components/ScenarioSlider";
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
  const isConsumption = f.severity !== "data-quality";
  const explanation = store.explanations[f.id];

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">
          Dashboard
        </Link>{" "}
        / {typeLabel[f.type]}
      </div>
      <div className="flex items-start gap-3">
        <SeverityBadge s={f.severity} />
        <div>
          <h1 className="text-2xl font-semibold">{f.headline}</h1>
          <p className="mt-1 text-slate-600">{f.whyHint}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-sm font-medium">{site.name} — kWh per day</div>
            {baselinePerDay !== undefined && <div className="text-xs text-slate-500">Baseline (median of prior months): {baselinePerDay} kWh/day</div>}
          </div>
          <TrendChart
            series={[
              { name: "kWh/day", color: "#f59e0b", points: siteBills.map((b) => ({ billMonth: b.billMonth, value: round2(kwhPerDay(b)) })) },
              ...(baselinePerDay !== undefined ? [{ name: "baseline", color: "#94a3b8", points: siteBills.map((b) => ({ billMonth: b.billMonth, value: baselinePerDay })) }] : []),
            ]}
          />
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
          />
        </Card>
      )}

      <Card>
        <div className="mb-3 text-sm font-medium">Evidence bills</div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Month</th>
              <th>Period</th>
              <th className="text-right">kWh</th>
              <th className="text-right">kWh/day</th>
              <th className="text-right">Surcharge</th>
              <th className="text-right">Total</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="py-1.5">
                  <Link href={`/bills/${b.id}`} className="text-amber-700 underline">
                    {monthLabel(b.billMonth)}
                  </Link>
                  {b.status === "duplicate" && <span className="ml-2 text-xs text-sky-700">duplicate</span>}
                </td>
                <td className="text-slate-600">
                  {b.periodStart} → {b.periodEnd} ({periodDays(b)} d)
                </td>
                <td className="text-right font-mono">{b.kwh.toLocaleString()}</td>
                <td className="text-right font-mono">{round2(kwhPerDay(b))}</td>
                <td className="text-right font-mono">{b.fuelSurchargeRate.toFixed(3)}</td>
                <td className="text-right font-mono">{fmtAed(b.totalAed)}</td>
                <td className="text-xs text-slate-500">
                  {b.extractionMethod} · {(b.extractionConfidence * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ExplainPanel findingId={f.id} initial={explanation ?? null} />
    </div>
  );
}
