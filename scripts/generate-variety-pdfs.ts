import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import { renderBillPdf } from "../src/lib/billpdf";
import { billMonthOf } from "../src/lib/extract";
import { calcBill, DEFAULT_TARIFF } from "../src/lib/tariff";
import type { Bill, PremisesType, Site } from "../src/lib/types";

/**
 * A second sample pack that exercises the edge cases the core 3x6 set does not:
 * industrial tariff, off-calendar billing periods, a different fuel surcharge,
 * a bill charged on the wrong tariff category, sustained month-on-month drift,
 * and a scanned (image-only) PDF that must fall back to CSV.
 */

const SITES: Site[] = [
  { id: "v-d", name: "Warehouse D - Jebel Ali", nameAr: "المستودع د — جبل علي", dewaAccountNo: "2001234504", premisesType: "industrial", areaSqm: 2400, hasOwnCooling: true },
  { id: "v-e", name: "Office E - Business Bay", nameAr: "المكتب هـ — الخليج التجاري", dewaAccountNo: "2001234505", premisesType: "commercial", areaSqm: 380, hasOwnCooling: true },
  { id: "v-f", name: "Kiosk F - Dubai Marina", nameAr: "الكشك و — دبي مارينا", dewaAccountNo: "2001234506", premisesType: "commercial", areaSqm: 45, hasOwnCooling: false },
];

interface Row {
  siteId: string;
  start: string;
  end: string;
  kwh: number;
  surcharge?: number;
  /** Compute the printed amounts on this tariff category instead of the site's (billing error). */
  billedAs?: PremisesType;
  /** Render without a text layer (simulates a scanned bill). */
  scanned?: boolean;
}

const ROWS: Row[] = [
  // Industrial site, off-calendar 14th-to-13th billing cycle, surcharge changes mid-year
  { siteId: "v-d", start: "2026-03-14", end: "2026-04-13", kwh: 14200 },
  { siteId: "v-d", start: "2026-04-14", end: "2026-05-13", kwh: 14650 },
  { siteId: "v-d", start: "2026-05-14", end: "2026-06-13", kwh: 14900, surcharge: 0.065 },
  { siteId: "v-d", start: "2026-06-14", end: "2026-07-13", kwh: 15100, surcharge: 0.065 },
  { siteId: "v-d", start: "2026-07-14", end: "2026-08-13", kwh: 15300, surcharge: 0.065, billedAs: "commercial" }, // charged on commercial slabs by mistake
  { siteId: "v-d", start: "2026-08-14", end: "2026-09-13", kwh: 15050, surcharge: 0.065 },

  // Small office with steady drift (~+10% per day every month) -> SUSTAINED_DRIFT
  { siteId: "v-e", start: "2026-03-01", end: "2026-03-31", kwh: 3100 },
  { siteId: "v-e", start: "2026-04-01", end: "2026-04-30", kwh: 3300 },
  { siteId: "v-e", start: "2026-05-01", end: "2026-05-31", kwh: 3760 },
  { siteId: "v-e", start: "2026-06-01", end: "2026-06-30", kwh: 4020 },
  { siteId: "v-e", start: "2026-07-01", end: "2026-07-31", kwh: 4580 },
  { siteId: "v-e", start: "2026-08-01", end: "2026-08-31", kwh: 5060 },

  // Kiosk on district cooling: tiny, flat load; one scanned bill with no text layer
  { siteId: "v-f", start: "2026-03-01", end: "2026-03-31", kwh: 610 },
  { siteId: "v-f", start: "2026-04-01", end: "2026-04-30", kwh: 640 },
  { siteId: "v-f", start: "2026-05-01", end: "2026-05-31", kwh: 655, scanned: true },
  { siteId: "v-f", start: "2026-06-01", end: "2026-06-30", kwh: 670 },
  { siteId: "v-f", start: "2026-07-01", end: "2026-07-31", kwh: 690 },
  { siteId: "v-f", start: "2026-08-01", end: "2026-08-31", kwh: 685 },
];

