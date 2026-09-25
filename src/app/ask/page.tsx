"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { askAction } from "@/app/actions";
import type { Answer } from "@/lib/ask";

const suggestions = [
  "Which branch cost the most in July and why?",
  "What should we investigate first?",
  "Total spend for Branch C",
  "Tell me about Branch B",
];

export default function AskPage() {
  const [q, setQ] = useState("");
  const [history, setHistory] = useState<{ q: string; a: Answer }[]>([]);
  const [pending, start] = useTransition();

  const submit = (question: string) => {
    if (!question.trim()) return;
    start(async () => {
      const a = await askAction(question);
      setHistory((h) => [{ q: question, a }, ...h]);
      setQ("");
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ask your bills</h1>
        <p className="text-sm text-slate-600">Every answer cites the bills and findings it relies on. Numbers come from the structured data, never from the model&apos;s memory.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        className="flex gap-2"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which branch cost the most in July and why?" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <button disabled={pending} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50">
          {pending ? "Thinking…" : "Ask"}
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => submit(s)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:border-amber-400">
            {s}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {history.map((h, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-medium text-slate-500">{h.q}</div>
            <p className="mt-2 whitespace-pre-line">{h.a.text}</p>
            {(h.a.citations.length > 0 || h.a.findingIds.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {h.a.citations.map((c) => (
                  <Link key={c.billId} href={`/bills/${c.billId}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 hover:border-amber-400">
                    {c.label}
                  </Link>
                ))}
                {h.a.findingIds.map((id) => (
                  <Link key={id} href={`/findings/${encodeURIComponent(id)}`} className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 hover:border-amber-400">
                    finding → {id.split(":")[0].replace(/_/g, " ").toLowerCase()}
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-2 text-[11px] text-slate-400">{h.a.model}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
