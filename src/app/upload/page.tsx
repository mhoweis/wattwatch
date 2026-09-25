import Link from "next/link";
import { readStore } from "@/lib/store";
import { Card } from "@/components/ui";
import { loadSampleAction, resetAction } from "../actions";
import { UploadForm } from "./UploadForm";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  const store = readStore();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Upload bills</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <UploadForm />
        </Card>
        <div className="space-y-4">
          <Card>
            <div className="text-sm font-medium">Sample dataset</div>
            <p className="mt-1 text-sm text-slate-600">Three branches × six months of synthetic DEWA-style bills, including one spike, one missing bill, one duplicate and one billing mismatch.</p>
            <form action={loadSampleAction} className="mt-3">
              <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Load sample (instant)</button>
            </form>
            <div className="mt-3 text-xs text-slate-500">
              Or download the same data to test the upload path:{" "}
              <a href="/sample/sample-bills.csv" className="underline" download>
                CSV
              </a>{" "}
              ·{" "}
              <a href="/sample/index.json" className="underline" target="_blank" rel="noreferrer">
                PDF list
              </a>
            </div>
          </Card>
          <Card>
            <div className="text-sm font-medium">CSV format</div>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-[11px] leading-relaxed">
              site,account_no,period_start,period_end,kwh,{"\n"}fuel_surcharge_rate,meter_charge,total_aed,premises_type
            </pre>
            <p className="mt-1 text-xs text-slate-500">Only the first five columns are required; the rest default to the tariff settings.</p>
          </Card>
          {store.bills.length > 0 && (
            <Card>
              <div className="text-sm text-slate-600">
                {store.bills.length} bills loaded.{" "}
                <Link href="/" className="text-amber-700 underline">
                  Go to dashboard
                </Link>
              </div>
              <form action={resetAction} className="mt-2">
                <button className="text-xs text-red-700 underline">Clear all data</button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
