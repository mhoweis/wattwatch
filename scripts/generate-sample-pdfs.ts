import fs from "node:fs";
import path from "node:path";
import { buildSampleBills, SAMPLE_SITES, sampleCsv } from "../src/lib/sample";
import { renderBillPdf } from "../src/lib/billpdf";

async function main() {
  const out = path.join(process.cwd(), "public", "sample");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "sample-bills.csv"), sampleCsv());
  const names: string[] = [];
  for (const bill of buildSampleBills()) {
    const site = SAMPLE_SITES.find((s) => s.id === bill.siteId)!;
    const bytes = await renderBillPdf(bill, site);
    const suffix = bill.status === "duplicate" ? "-copy" : "";
    const name = `DEWA-${bill.accountNo}-${bill.billMonth}${suffix}.pdf`;
    fs.writeFileSync(path.join(out, name), bytes);
    names.push(name);
  }
  fs.writeFileSync(path.join(out, "index.json"), JSON.stringify(names, null, 2));
  console.log(`Wrote ${names.length} PDFs + CSV to ${out}`);
}

main();
