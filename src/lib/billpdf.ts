import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Bill, Site } from "./types";

function d(iso: string): string {
  const [y, m, day] = iso.split("-");
  return `${day}/${m}/${y}`;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ascii(s: string): string {
  return s.replace(/[—–]/g, "-").replace(/[^\x20-\x7E]/g, "");
}

/** Renders a bill in a DEWA "Green Bill"-like layout with a real text layer. */
export async function renderBillPdf(bill: Bill, site: Site): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.05, 0.45, 0.25);
  let y = 790;

  const text = (s: string, x: number, size = 10, f = font, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(ascii(s), { x, y, size, font: f, color });
  };
  const row = (label: string, mid: string, value: string, f = font) => {
    text(label, 50, 10, f);
    text(mid, 270, 10, f);
    page.drawText(ascii(value), { x: 545 - f.widthOfTextAtSize(ascii(value), 10), y, size: 10, font: f });
    y -= 16;
  };

  page.drawRectangle({ x: 0, y: 800, width: 595, height: 42, color: green });
  page.drawText("Dubai Electricity & Water Authority", { x: 50, y: 815, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText("GREEN BILL - ELECTRICITY", { x: 400, y: 815, size: 11, font: bold, color: rgb(1, 1, 1) });
  y = 770;

  text(`Account Number: ${bill.accountNo}`, 50, 11, bold);
  y -= 16;
  text(`Premises: ${site.name}`, 50);
  y -= 16;
  text(`Tariff Category: ${site.premisesType === "industrial" ? "Industrial" : "Commercial"}`, 50);
  y -= 16;
  text(`Billing Period: ${d(bill.periodStart)} - ${d(bill.periodEnd)}`, 50);
  y -= 16;
  text(`Bill Month: ${bill.billMonth}`, 50);
  y -= 28;

  text(`Electricity Consumption: ${bill.kwh} kWh`, 50, 12, bold, green);
  y -= 26;

  text("Description", 50, 10, bold);
  text("Calculation", 270, 10, bold);
  page.drawText("Amount (AED)", { x: 545 - bold.widthOfTextAtSize("Amount (AED)", 10), y, size: 10, font: bold });
  y -= 6;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5 });
  y -= 14;

  for (const s of bill.slabBreakdown) {
    row(`Slab ${s.from + 1}-${s.to ?? "above"} kWh`, `${s.kwh} kWh x ${s.rate.toFixed(3)}`, money(s.amount));
  }
  row("Fuel Surcharge", `${bill.kwh} kWh x ${bill.fuelSurchargeRate.toFixed(3)}`, money(bill.fuelSurchargeAmount));
  row("Meter Service Charge", "Meter Type 3", money(bill.meterCharge));
  const subtotal = Math.round((bill.totalAed - bill.vatAmount) * 100) / 100;
  row("Subtotal", "", money(subtotal));
  row("VAT 5%", `${money(subtotal)} x 0.05`, money(bill.vatAmount));
  y -= 4;
  page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 545, y: y + 10 }, thickness: 0.5 });
  row("Total Amount Due (AED)", "", money(bill.totalAed), bold);

  y -= 30;
  text("Fuel surcharge is applied per DEWA's monthly published rate. Slab tariff per Dubai Supreme Council of Energy.", 50, 8);
  y -= 12;
  text("This is a synthetic sample bill generated for demonstration purposes only. Not an official DEWA document.", 50, 8, font, rgb(0.5, 0.5, 0.5));

  return doc.save();
}
