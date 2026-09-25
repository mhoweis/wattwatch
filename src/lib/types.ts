export type PremisesType = "commercial" | "industrial";

export interface Site {
  id: string;
  name: string;
  nameAr?: string;
  dewaAccountNo: string;
  premisesType: PremisesType;
  areaSqm?: number;
  hasOwnCooling: boolean;
}

export interface SlabLine {
  from: number;
  to: number | null;
  kwh: number;
  rate: number;
  amount: number;
}

export type BillStatus = "ok" | "needs_review" | "duplicate";

export interface Bill {
  id: string;
  siteId: string;
  sourceFileId?: string;
  accountNo: string;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  billMonth: string; // YYYY-MM
  kwh: number;
  slabBreakdown: SlabLine[];
  fuelSurchargeRate: number;
  fuelSurchargeAmount: number;
  meterCharge: number;
  vatAmount: number;
  totalAed: number;
  printedTotalAed?: number;
  extractionConfidence: number;
  extractionMethod: "csv" | "sample" | "pdf-rules" | "pdf-ai";
  fieldSources?: Record<string, string>;
  status: BillStatus;
  notes?: string[];
}

export interface SourceFile {
  id: string;
  filename: string;
  type: "pdf" | "csv";
  uploadedAt: string;
  path?: string;
}

export type FindingType =
  | "SPIKE_VS_BASELINE"
  | "SUSTAINED_DRIFT"
  | "PEER_OUTLIER"
  | "SLAB_BAND_JUMP"
  | "MISSING_BILL"
  | "DUPLICATE_BILL"
  | "TOTAL_MISMATCH";

export type Severity = "high" | "medium" | "data-quality";

export interface CalcLine {
  label: string;
  formula: string;
  value: number;
  unit: "kWh" | "AED" | "%" | "kWh/day" | "kgCO2e" | "days";
}

export interface Finding {
  id: string;
  siteId: string;
  type: FindingType;
  severity: Severity;
  billMonth: string;
  headline: string;
  whyHint: string;
  metrics: Record<string, number>;
  evidenceBillIds: string[];
  calcTrace: CalcLine[];
  excessKwh: number;
  excessAed: number;
  score: number;
}

export interface TariffSlab {
  from: number;
  to: number | null;
  rate: number;
}

export interface TariffConfig {
  effectiveFrom: string;
  sourceUrl: string;
  sourceNote: string;
  commercial: TariffSlab[];
  industrial: TariffSlab[];
  meterCharge: number;
  vatRate: number;
  defaultSurchargeRate: number;
  surchargeMonthLabel: string;
}

export interface EmissionFactor {
  enabled: boolean;
  year: number;
  kgCo2ePerKwh: number;
  source: string;
  sourceUrl: string;
  method: "location-based";
}

export interface Thresholds {
  spikePct: number;
  spikeHighPct: number;
  driftPct: number;
  peerPct: number;
  baselineMonths: number;
  totalMismatchAed: number;
  minConfidence: number;
}

export interface Settings {
  tariff: TariffConfig;
  emissionFactor: EmissionFactor;
  thresholds: Thresholds;
}

export interface Explanation {
  findingId: string;
  generatedAt: string;
  model: string;
  headline_en: string;
  headline_ar: string;
  explanation_en: string;
  explanation_ar: string;
  actions: ActionItem[];
  guardWarnings: string[];
}

export interface ActionItem {
  title_en: string;
  title_ar: string;
  owner: string;
  effort: "low" | "medium" | "high";
  checks_en: string[];
  checks_ar: string[];
}

export interface Store {
  sites: Site[];
  bills: Bill[];
  files: SourceFile[];
  settings: Settings;
  explanations: Record<string, Explanation>;
}
