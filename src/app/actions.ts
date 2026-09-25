"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { analyse } from "@/lib/analysis";
import { ask, type Answer } from "@/lib/ask";
import { explainFinding } from "@/lib/explain";
import { csvRowToExtraction, extractBill, parseCsv, toBill } from "@/lib/extract";
import { addBill, addFile, loadSample, readStore, resetStore, saveExplanation, update, UPLOAD_DIR, upsertSiteByAccount } from "@/lib/store";
import { SPECIALTY_LABEL } from "@/lib/contractors";
import type { Bill, PremisesType, Settings, Specialty } from "@/lib/types";

export async function loadSampleAction() {
  loadSample();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function resetAction() {
  resetStore();
  revalidatePath("/", "layout");
  redirect("/upload");
}

export interface UploadResult {
  added: { filename: string; site: string; billMonth: string; kwh: number; method: Bill["extractionMethod"]; status: Bill["status"] }[];
  errors: { filename: string; error: string }[];
}

export async function uploadAction(formData: FormData): Promise<UploadResult> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const result: UploadResult = { added: [], errors: [] };
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    if (!isCsv && !isPdf) {
      result.errors.push({ filename: file.name, error: "Unsupported file type — upload PDF or CSV." });
      continue;
    }
    const savedPath = path.join(UPLOAD_DIR, `${fileId}-${file.name.replace(/[^\w.-]/g, "_")}`);
    fs.writeFileSync(savedPath, bytes);

    if (isCsv) {
      const { rows, errors } = parseCsv(new TextDecoder().decode(bytes));
      errors.forEach((e) => result.errors.push({ filename: file.name, error: e }));
      update((s) => {
        addFile(s, { id: fileId, filename: file.name, type: "csv", uploadedAt: new Date().toISOString(), path: savedPath });
        for (const r of rows) {
          const premises: PremisesType = r.premises_type === "industrial" ? "industrial" : "commercial";
          const site = upsertSiteByAccount(s, r.account_no, r.site, premises);
          const x = csvRowToExtraction(r, s.settings, site.premisesType);
          const bill = addBill(s, toBill(x, site.id, site.premisesType, s.settings, "csv", fileId));
          result.added.push({ filename: file.name, site: site.name, billMonth: bill.billMonth, kwh: bill.kwh, method: "csv", status: bill.status });
        }
      });
      continue;
    }

    const ex = await extractBill(bytes);
    if ("error" in ex) {
      result.errors.push({ filename: file.name, error: ex.error });
      continue;
    }
    update((s) => {
      addFile(s, { id: fileId, filename: file.name, type: "pdf", uploadedAt: new Date().toISOString(), path: savedPath });
      const printedCategory: PremisesType = ex.extraction.tariffCategory === "industrial" ? "industrial" : "commercial";
      const site = upsertSiteByAccount(s, ex.extraction.accountNo, ex.extraction.premisesName ?? `Account ${ex.extraction.accountNo}`, printedCategory);
      const bill = addBill(s, toBill(ex.extraction, site.id, site.premisesType, s.settings, ex.method, fileId));
      result.added.push({ filename: file.name, site: site.name, billMonth: bill.billMonth, kwh: bill.kwh, method: ex.method, status: bill.status });
    });
  }
  revalidatePath("/", "layout");
  return result;
}

export async function explainAction(findingId: string, force = false) {
  const store = readStore();
  if (!force && store.explanations[findingId]) return store.explanations[findingId];
  const findings = analyse(store.sites, store.bills, store.settings);
  const f = findings.find((x) => x.id === findingId);
  if (!f) throw new Error("Finding not found");
  const site = store.sites.find((s) => s.id === f.siteId);
  if (!site) throw new Error("Site not found");
  const e = await explainFinding(f, site);
  saveExplanation(e);
  revalidatePath(`/findings/${encodeURIComponent(findingId)}`);
  return e;
}

export async function askAction(question: string): Promise<Answer> {
  return ask(question.slice(0, 500), readStore());
}

export async function saveSettingsAction(formData: FormData) {
  const num = (k: string, fallback: number) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) ? v : fallback;
  };
  update((s) => {
    const cur: Settings = s.settings;
    s.settings = {
      ...cur,
      tariff: {
        ...cur.tariff,
        defaultSurchargeRate: num("surcharge", cur.tariff.defaultSurchargeRate),
        meterCharge: num("meterCharge", cur.tariff.meterCharge),
        surchargeMonthLabel: String(formData.get("surchargeLabel") ?? cur.tariff.surchargeMonthLabel),
      },
      thresholds: {
        ...cur.thresholds,
        spikePct: num("spikePct", cur.thresholds.spikePct),
        spikeHighPct: num("spikeHighPct", cur.thresholds.spikeHighPct),
        driftPct: num("driftPct", cur.thresholds.driftPct),
        peerPct: num("peerPct", cur.thresholds.peerPct),
        totalMismatchAed: num("totalMismatchAed", cur.thresholds.totalMismatchAed),
      },
      emissionFactor: {
        ...cur.emissionFactor,
        enabled: formData.get("efEnabled") === "on",
        year: num("efYear", cur.emissionFactor.year),
        kgCo2ePerKwh: num("efValue", cur.emissionFactor.kgCo2ePerKwh),
        source: String(formData.get("efSource") ?? cur.emissionFactor.source),
        sourceUrl: String(formData.get("efUrl") ?? cur.emissionFactor.sourceUrl),
      },
    };
  });
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

export async function addContractorAction(formData: FormData) {
  const str = (k: string) => String(formData.get(k) ?? "").trim() || undefined;
  const name = str("name");
  if (!name) return;
  const valid = new Set(Object.keys(SPECIALTY_LABEL));
  const specialties = formData.getAll("specialties").map(String).filter((s): s is Specialty => valid.has(s));
  if (specialties.length === 0) return;
  const areas = (str("areas") ?? "*").split(",").map((a) => a.trim()).filter(Boolean);
  update((s) => {
    s.contractors.push({
      id: `c-${Date.now().toString(36)}`,
      name,
      nameAr: str("nameAr"),
      specialties,
      areas: areas.length ? areas : ["*"],
      phone: str("phone"),
      whatsapp: str("whatsapp"),
      email: str("email"),
      url: str("url"),
      note: str("note"),
    });
  });
  revalidatePath("/", "layout");
  redirect("/settings?saved=1#contractors");
}

export async function removeContractorAction(formData: FormData) {
  const id = String(formData.get("id"));
  update((s) => {
    s.contractors = s.contractors.filter((c) => c.id !== id);
  });
  revalidatePath("/", "layout");
  redirect("/settings?saved=1#contractors");
}

export async function updateSiteAction(formData: FormData) {
  const id = String(formData.get("id"));
  update((s) => {
    const site = s.sites.find((x) => x.id === id);
    if (!site) return;
    site.name = String(formData.get("name") ?? site.name);
    site.nameAr = String(formData.get("nameAr") ?? "") || undefined;
    site.premisesType = formData.get("premisesType") === "industrial" ? "industrial" : "commercial";
    const area = Number(formData.get("areaSqm"));
    site.areaSqm = Number.isFinite(area) && area > 0 ? area : undefined;
    site.hasOwnCooling = formData.get("hasOwnCooling") === "on";
  });
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}
