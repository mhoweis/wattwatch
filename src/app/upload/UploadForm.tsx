"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { uploadAction, type UploadResult } from "@/app/actions";

export function UploadForm() {
  const [result, setResult] = useState<UploadResult | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setResult(await uploadAction(fd));
          formRef.current?.reset();
        });
      }}
    >
      <label className="block rounded-lg border-2 border-dashed border-slate-300 p-4 text-center hover:border-amber-400 sm:p-8">
        <input type="file" name="files" multiple accept=".pdf,.csv,application/pdf,text/csv" className="block w-full max-w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white" required />
        <div className="mt-2 text-sm text-slate-600">DEWA electricity bill PDFs (text layer required) or a CSV export. Several files at once are fine.</div>
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button disabled={pending} className="rounded-md bg-amber-500 px-4 py-3 text-sm font-medium text-slate-900 disabled:opacity-50 sm:py-2">
          {pending ? "Reading bills…" : "Upload & extract"}
        </button>
        <span className="text-xs text-slate-500">PDFs: deterministic DEWA-layout parser first, then AI extraction (if configured). Every bill is recomputed from the tariff and reconciled with its printed total.</span>
      </div>
      {result && (
        <div className="space-y-2 text-sm">
          {result.added.length > 0 && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <div className="font-medium text-emerald-800">{result.added.length} bill{result.added.length === 1 ? "" : "s"} added</div>
              <ul className="mt-1 space-y-0.5 text-emerald-900">
                {result.added.map((a, i) => (
                  <li key={i}>
                    {a.site} · {a.billMonth} · {a.kwh.toLocaleString()} kWh · <span className="text-xs text-slate-500">{a.method}</span>
                    {a.status !== "ok" && <span className="ml-2 rounded bg-sky-100 px-1 text-xs text-sky-800">{a.status}</span>}
                  </li>
                ))}
              </ul>
              <Link href="/" className="mt-2 inline-block text-amber-700 underline">
                View dashboard →
              </Link>
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <div className="font-medium text-red-800">{result.errors.length} problem{result.errors.length === 1 ? "" : "s"}</div>
              <ul className="mt-1 list-disc pl-5 text-red-900">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <b>{e.filename}</b>: {e.error}
                  </li>
                ))}
              </ul>
              <div className="mt-1 text-xs text-red-800">Fallback: export the same bills as CSV and upload that instead.</div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
