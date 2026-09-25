import Link from "next/link";
import { matchContractors, SPECIALTY_LABEL, specialtiesFor } from "@/lib/contractors";
import type { Contractor, Finding, Site } from "@/lib/types";
import { Card } from "./ui";

function ContactButtons({ c }: { c: Contractor }) {
  const btn = "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium active:bg-amber-50";
  return (
    <div className="flex flex-wrap gap-2">
      {c.phone && (
        <a href={`tel:${c.phone}`} className={`${btn} border-slate-300 bg-white`}>
          Call
        </a>
      )}
      {c.whatsapp && (
        <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className={`${btn} border-emerald-300 bg-emerald-50 text-emerald-800`}>
          WhatsApp
        </a>
      )}
      {c.email && (
        <a href={`mailto:${c.email}`} className={`${btn} border-slate-300 bg-white`}>
          Email
        </a>
      )}
      {c.url && (
        <a href={c.url} target="_blank" rel="noreferrer" className={`${btn} border-slate-300 bg-white`}>
          Website
        </a>
      )}
    </div>
  );
}

export function ContractorPanel({ finding, site, contractors }: { finding: Finding; site: Site; contractors: Contractor[] }) {
  const needs = specialtiesFor(finding, site);
  if (needs.length === 0) return null;
  const hasDemo = contractors.some((c) => c.demo);
  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium">Who to call</div>
        <Link href="/settings#contractors" className="text-xs text-amber-700 underline">
          Manage directory
        </Link>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Matched to the checks above and to {site.name}. Providers covering the site&apos;s area are listed first.
        {hasDemo && " Entries marked demo are illustrative placeholders — replace them with your approved vendors in Settings."}
      </p>
      <div className="space-y-4">
        {needs.map(({ specialty, reason }) => {
          const matches = matchContractors(contractors, specialty, site).slice(0, 3);
          return (
            <div key={specialty}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{SPECIALTY_LABEL[specialty].en}</span>
                <span className="text-xs text-slate-500" dir="rtl">
                  {SPECIALTY_LABEL[specialty].ar}
                </span>
              </div>
              <div className="text-sm text-slate-600">{reason}</div>
              {matches.length === 0 ? (
                <div className="mt-2 text-xs text-slate-500">
                  No provider for this trade yet —{" "}
                  <Link href="/settings#contractors" className="text-amber-700 underline">
                    add one
                  </Link>
                  .
                </div>
              ) : (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {matches.map((c) => (
                    <li key={c.id} className="rounded-md border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        {c.demo && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">demo</span>}
                      </div>
                      {c.nameAr && (
                        <div className="text-xs text-slate-500" dir="rtl">
                          {c.nameAr}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-slate-500">{c.areas.includes("*") ? "All Dubai" : c.areas.join(" · ")}</div>
                      {c.note && <div className="mt-1 text-xs text-slate-600">{c.note}</div>}
                      <div className="mt-2">
                        <ContactButtons c={c} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
