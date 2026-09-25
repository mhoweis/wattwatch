import Link from "next/link";
import { monthLabel, type InactionCost, type RealisedSaving } from "@/lib/analysis";
import { fmtAed } from "@/lib/tariff";
import type { ActionRecord, ActionStatus, Finding } from "@/lib/types";
import { updateActionStatus } from "@/app/actions";
import { Card } from "./ui";

export const STATUS_STYLE: Record<ActionStatus, string> = {
  open: "bg-slate-100 text-slate-700",
  assigned: "bg-sky-100 text-sky-800",
  done: "bg-emerald-100 text-emerald-800",
};

export function StatusPill({ status, realised }: { status: ActionStatus; realised?: RealisedSaving | null }) {
  const label = status === "done" && realised ? (realised.realisedAed > 0 ? `verified ${fmtAed(realised.realisedAed)} saved` : "done · no saving yet") : status;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status]}`}>{label}</span>;
}

export function ActionTracker({
  finding,
  record,
  realised,
  inaction,
  isConsumption,
}: {
  finding: Finding;
  record: ActionRecord | undefined;
  realised: RealisedSaving | null;
  inaction: InactionCost | null;
  isConsumption: boolean;
}) {
  const status = record?.status ?? "open";
  const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-base sm:text-sm";

  return (
    <Card id="action">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">Action tracking</div>
        <StatusPill status={status} realised={status === "done" ? realised : null} />
      </div>

      <form action={updateActionStatus} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="findingId" value={finding.id} />
        <label className="text-xs text-slate-600">
          Status
          <select name="status" defaultValue={status} className={`mt-1 ${input}`}>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="done">Done — verify on next bill</option>
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Owner
          <input name="owner" defaultValue={record?.owner ?? ""} placeholder="e.g. Facilities — Ahmed" className={`mt-1 ${input}`} />
        </label>
        <label className="text-xs text-slate-600">
          Due
          <input name="dueDate" type="date" defaultValue={record?.dueDate ?? ""} className={`mt-1 ${input}`} />
        </label>
        {isConsumption ? (
          <label className="text-xs text-slate-600">
            Target kWh cut / month
            <input name="targetKwh" inputMode="numeric" defaultValue={record?.targetKwh ?? (finding.excessKwh > 0 ? Math.round(finding.excessKwh) : "")} className={`mt-1 ${input}`} />
          </label>
        ) : (
          <div />
        )}
        <label className="text-xs text-slate-600">
          One-off cost (AED)
          <input name="capexAed" inputMode="numeric" defaultValue={record?.capexAed ?? ""} placeholder="e.g. 2500" className={`mt-1 ${input}`} />
        </label>
        <button className="rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white sm:py-2">Save</button>
      </form>

      {isConsumption && (
        <>
          {inaction && record?.status !== "done" && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {inaction.months === 0 ? (
                <>No bill after {monthLabel(finding.billMonth)} yet — each month unresolved costs about {fmtAed(finding.excessAed)}</>
              ) : (
                <>
                  <div className="font-medium">
                    Cost of doing nothing: {fmtAed(inaction.aed)} lost across {inaction.months} bills since {monthLabel(finding.billMonth)}
                  </div>
                  <details className="mt-2 text-xs text-red-800">
                    <summary className="cursor-pointer">Show calculation</summary>
                    <table className="mt-1 w-full">
                      <tbody>
                        {inaction.trace.map((l, i) => (
                          <tr key={i} className="border-t border-red-200 align-top">
                            <td className="py-1 pr-2">
                              {l.label} <span className="font-mono text-[10px]">{l.formula}</span>
                            </td>
                            <td className="py-1 text-right font-mono whitespace-nowrap">{fmtAed(l.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              )}
            </div>
          )}
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          {realised ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-medium">
                  {realised.realisedAed > 0 ? "Realised saving" : "No saving yet"} — {monthLabel(realised.billMonth)} bill vs flagged run-rate
                </div>
                <div className={`text-lg font-semibold ${realised.realisedAed > 0 ? "text-emerald-700" : "text-red-700"}`}>{fmtAed(realised.realisedAed)}</div>
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {realised.flaggedKwhPerDay} → {realised.latestKwhPerDay} kWh/day · {realised.realisedKwh.toLocaleString()} kWh avoided · {realised.achievedPct}% of the {fmtAed(realised.targetAed)} target
                {record?.status !== "done" && " · mark the action done to count this as verified"}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, realised.achievedPct))}%` }} />
              </div>
              <details className="mt-2 text-xs text-slate-600">
                <summary className="cursor-pointer">How this was calculated</summary>
                <table className="mt-1 w-full">
                  <tbody>
                    {realised.calcTrace.map((l, i) => (
                      <tr key={i} className="border-t border-slate-200 align-top">
                        <td className="py-1 pr-2">
                          {l.label} <span className="font-mono text-[10px] text-slate-500">{l.formula}</span>
                        </td>
                        <td className="py-1 text-right font-mono whitespace-nowrap">{l.unit === "AED" ? fmtAed(l.value) : `${l.value.toLocaleString()} ${l.unit}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-1">
                  Compare bill:{" "}
                  <Link href={`/bills/${realised.billId}`} className="text-amber-700 underline">
                    {monthLabel(realised.billMonth)}
                  </Link>
                </div>
              </details>
            </>
          ) : (
            <div className="text-slate-600">
              Awaiting the next bill after {monthLabel(finding.billMonth)} — upload it and WattWatch will report realised vs scenario saving here.
            </div>
          )}
          </div>
        </>
      )}
    </Card>
  );
}
