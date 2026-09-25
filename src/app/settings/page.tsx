import { readStore } from "@/lib/store";
import { aiAvailable, MODEL } from "@/lib/ai";
import { Card } from "@/components/ui";
import { SPECIALTY_LABEL } from "@/lib/contractors";
import type { Specialty } from "@/lib/types";
import { addContractorAction, removeContractorAction, saveSettingsAction, updateSiteAction } from "../actions";

export const dynamic = "force-dynamic";

const input = "mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const { settings, sites, contractors } = readStore();
  const specialties = Object.keys(SPECIALTY_LABEL) as Specialty[];
  const t = settings.tariff;
  const th = settings.thresholds;
  const ef = settings.emissionFactor;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">Settings</h1>
        {sp.saved && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Saved</span>}
      </div>

      <form action={saveSettingsAction} className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="text-sm font-medium">DEWA tariff</div>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {t.commercial.map((s) => (
                <tr key={s.from} className="border-t border-slate-100">
                  <td className="py-0.5">
                    {s.from.toLocaleString()}–{s.to === null ? "∞" : s.to.toLocaleString()} kWh
                  </td>
                  <td className="text-right font-mono">{s.rate.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-500">
            Commercial slabs (AED/kWh), industrial: 0.230 to 10,000 then 0.380.{" "}
            <a href={t.sourceUrl} className="underline" target="_blank" rel="noreferrer">
              Source
            </a>
          </p>
          <label className="mt-3 block text-sm">
            Default fuel surcharge (AED/kWh) — used only when a bill does not print it
            <input name="surcharge" type="number" step="0.001" defaultValue={t.defaultSurchargeRate} className={input} />
          </label>
          <label className="mt-2 block text-sm">
            Surcharge month label
            <input name="surchargeLabel" defaultValue={t.surchargeMonthLabel} className={input} />
          </label>
          <label className="mt-2 block text-sm">
            Default meter charge (AED)
            <input name="meterCharge" type="number" step="1" defaultValue={t.meterCharge} className={input} />
          </label>
        </Card>
        <Card>
          <div className="text-sm font-medium">Detection thresholds</div>
          {(
            [
              ["spikePct", "Spike vs baseline (%)", th.spikePct],
              ["spikeHighPct", "High severity spike (%)", th.spikeHighPct],
              ["driftPct", "Month-on-month drift (%)", th.driftPct],
              ["peerPct", "Peer outlier (%)", th.peerPct],
              ["totalMismatchAed", "Total mismatch tolerance (AED)", th.totalMismatchAed],
            ] as const
          ).map(([k, label, v]) => (
            <label key={k} className="mt-2 block text-sm">
              {label}
              <input name={k} type="number" step="1" defaultValue={v} className={input} />
            </label>
          ))}
          <p className="mt-2 text-xs text-slate-500">Baseline = median kWh/day of the prior {th.baselineMonths} months. All thresholds are ordinary code — AI never sets them.</p>
        </Card>
        <Card>
          <div className="text-sm font-medium">Scope 2 emission factor</div>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input name="efEnabled" type="checkbox" defaultChecked={ef.enabled} /> Show CO₂e estimates
          </label>
          <label className="mt-2 block text-sm">
            kgCO₂e per kWh
            <input name="efValue" type="number" step="0.0001" defaultValue={ef.kgCo2ePerKwh} className={input} />
          </label>
          <label className="mt-2 block text-sm">
            Factor year
            <input name="efYear" type="number" defaultValue={ef.year} className={input} />
          </label>
          <label className="mt-2 block text-sm">
            Source
            <input name="efSource" defaultValue={ef.source} className={input} />
          </label>
          <label className="mt-2 block text-sm">
            Source URL
            <input name="efUrl" defaultValue={ef.sourceUrl} className={input} />
          </label>
          <p className="mt-2 text-xs text-slate-500">Location-based method per GHG Protocol Scope 2 guidance. This is an estimate for purchased electricity only, not a full inventory.</p>
          <button className="mt-4 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Save settings</button>
        </Card>
      </form>

      <Card>
        <div className="text-sm font-medium">AI</div>
        <p className="mt-1 text-sm text-slate-600">
          {aiAvailable() ? (
            <>
              OpenAI configured (model <code>{MODEL}</code>): used for PDF layouts the rule parser cannot read and for bilingual explanations. A number guard flags any figure not present in the finding inputs.
            </>
          ) : (
            <>
              <code>OPENAI_API_KEY</code> not set — running fully deterministic: rule-based PDF parsing and template explanations in English and Arabic. Set the key in <code>.env.local</code> to enable AI extraction and narrative.
            </>
          )}
        </p>
      </Card>

      {sites.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Sites</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {sites.map((s) => (
              <form key={s.id} action={updateSiteAction}>
                <Card>
                  <input type="hidden" name="id" value={s.id} />
                  <div className="text-xs text-slate-500">DEWA account {s.dewaAccountNo}</div>
                  <label className="mt-1 block text-sm">
                    Name
                    <input name="name" defaultValue={s.name} className={input} />
                  </label>
                  <label className="mt-1 block text-sm">
                    Name (Arabic)
                    <input name="nameAr" dir="rtl" defaultValue={s.nameAr ?? ""} className={input} />
                  </label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <label className="block text-sm">
                      Tariff
                      <select name="premisesType" defaultValue={s.premisesType} className={input}>
                        <option value="commercial">commercial</option>
                        <option value="industrial">industrial</option>
                      </select>
                    </label>
                    <label className="block text-sm">
                      Area (m²)
                      <input name="areaSqm" type="number" defaultValue={s.areaSqm ?? ""} className={input} />
                    </label>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input name="hasOwnCooling" type="checkbox" defaultChecked={s.hasOwnCooling} /> Own cooling (not district cooling)
                  </label>
                  <button className="mt-3 rounded-md border border-slate-300 px-3 py-1 text-sm">Save site</button>
                </Card>
              </form>
            ))}
          </div>
        </div>
      )}

      <div id="contractors">
        <h2 className="mb-1 text-lg font-semibold">Contractor directory</h2>
        <p className="mb-3 text-sm text-slate-600">Shown on each finding under “Who to call”, matched by trade and by the site’s area. Entries marked demo are placeholders — replace them with your approved vendors.</p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {contractors.map((c) => (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.demo && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">demo</span>}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{c.specialties.map((s) => SPECIALTY_LABEL[s].en).join(" · ")}</div>
                  <div className="text-xs text-slate-500">{c.areas.includes("*") ? "All Dubai" : c.areas.join(" · ")}</div>
                  <div className="mt-1 text-xs text-slate-600">{[c.phone, c.whatsapp && `WA ${c.whatsapp}`, c.email, c.url].filter(Boolean).join(" · ")}</div>
                </div>
                <form action={removeContractorAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600">Remove</button>
                </form>
              </div>
            </Card>
          ))}
          <form action={addContractorAction}>
            <Card>
              <div className="text-sm font-medium">Add a provider</div>
              <label className="mt-1 block text-sm">
                Company
                <input name="name" required className={input} />
              </label>
              <label className="mt-1 block text-sm">
                Name (Arabic)
                <input name="nameAr" dir="rtl" className={input} />
              </label>
              <div className="mt-1 text-sm">Trades</div>
              <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
                {specialties.map((s) => (
                  <label key={s} className="flex items-center gap-1.5">
                    <input type="checkbox" name="specialties" value={s} /> {SPECIALTY_LABEL[s].en}
                  </label>
                ))}
              </div>
              <label className="mt-1 block text-sm">
                Areas covered (comma-separated, or * for all Dubai)
                <input name="areas" placeholder="Al Quoz, Deira" className={input} />
              </label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  Phone
                  <input name="phone" type="tel" placeholder="+9715…" className={input} />
                </label>
                <label className="block text-sm">
                  WhatsApp
                  <input name="whatsapp" type="tel" placeholder="+9715…" className={input} />
                </label>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  Email
                  <input name="email" type="email" className={input} />
                </label>
                <label className="block text-sm">
                  Website
                  <input name="url" type="url" className={input} />
                </label>
              </div>
              <label className="mt-1 block text-sm">
                Note
                <input name="note" className={input} />
              </label>
              <button className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Add provider</button>
            </Card>
          </form>
        </div>
      </div>
    </div>
  );
}
