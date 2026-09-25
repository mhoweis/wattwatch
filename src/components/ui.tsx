import Link from "next/link";
import type { ReactNode } from "react";
import type { Finding, Severity } from "@/lib/types";
import { monthLabel } from "@/lib/analysis";
import { fmtAed } from "@/lib/tariff";

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold sm:text-2xl">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  );
}

const sevStyle: Record<Severity, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  "data-quality": "bg-sky-100 text-sky-800 border-sky-200",
};
const sevLabel: Record<Severity, string> = { high: "High", medium: "Medium", "data-quality": "Data quality" };

export function SeverityBadge({ s }: { s: Severity }) {
  return <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${sevStyle[s]}`}>{sevLabel[s]}</span>;
}

export const typeLabel: Record<Finding["type"], string> = {
  SPIKE_VS_BASELINE: "Spike vs baseline",
  SUSTAINED_DRIFT: "Sustained drift",
  PEER_OUTLIER: "Peer outlier",
  SLAB_BAND_JUMP: "Tariff band jump",
  MISSING_BILL: "Missing bill",
  DUPLICATE_BILL: "Duplicate bill",
  TOTAL_MISMATCH: "Total mismatch",
};

export function findingHref(f: Finding) {
  return `/findings/${encodeURIComponent(f.id)}`;
}

export function FindingRow({ f, status }: { f: Finding; status?: ReactNode }) {
  return (
    <Link href={findingHref(f)} className="block rounded-lg border border-slate-200 bg-white p-4 active:bg-amber-50 hover:border-amber-400 hover:shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:hidden">
        <SeverityBadge s={f.severity} />
        {f.excessAed > 0 && (
          <div className="text-right leading-tight">
            <span className="font-semibold">{fmtAed(f.excessAed)}</span>{" "}
            <span className="text-xs text-slate-500">{f.type === "TOTAL_MISMATCH" ? (f.metrics.recoverableAed ? "refundable" : "discrepancy") : "est. excess / mo"}</span>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-start gap-3 sm:mt-0">
        <span className="hidden sm:inline-block">
          <SeverityBadge s={f.severity} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{f.headline}</div>
          <div className="mt-1 text-sm text-slate-600">{f.whyHint}</div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>{typeLabel[f.type]}</span>
            <span>{monthLabel(f.billMonth)}</span>
            <span>{f.evidenceBillIds.length} evidence bill{f.evidenceBillIds.length === 1 ? "" : "s"}</span>
            {status}
          </div>
        </div>
        {f.excessAed > 0 && (
          <div className="hidden text-right sm:block">
            <div className="text-lg font-semibold">{fmtAed(f.excessAed)}</div>
            <div className="text-xs text-slate-500">{f.type === "TOTAL_MISMATCH" ? (f.metrics.recoverableAed ? "refundable" : "discrepancy") : "est. excess / month"}</div>
          </div>
        )}
      </div>
    </Link>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="text-center">
      <div className="text-lg font-medium">{title}</div>
      <div className="mt-2 text-sm text-slate-600">{children}</div>
    </Card>
  );
}
