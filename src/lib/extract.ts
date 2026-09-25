import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import type { Bill, PremisesType, Settings } from "./types";
import { calcBill, round2 } from "./tariff";
import { getOpenAI, MODEL } from "./ai";

export const BillExtractionSchema = z.object({
  accountNo: z.string().describe("DEWA account number as printed"),
  premisesName: z.string().nullable().describe("Premises / site name if printed"),
  tariffCategory: z.enum(["commercial", "industrial", "residential", "unknown"]),
  periodStart: z.string().describe("ISO date YYYY-MM-DD"),
  periodEnd: z.string().describe("ISO date YYYY-MM-DD"),
  kwh: z.number().describe("Electricity consumption in kWh for the period"),
  fuelSurchargeRate: z.number().nullable().describe("AED per kWh fuel surcharge rate if printed"),
  meterCharge: z.number().nullable(),
  vatAmount: z.number().nullable(),
  totalAed: z.number().describe("Total amount due in AED"),
  confidence: z.number().min(0).max(1),
  fieldSources: z.record(z.string(), z.string()).describe("For each field, the exact text snippet it was read from"),
});
export type BillExtraction = z.infer<typeof BillExtractionSchema>;

export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

function toIso(dmy: string): string {
  const [dd, mm, yyyy] = dmy.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function num(s: string): number {
  return Number(s.replace(/,/g, ""));
}

/** Deterministic parser for DEWA-style bill text. Returns null if the layout is not recognised. */
export function parseBillTextByRules(text: string): BillExtraction | null {
  const acc = /Account\s*(?:Number|No\.?)[:\s]+(\d{6,})/i.exec(text);
  const period = /Billing Period[:\s]+(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text);
  const kwh = /Consumption[:\s]+([\d,]+)\s*kWh/i.exec(text);
  const total = /Total Amount Due(?:\s*\(AED\))?[:\s]+([\d,]+\.\d{2})/i.exec(text);
  if (!acc || !period || !kwh || !total) return null;
  const surcharge = /Fuel Surcharge\s+[\d,]+\s*kWh\s*x\s*([\d.]+)/i.exec(text);
  const meter = /Meter Service Charge[^\n]*?([\d,]+\.\d{2})/i.exec(text);
  const vat = /VAT\s*5%\s+(?:[\d,]+\.\d{2}\s*x\s*0\.05\s+)?([\d,]+\.\d{2})/i.exec(text);
  const premises = /Premises[:\s]+(.+?)(?:\n|Tariff)/i.exec(text);
  const cat = /Tariff Category[:\s]+(\w+)/i.exec(text)?.[1]?.toLowerCase();
  const sources: Record<string, string> = {
    accountNo: acc[0],
    periodStart: period[0],
    periodEnd: period[0],
    kwh: kwh[0],
    totalAed: total[0],
  };
  if (surcharge) sources.fuelSurchargeRate = surcharge[0];
  if (meter) sources.meterCharge = meter[0];
  if (vat) sources.vatAmount = vat[0];
  return {
    accountNo: acc[1],
    premisesName: premises?.[1]?.trim() ?? null,
    tariffCategory: cat === "commercial" || cat === "industrial" || cat === "residential" ? cat : "unknown",
    periodStart: toIso(period[1]),
    periodEnd: toIso(period[2]),
    kwh: num(kwh[1]),
    fuelSurchargeRate: surcharge ? Number(surcharge[1]) : null,
    meterCharge: meter ? num(meter[1]) : null,
    vatAmount: vat ? num(vat[1]) : null,
    totalAed: num(total[1]),
    confidence: 0.95,
    fieldSources: sources,
  };
}

export async function extractWithAI(text: string): Promise<BillExtraction | null> {
  const client = getOpenAI();
  if (!client) return null;
  const res = await client.chat.completions.parse({
    model: MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You extract structured fields from DEWA (Dubai Electricity & Water Authority) electricity bills. Read only what is printed. Dates must be ISO YYYY-MM-DD. For every field include the exact text snippet it came from in fieldSources. Set confidence below 0.7 if any required field is uncertain.",
      },
      { role: "user", content: text.slice(0, 12000) },
    ],
    response_format: zodResponseFormat(BillExtractionSchema, "bill"),
  });
  const parsed = res.choices[0]?.message?.parsed;
  if (!parsed) return null;
  return BillExtractionSchema.parse(parsed);
}

export interface ExtractResult {
  extraction: BillExtraction;
  method: "pdf-rules" | "pdf-ai";
  text: string;
}

