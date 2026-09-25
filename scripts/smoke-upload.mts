import fs from "node:fs";
import path from "node:path";
import { analyse } from "../src/lib/analysis";
import { extractBill, parseCsv, csvRowToExtraction, toBill } from "../src/lib/extract";
import { addBill, readStore, resetStore, upsertSiteByAccount, writeStore } from "../src/lib/store";
import type { PremisesType } from "../src/lib/types";

/** Runs a folder of sample PDFs/CSVs through the same ingestion path as the upload action. Usage: tsx scripts/smoke-upload.mts public/sample/variety */
const dir = process.argv[2] ?? "public/sample";
resetStore();
const s = readStore();
for (const f of fs.readdirSync(dir).sort()) {
  const bytes = fs.readFileSync(path.join(dir, f));
  if (f.endsWith(".pdf")) {
    const ex = await extractBill(new Uint8Array(bytes));
    if ("error" in ex) {
      console.log(`FAIL ${f}: ${ex.error}`);
      continue;
    }
    const cat: PremisesType = ex.extraction.tariffCategory === "industrial" ? "industrial" : "commercial";
    const site = upsertSiteByAccount(s, ex.extraction.accountNo, ex.extraction.premisesName ?? ex.extraction.accountNo, cat);
    const b = addBill(s, toBill(ex.extraction, site.id, site.premisesType, s.settings, ex.method));
    console.log(`ok   ${f}: ${site.name} ${b.billMonth} ${b.kwh} kWh ${b.status} ${b.notes?.join(" | ") ?? ""}`);
  } else if (f === "scanned-bill-fallback.csv") {
    const { rows, errors } = parseCsv(bytes.toString("utf8"));
    errors.forEach((e) => console.log(`CSV error: ${e}`));
    for (const r of rows) {
      const cat: PremisesType = r.premises_type === "industrial" ? "industrial" : "commercial";
      const site = upsertSiteByAccount(s, r.account_no, r.site, cat);
      const b = addBill(s, toBill(csvRowToExtraction(r, s.settings, site.premisesType), site.id, site.premisesType, s.settings, "csv"));
      console.log(`ok   ${f}: ${site.name} ${b.billMonth} ${b.kwh} kWh ${b.status}`);
    }
  }
}
writeStore(s);
for (const f of analyse(s.sites, s.bills, s.settings)) console.log(`${f.severity.padEnd(12)} ${f.type.padEnd(18)} ${f.headline}`);
