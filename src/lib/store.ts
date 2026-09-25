import fs from "node:fs";
import path from "node:path";
import type { Bill, Explanation, PremisesType, Settings, Site, SourceFile, Store } from "./types";
import { DEFAULT_TARIFF } from "./tariff";
import { DEFAULT_THRESHOLDS } from "./analysis";
import { buildSampleBills, SAMPLE_SITES } from "./sample";
import { DEFAULT_CONTRACTORS } from "./contractors";

export const DATA_DIR = process.env.WATTWATCH_DATA_DIR ?? path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

export const DEFAULT_SETTINGS: Settings = {
  tariff: DEFAULT_TARIFF,
  emissionFactor: {
    enabled: true,
    year: 2024,
    kgCo2ePerKwh: 0.4045,
    source: "DEWA Sustainability Report (grid emission intensity, 2024 data) as indexed by Climatiq",
    sourceUrl: "https://www.dewa.gov.ae/en/consumer/sustainability/sustainability-reports",
    method: "location-based",
  },
  thresholds: DEFAULT_THRESHOLDS,
};

function emptyStore(): Store {
  return { sites: [], bills: [], files: [], settings: DEFAULT_SETTINGS, explanations: {}, contractors: DEFAULT_CONTRACTORS, actions: {} };
}

export function sampleStore(): Store {
  return {
    sites: SAMPLE_SITES,
    bills: buildSampleBills(),
    files: [],
    settings: DEFAULT_SETTINGS,
    explanations: {},
    contractors: DEFAULT_CONTRACTORS,
    actions: {},
  };
}

export function readStore(): Store {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      ...emptyStore(),
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      contractors: parsed.contractors ?? DEFAULT_CONTRACTORS,
      actions: parsed.actions ?? {},
    };
  } catch {
    return emptyStore();
  }
}

export function writeStore(store: Store): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function update(fn: (s: Store) => void): Store {
  const s = readStore();
  fn(s);
  writeStore(s);
  return s;
}

export function loadSample(): Store {
  const s = sampleStore();
  writeStore(s);
  return s;
}

export function resetStore(): void {
  writeStore(emptyStore());
}

export function upsertSiteByAccount(store: Store, accountNo: string, name: string, premisesType: PremisesType = "commercial"): Site {
  let site = store.sites.find((s) => s.dewaAccountNo === accountNo);
  if (!site) {
    site = {
      id: `site-${store.sites.length + 1}-${accountNo.slice(-4)}`,
      name,
      dewaAccountNo: accountNo,
      premisesType,
      hasOwnCooling: true,
    };
    store.sites.push(site);
  }
  return site;
}

/** Marks the bill duplicate if another bill for the same account overlaps its period. */
export function addBill(store: Store, bill: Bill): Bill {
  const overlap = store.bills.find(
    (b) =>
      b.accountNo === bill.accountNo &&
      b.status !== "duplicate" &&
      b.periodStart <= bill.periodEnd &&
      bill.periodStart <= b.periodEnd,
  );
  if (overlap) {
    bill.status = "duplicate";
    bill.notes = [...(bill.notes ?? []), `Overlaps existing bill ${overlap.id} (${overlap.periodStart} – ${overlap.periodEnd})`];
  }
  store.bills.push(bill);
  return bill;
}

export function addFile(store: Store, file: SourceFile): void {
  store.files.push(file);
}

export function saveExplanation(e: Explanation): void {
  update((s) => {
    s.explanations[e.findingId] = e;
  });
}
