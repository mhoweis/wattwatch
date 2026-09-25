import { analyse, kwhPerDay, monthLabel } from "./analysis";
import { getOpenAI, MODEL } from "./ai";
import { fmtAed, round2 } from "./tariff";
import type { Bill, Finding, Site, Store } from "./types";

export interface Answer {
  text: string;
  citations: { billId: string; label: string }[];
  findingIds: string[];
  model: string;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function cite(b: Bill, site?: Site) {
  return { billId: b.id, label: `${site?.name.split(" — ")[0] ?? b.siteId} ${monthLabel(b.billMonth)}: ${b.kwh.toLocaleString()} kWh, ${fmtAed(b.totalAed)}` };
}

/** Deterministic answers for the common question shapes; used when no API key is configured. */
export function answerByRules(q: string, store: Store, findings: Finding[]): Answer {
  const ql = q.toLowerCase();
  const bills = store.bills.filter((b) => b.status !== "duplicate");
  const siteById = new Map(store.sites.map((s) => [s.id, s]));
  const monthIdx = MONTHS.findIndex((m) => ql.includes(m));
  const monthBills = monthIdx >= 0 ? bills.filter((b) => Number(b.billMonth.slice(5)) === monthIdx + 1) : bills;
  const mentionedSite = store.sites.find((s) => ql.includes(s.name.toLowerCase()) || ql.includes(s.name.split(" — ")[0].toLowerCase()));
  const wantsKwh = /kwh|consum|usage|use/.test(ql);
  const wantsWhy = /why|reason|investigate|cause/.test(ql);

  if (/(most|highest|expensive|largest|biggest|top)/.test(ql) && monthBills.length) {
    const key = wantsKwh ? (b: Bill) => b.kwh : (b: Bill) => b.totalAed;
    const bySite = new Map<string, number>();
    for (const b of monthBills) bySite.set(b.siteId, (bySite.get(b.siteId) ?? 0) + key(b));
    const [topId, val] = [...bySite.entries()].sort((a, b) => b[1] - a[1])[0];
    const site = siteById.get(topId);
    const ev = monthBills.filter((b) => b.siteId === topId);
    const related = findings.filter((f) => f.siteId === topId && (monthIdx < 0 || Number(f.billMonth.slice(5)) === monthIdx + 1) && f.severity !== "data-quality");
    let text = `${site?.name ?? topId} ${monthIdx >= 0 ? `in ${MONTHS[monthIdx][0].toUpperCase() + MONTHS[monthIdx].slice(1)}` : "over the period"} ${wantsKwh ? `used ${val.toLocaleString()} kWh` : `cost ${fmtAed(val)}`}, the highest in the portfolio.`;
    if (related.length) text += ` Why: ${related[0].headline}. ${related[0].whyHint}`;
    else if (wantsWhy) text += " No consumption finding is open for that site/month, so the cost reflects its normal baseline.";
    return { text, citations: ev.map((b) => cite(b, site)), findingIds: related.map((f) => f.id), model: "rules" };
  }

  if (/total|spend|sum|overall/.test(ql)) {
    const scope = mentionedSite ? monthBills.filter((b) => b.siteId === mentionedSite.id) : monthBills;
    const aed = scope.reduce((a, b) => a + b.totalAed, 0);
    const kwh = scope.reduce((a, b) => a + b.kwh, 0);
    return {
      text: `${mentionedSite ? mentionedSite.name : "The portfolio"} ${monthIdx >= 0 ? `in ${monthLabel(scope[0]?.billMonth ?? "")}` : `across ${scope.length} bills`} totals ${fmtAed(round2(aed))} for ${kwh.toLocaleString()} kWh.`,
      citations: scope.map((b) => cite(b, siteById.get(b.siteId))),
      findingIds: [],
      model: "rules",
    };
  }

  if (mentionedSite) {
    const sb = bills.filter((b) => b.siteId === mentionedSite.id).sort((a, b) => a.billMonth.localeCompare(b.billMonth));
    const fs = findings.filter((f) => f.siteId === mentionedSite.id);
    const trend = sb.map((b) => `${monthLabel(b.billMonth).slice(0, 3)} ${round2(kwhPerDay(b))}`).join(", ");
    return {
      text: `${mentionedSite.name}: ${sb.length} bills, kWh/day by month — ${trend}. ${fs.length ? `Open findings: ${fs.map((f) => f.headline).join("; ")}.` : "No findings."}`,
      citations: sb.map((b) => cite(b, mentionedSite)),
      findingIds: fs.map((f) => f.id),
      model: "rules",
    };
  }

  if (/finding|investigate|priorit|first|problem|issue|anomal/.test(ql)) {
    const top = findings.slice(0, 3);
    return {
      text: top.length ? `Investigate first: ${top.map((f, i) => `${i + 1}) ${f.headline}`).join(" ")}` : "No findings open.",
      citations: top.flatMap((f) => f.evidenceBillIds.slice(0, 1).map((id) => bills.find((b) => b.id === id)).filter((b): b is Bill => Boolean(b)).map((b) => cite(b, siteById.get(b.siteId)))),
      findingIds: top.map((f) => f.id),
      model: "rules",
    };
  }

  return {
    text: "I can answer questions like “which branch cost most in July and why?”, “total spend for Branch C”, “what should we investigate first?”, or ask about a specific branch. Set OPENAI_API_KEY for free-form questions.",
    citations: [],
    findingIds: [],
    model: "rules",
  };
}

export async function ask(q: string, store: Store): Promise<Answer> {
  const findings = analyse(store.sites, store.bills, store.settings);
  const client = getOpenAI();
  if (!client) return answerByRules(q, store, findings);
  const context = {
    sites: store.sites.map((s) => ({ id: s.id, name: s.name, premisesType: s.premisesType, areaSqm: s.areaSqm })),
    bills: store.bills.map((b) => ({ id: b.id, siteId: b.siteId, billMonth: b.billMonth, days: Math.round((new Date(b.periodEnd).getTime() - new Date(b.periodStart).getTime()) / 86400000) + 1, kwh: b.kwh, totalAed: b.totalAed, status: b.status })),
    findings: findings.map((f) => ({ id: f.id, siteId: f.siteId, type: f.type, severity: f.severity, billMonth: f.billMonth, headline: f.headline, whyHint: f.whyHint, metrics: f.metrics, evidenceBillIds: f.evidenceBillIds })),
  };
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You answer questions about a company's DEWA electricity bills using ONLY the JSON provided. Every number you state must appear in the data or be a sum/difference you show explicitly. Answer in 2–4 sentences, then on a final line write CITES: followed by the bill ids you relied on, comma-separated, and FINDINGS: followed by finding ids. Never promise savings; call them scenarios.",
        },
        { role: "user", content: `DATA:\n${JSON.stringify(context)}\n\nQUESTION: ${q}` },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? "";
    const cites = raw.match(/CITES:\s*(.*)/)?.[1]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    const fids = raw.match(/FINDINGS:\s*(.*)/)?.[1]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    const siteById = new Map(store.sites.map((s) => [s.id, s]));
    return {
      text: raw.replace(/CITES:[\s\S]*/, "").trim(),
      citations: cites.map((id) => store.bills.find((b) => b.id === id)).filter((b): b is Bill => Boolean(b)).map((b) => cite(b, siteById.get(b.siteId))),
      findingIds: fids.filter((id) => findings.some((f) => f.id === id)),
      model: MODEL,
    };
  } catch {
    return answerByRules(q, store, findings);
  }
}