function buildBill(r: Row, i: number): Bill {
  const site = SITES.find((s) => s.id === r.siteId)!;
  const surcharge = r.surcharge ?? DEFAULT_TARIFF.defaultSurchargeRate;
  const c = calcBill(r.kwh, DEFAULT_TARIFF, r.billedAs ?? site.premisesType, surcharge, DEFAULT_TARIFF.meterCharge);
  return {
    id: `variety-${i + 1}`,
    siteId: site.id,
    accountNo: site.dewaAccountNo,
    periodStart: r.start,
    periodEnd: r.end,
    billMonth: billMonthOf(r.start, r.end),
    kwh: r.kwh,
    slabBreakdown: c.slabs,
    fuelSurchargeRate: c.surchargeRate,
    fuelSurchargeAmount: c.surcharge,
    meterCharge: c.meterCharge,
    vatAmount: c.vat,
    totalAed: c.total,
    printedTotalAed: c.total,
    extractionConfidence: 1,
    extractionMethod: "sample",
    status: "ok",
  };
}

/** Image-only page: same layout blocks as a bill but rendered as shapes, so text extraction returns nothing. */
async function renderScannedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawRectangle({ x: 0, y: 800, width: 595, height: 42, color: rgb(0.05, 0.45, 0.25) });
  const grey = rgb(0.75, 0.75, 0.75);
  let y = 770;
  for (const w of [180, 220, 160, 200, 120]) {
    page.drawRectangle({ x: 50, y, width: w, height: 8, color: grey });
    y -= 16;
  }
  y -= 20;
  for (let i = 0; i < 8; i++) {
    page.drawRectangle({ x: 50, y, width: 150, height: 7, color: grey });
    page.drawRectangle({ x: 270, y, width: 120, height: 7, color: grey });
    page.drawRectangle({ x: 480, y, width: 65, height: 7, color: grey });
    y -= 16;
  }
  page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 545, y: y + 10 }, thickness: 0.5 });
  return doc.save();
}

async function main() {
  const out = path.join(process.cwd(), "public", "sample", "variety");
  fs.mkdirSync(out, { recursive: true });
  const bills = ROWS.map(buildBill);
  const names: string[] = [];
  for (const [i, bill] of bills.entries()) {
    const site = SITES.find((s) => s.id === bill.siteId)!;
    const scanned = ROWS[i].scanned;
    const bytes = scanned ? await renderScannedPdf() : await renderBillPdf(bill, site);
    const name = `DEWA-${bill.accountNo}-${bill.billMonth}${scanned ? "-scanned" : ""}.pdf`;
    fs.writeFileSync(path.join(out, name), bytes);
    names.push(name);
  }
  const header = "site,account_no,period_start,period_end,kwh,fuel_surcharge_rate,meter_charge,total_aed,premises_type";
  const csv = bills
    .map((b) => {
      const site = SITES.find((s) => s.id === b.siteId)!;
      return [site.name, b.accountNo, b.periodStart, b.periodEnd, b.kwh, b.fuelSurchargeRate, b.meterCharge, b.totalAed, site.premisesType].join(",");
    });
  fs.writeFileSync(path.join(out, "variety-bills.csv"), [header, ...csv].join("\n") + "\n");
  const scannedRow = bills[ROWS.findIndex((r) => r.scanned)];
  const scannedSite = SITES.find((s) => s.id === scannedRow.siteId)!;
  fs.writeFileSync(
    path.join(out, "scanned-bill-fallback.csv"),
    [header, [scannedSite.name, scannedRow.accountNo, scannedRow.periodStart, scannedRow.periodEnd, scannedRow.kwh, scannedRow.fuelSurchargeRate, scannedRow.meterCharge, scannedRow.totalAed, scannedSite.premisesType].join(",")].join("\n") + "\n",
  );
  fs.writeFileSync(path.join(out, "index.json"), JSON.stringify(names, null, 2));
  console.log(`Wrote ${names.length} PDFs + 2 CSVs to ${out}`);
}

main();
