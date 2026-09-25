"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Explanation } from "@/lib/types";
import { explainAction } from "@/app/actions";

export function ExplainPanel({ findingId, initial }: { findingId: string; initial: Explanation | null }) {
  const [e, setE] = useState<Explanation | null>(initial);
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (force: boolean) =>
    start(async () => {
      setError(null);
      try {
        setE(await explainAction(findingId, force));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <div className="text-sm font-medium">Explanation & action sheet</div>
        <div className="ml-auto flex items-center gap-2">
          {e && (
            <div className="flex rounded-md border border-slate-300 text-xs">
              <button type="button" onClick={() => setLang("en")} className={`px-2 py-1 ${lang === "en" ? "bg-slate-900 text-white" : ""}`}>
                English
              </button>
              <button type="button" onClick={() => setLang("ar")} className={`px-2 py-1 ${lang === "ar" ? "bg-slate-900 text-white" : ""}`}>
                العربية
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(Boolean(e))}
            className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-slate-900 disabled:opacity-50"
          >
            {pending ? "Generating…" : e ? "Regenerate" : "Generate explanation & actions"}
          </button>
          {e && (
            <Link href={`/findings/${encodeURIComponent(findingId)}/sheet`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              Open one-page task sheet
            </Link>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!e && !error && <p className="text-sm text-slate-500">Uses AI when OPENAI_API_KEY is configured; otherwise a deterministic bilingual template built from the finding&apos;s own numbers.</p>}
      {e && (
        <div dir={lang === "ar" ? "rtl" : "ltr"} className="space-y-3">
          <h3 className="text-lg font-semibold">{lang === "en" ? e.headline_en : e.headline_ar}</h3>
          <p className="text-slate-700">{lang === "en" ? e.explanation_en : e.explanation_ar}</p>
          <ol className="space-y-2">
            {e.actions.map((a, i) => (
              <li key={i} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">
                    {i + 1}. {lang === "en" ? a.title_en : a.title_ar}
                  </span>
                  <span className="text-xs text-slate-500">
                    {a.owner} · {a.effort}
                  </span>
                </div>
                <ul className="mt-1 list-disc ps-6 text-sm text-slate-700">
                  {(lang === "en" ? a.checks_en : a.checks_ar).map((c, j) => (
                    <li key={j}>{c}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <div dir="ltr" className="text-xs text-slate-500">
            Generated {new Date(e.generatedAt).toLocaleString()} · {e.model}
            {e.guardWarnings.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-amber-700">
                {e.guardWarnings.map((w, i) => (
                  <li key={i}>Number guard: {w}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