export async function extractBill(bytes: Uint8Array): Promise<ExtractResult | { error: string; text: string }> {
  const text = await pdfToText(bytes);
  if (text.trim().length < 50) return { error: "No text layer found in PDF (scanned image?). Use the CSV fallback.", text };
  const byRules = parseBillTextByRules(text);
  if (byRules) return { extraction: byRules, method: "pdf-rules", text };
  try {
    const ai = await extractWithAI(text);
    if (ai) return { extraction: ai, method: "pdf-ai", text };
  } catch (e) {
    return { error: `AI extraction failed: ${e instanceof Error ? e.message : String(e)}`, text };
  }
  return { error: "Layout not recognised and no OPENAI_API_KEY configured for AI extraction.", text };
}

export function billMonthOf(periodStart: string, periodEnd: string): string {
  // Bill month = month containing the majority of the period (midpoint)
  const a = new Date(periodStart).getTime();
  const z = new Date(periodEnd).getTime();
  const mid = new Date((a + z) / 2);
  return `${mid.getUTCFullYear()}-${String(mid.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Builds a Bill from extracted fields, recomputing charges from the tariff and reconciling with the printed total. */
export function toBill(
  x: BillExtraction,
  siteId: string,
  premises: PremisesType,
  settings: Settings,
  method: Bill["extractionMethod"],
  sourceFileId?: string,
): Bill {
  const surchargeRate = x.fuelSurchargeRate ?? settings.tariff.defaultSurchargeRate;
  const meter = x.meterCharge ?? settings.tariff.meterCharge;
  const c = calcBill(x.kwh, settings.tariff, premises, surchargeRate, meter);
  const notes: string[] = [];
  if (x.fuelSurchargeRate === null) notes.push(`Fuel surcharge not found on bill; assumed ${settings.tariff.defaultSurchargeRate} AED/kWh (${settings.tariff.surchargeMonthLabel})`);
  if (x.meterCharge === null) notes.push(`Meter charge not found; assumed AED ${settings.tariff.meterCharge}`);
  const delta = round2(x.totalAed - c.total);
  let status: Bill["status"] = "ok";
  if (x.confidence < settings.thresholds.minConfidence) {
    status = "needs_review";
    notes.push(`Extraction confidence ${Math.round(x.confidence * 100)}% below threshold`);
  }
  if (Math.abs(delta) > settings.thresholds.totalMismatchAed) {
    notes.push(`Printed total AED ${x.totalAed.toFixed(2)} differs from recomputed AED ${c.total.toFixed(2)} by ${delta.toFixed(2)}`);
  }
  return {
    id: `bill-${x.accountNo}-${x.periodStart}-${Math.random().toString(36).slice(2, 7)}`,
    siteId,
    sourceFileId,
    accountNo: x.accountNo,
    periodStart: x.periodStart,
    periodEnd: x.periodEnd,
    billMonth: billMonthOf(x.periodStart, x.periodEnd),
    kwh: x.kwh,
    slabBreakdown: c.slabs,
    fuelSurchargeRate: surchargeRate,
    fuelSurchargeAmount: c.surcharge,
    meterCharge: meter,
    vatAmount: x.vatAmount ?? c.vat,
    totalAed: x.totalAed,
    printedTotalAed: x.totalAed,
    extractionConfidence: x.confidence,
    extractionMethod: method,
    fieldSources: x.fieldSources,
    status,
    notes: notes.length ? notes : undefined,
  };
}

export const CsvRowSchema = z.object({
  site: z.string().min(1),
  account_no: z.string().min(1),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kwh: z.coerce.number().positive(),
  fuel_surcharge_rate: z.coerce.number().optional(),
  meter_charge: z.coerce.number().optional(),
  total_aed: z.coerce.number().optional(),
  premises_type: z.enum(["commercial", "industrial"]).optional(),
});
export type CsvRow = z.infer<typeof CsvRowSchema>;

export function parseCsv(text: string): { rows: CsvRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], errors: ["CSV has no data rows"] };
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows: CsvRow[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    const obj: Record<string, string> = {};
    header.forEach((h, k) => {
      if (cells[k] !== undefined && cells[k] !== "") obj[h] = cells[k];
    });
    const r = CsvRowSchema.safeParse(obj);
    if (r.success) rows.push(r.data);
    else errors.push(`Row ${i + 2}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
  });
  return { rows, errors };
}

export function csvRowToExtraction(r: CsvRow, settings: Settings, premises: PremisesType): BillExtraction {
  const surcharge = r.fuel_surcharge_rate ?? null;
  const meter = r.meter_charge ?? null;
  const c = calcBill(r.kwh, settings.tariff, premises, surcharge ?? settings.tariff.defaultSurchargeRate, meter ?? settings.tariff.meterCharge);
  return {
    accountNo: r.account_no,
    premisesName: r.site,
    tariffCategory: premises,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    kwh: r.kwh,
    fuelSurchargeRate: surcharge,
    meterCharge: meter,
    vatAmount: null,
    totalAed: r.total_aed ?? c.total,
    confidence: 1,
    fieldSources: { source: r.total_aed === undefined ? "CSV row (total derived from tariff)" : "CSV row" },
  };
}
