import { actionPlan, analyse } from "@/lib/analysis";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

function csvField(value: string | number | undefined): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET() {
  const store = readStore();
  const rows = actionPlan(store.sites, analyse(store.sites, store.bills, store.settings), store.actions);
  const headers = ["Finding ID", "Related count", "Site", "Action", "Kind", "AED/month", "AED/year", "Capex", "Payback months", "Owner", "Status", "Due date"];
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.findingId,
        row.relatedCount,
        row.siteName,
        row.action,
        row.kind,
        row.monthlyAed,
        row.annualAed,
        row.capexAed,
        row.paybackMonths ?? "",
        row.owner,
        row.status,
        row.dueDate,
      ]
        .map(csvField)
        .join(","),
    ),
  ];
  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="wattwatch-action-plan.csv"',
    },
  });
}
