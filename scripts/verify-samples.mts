import fs from "node:fs";
import path from "node:path";
import { extractBill, parseCsv } from "../src/lib/extract";

/** Cross-checks every sample PDF against the CSV that generated it. Usage: tsx scripts/verify-samples.mts public/sample sample-bills.csv */
const dir = process.argv[2] ?? "public/sample";
const csvName = process.argv[3] ?? "sample-bills.csv";
const { rows } = parseCsv(fs.readFileSync(path.join(dir, csvName), "utf8"));
let failures = 0;
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".pdf")).sort()) {
  const ex = await extractBill(new Uint8Array(fs.readFileSync(path.join(dir, f))));
  if ("error" in ex) {
    console.log(`SKIP ${f}: ${ex.error}`);
    continue;
  }
  const x = ex.extraction;
  const row = rows.find((r) => r.account_no === x.accountNo && r.period_start === x.periodStart);
  if (!row) {
    console.log(`FAIL ${f}: no CSV row for ${x.accountNo} ${x.periodStart}`);
    failures++;
    continue;
  }
  const diffs: string[] = [];
  if (row.period_end !== x.periodEnd) diffs.push(`periodEnd ${x.periodEnd}≠${row.period_end}`);
  if (row.kwh !== x.kwh) diffs.push(`kwh ${x.kwh}≠${row.kwh}`);
  if (row.fuel_surcharge_rate !== undefined && row.fuel_surcharge_rate !== x.fuelSurchargeRate) diffs.push(`surcharge ${x.fuelSurchargeRate}≠${row.fuel_surcharge_rate}`);
  if (row.meter_charge !== undefined && row.meter_charge !== x.meterCharge) diffs.push(`meter ${x.meterCharge}≠${row.meter_charge}`);
  if (row.total_aed !== undefined && Math.abs(row.total_aed - x.totalAed) > 0.005) diffs.push(`total ${x.totalAed}≠${row.total_aed}`);
  if (row.premises_type && row.premises_type !== x.tariffCategory) diffs.push(`category ${x.tariffCategory}≠${row.premises_type}`);
  const norm = (s: string | null | undefined) => (s ?? "").replace(/[—–-]/g, "-").replace(/\s+/g, " ").trim();
  if (norm(x.premisesName) !== norm(row.site)) diffs.push(`premises "${x.premisesName}"≠"${row.site}"`);
  if (x.vatAmount === null) diffs.push("vat missing");
  if (diffs.length) {
    failures++;
    console.log(`FAIL ${f}: ${diffs.join(", ")}`);
  } else console.log(`ok   ${f} (${ex.method})`);
}
console.log(failures ? `${failures} mismatch(es)` : "all PDFs match their CSV rows");
process.exit(failures ? 1 : 0);
