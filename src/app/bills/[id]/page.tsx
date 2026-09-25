import Link from "next/link";
import { notFound } from "next/navigation";
import { kwhPerDay, monthLabel, periodDays } from "@/lib/analysis";
import { readStore } from "@/lib/store";
import { calcBill, fmtAed, round2 } from "@/lib/tariff";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function BillPage({ params }: PageProps<"/bills/[id]">) {
  const { id } = await params;
  const store = readStore();
  const b = store.bills.find((x) => x.id === id);
  if (!b) notFound();
  const site = store.sites.find((s) => s.id === b.siteId);
  if (!site) notFound();
  const file = b.sourceFileId ? store.files.find((f) => f.id === b.sourceFileId) : undefined;
  const recomputed = calcBill(b.kwh, store.settings.tariff, site.premisesType, b.fuelSurchargeRate, b.meterCharge);
  const printed = b.printedTotalAed ?? b.totalAed;
  const delta = round2(printed - recomputed.total);
  const ef = store.settings.emissionFactor;

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-500">
        <Link href="/bills" className="hover:underline">
          Bills
        </Link>{" "}
        / {site.name} / {monthLabel(b.billMonth)}
      </div>
      <h1 className="text-xl font-semibold sm:text-2xl">
        {site.name} — {monthLabel(b.billMonth)}
      </h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-2 text-sm font-medium">As read from the bill</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <dt className="text-slate-500">Account</dt>
            <dd className="font-mono">{b.accountNo}</dd>
            <dt className="text-slate-500">Period</dt>
            <dd className="break-words">
              {b.periodStart} → {b.periodEnd} ({periodDays(b)} days)
            </dd>
            <dt className="text-slate-500">Consumption</dt>
            <dd className="font-mono text-xs sm:text-sm">
              {b.kwh.toLocaleString()} kWh ({round2(kwhPerDay(b))} kWh/day)
            </dd>
            <dt className="text-slate-500">Fuel surcharge rate</dt>
            <dd className="font-mono">{b.fuelSurchargeRate.toFixed(3)} AED/kWh</dd>
            <dt className="text-slate-500">Meter charge</dt>
            <dd className="font-mono">{fmtAed(b.meterCharge)}</dd>
            <dt className="text-slate-500">VAT</dt>
            <dd className="font-mono">{fmtAed(b.vatAmount)}</dd>
            <dt className="text-slate-500">Printed total</dt>
            <dd className="font-mono font-semibold">{fmtAed(printed)}</dd>
            <dt className="text-slate-500">Status</dt>
            <dd>{b.status}</dd>
            <dt className="text-slate-500">Extraction</dt>
            <dd>
              {b.extractionMethod} · confidence {(b.extractionConfidence * 100).toFixed(0)}%
            </dd>
            {file && (
              <>
                <dt className="text-slate-500">Source file</dt>
                <dd>{file.filename}</dd>
              </>
            )}
            {ef.enabled && (
              <>
                <dt className="text-slate-500">Scope 2 (location-based)</dt>
                <dd className="font-mono">{(b.kwh * ef.kgCo2ePerKwh).toFixed(0)} kgCO₂e</dd>
              </>
            )}
          </dl>
          {b.notes && b.notes.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-xs text-amber-700">
              {b.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {b.fieldSources && (
            <details className="mt-3 text-xs text-slate-500">
              <summary className="cursor-pointer">Field provenance</summary>
              <ul className="mt-1 space-y-0.5 font-mono">
                {Object.entries(b.fieldSources).map(([k, v]) => (
                  <li key={k}>
                    <b>{k}</b>: {v}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
        <Card>
          <div className="mb-2 text-sm font-medium">Recomputed from DEWA tariff ({site.premisesType})</div>
          <table className="w-full text-sm">
            <tbody>
              {recomputed.slabs.map((s) => (
                <tr key={s.from} className="border-t border-slate-100">
                  <td className="py-1">
                    Slab {s.from.toLocaleString()}–{s.to === null ? "∞" : s.to.toLocaleString()} kWh
                  </td>
                  <td className="text-right font-mono text-xs text-slate-500">
                    {s.kwh} × {s.rate}
                  </td>
                  <td className="text-right font-mono">{fmtAed(s.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-100">
                <td className="py-1">Fuel surcharge</td>
                <td className="text-right font-mono text-xs text-slate-500">
                  {b.kwh} × {recomputed.surchargeRate}
                </td>
                <td className="text-right font-mono">{fmtAed(recomputed.surcharge)}</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="py-1">Meter charge</td>
                <td></td>
                <td className="text-right font-mono">{fmtAed(recomputed.meterCharge)}</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="py-1">VAT 5%</td>
                <td></td>
                <td className="text-right font-mono">{fmtAed(recomputed.vat)}</td>
              </tr>
              <tr className="border-t border-slate-200 font-semibold">
                <td className="py-1">Recomputed total</td>
                <td></td>
                <td className="text-right font-mono">{fmtAed(recomputed.total)}</td>
              </tr>
              <tr className={Math.abs(delta) > store.settings.thresholds.totalMismatchAed ? "text-red-700" : "text-emerald-700"}>
                <td className="py-1">Printed − recomputed</td>
                <td></td>
                <td className="text-right font-mono">{fmtAed(delta)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            Tariff source:{" "}
            <a href={store.settings.tariff.sourceUrl} className="underline" target="_blank" rel="noreferrer">
              DEWA slab tariff
            </a>
            . Surcharge as printed on the bill.
          </p>
        </Card>
      </div>
    </div>
  );
}
