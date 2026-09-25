import type { Contractor, Finding, Site, Specialty } from "./types";

export const SPECIALTY_LABEL: Record<Specialty, { en: string; ar: string }> = {
  hvac: { en: "HVAC / AC maintenance", ar: "صيانة التكييف" },
  electrical: { en: "Electrical contractor", ar: "مقاول كهرباء" },
  bms: { en: "BMS / controls & timers", ar: "أنظمة إدارة المباني والمؤقتات" },
  "energy-audit": { en: "Energy audit (ESCO)", ar: "تدقيق الطاقة" },
  lighting: { en: "Lighting retrofit", ar: "تحديث الإنارة" },
  refrigeration: { en: "Commercial refrigeration", ar: "التبريد التجاري" },
  billing: { en: "DEWA billing & disputes", ar: "فواتير ديوا والاعتراضات" },
};

/** Which trades to call for each finding type. First entry is the primary contact. */
export function specialtiesFor(f: Finding, site: Site): { specialty: Specialty; reason: string }[] {
  const summer = ["05", "06", "07", "08", "09"].includes(f.billMonth.slice(5));
  switch (f.type) {
    case "TOTAL_MISMATCH":
      return [{ specialty: "billing", reason: "Raise the tariff/total discrepancy with DEWA and request a re-rated bill." }];
    case "MISSING_BILL":
    case "DUPLICATE_BILL":
      return [{ specialty: "billing", reason: "Request the missing / confirm the duplicate bill on the account." }];
    case "SPIKE_VS_BASELINE":
      return [
        ...(site.hasOwnCooling ? [{ specialty: "hvac" as const, reason: summer ? "Check AC set-points, schedules, filters and refrigerant before peak summer load compounds it." : "Inspect AC schedules and set-points; a spike outside summer is rarely weather-driven." }] : []),
        { specialty: "electrical", reason: "Trace after-hours loads with a clamp meter or sub-metering; find equipment left running." },
        { specialty: "bms", reason: "Install or reprogram timers/BMS schedules so lighting and AC follow opening hours." },
      ];
    case "SUSTAINED_DRIFT":
      return [
        ...(site.hasOwnCooling ? [{ specialty: "hvac" as const, reason: "Gradual creep points to dirty coils, failing compressors or refrigerant loss — book a service." }] : []),
        { specialty: "energy-audit", reason: "A walk-through audit pins down which system is degrading." },
        { specialty: "refrigeration", reason: "If the site runs chillers or display fridges, check door seals and condenser coils." },
      ];
    case "PEER_OUTLIER":
      return [
        { specialty: "energy-audit", reason: "Benchmark this branch against the best performer: envelope, hours, equipment inventory." },
        { specialty: "lighting", reason: "Lighting retrofits are the fastest fix when a branch runs consistently above peers." },
        ...(site.hasOwnCooling ? [{ specialty: "hvac" as const, reason: "Compare AC capacity and age with peer branches." }] : []),
      ];
    case "SLAB_BAND_JUMP":
      return [
        { specialty: "bms", reason: "Load scheduling/peak shaving can keep the month under the slab boundary." },
        { specialty: "energy-audit", reason: "Identify the cheapest kWh to cut to stay in the lower band." },
      ];
  }
}

function areaOf(site: Site): string | null {
  const m = / [—-] (.+)$/.exec(site.name);
  if (!m) return null;
  return m[1].replace(/^(Showroom|Store|Clinic|Office|Warehouse|Kiosk)\s+/i, "").trim();
}

/** Contractors matching a specialty, those covering the site's area first. */
export function matchContractors(contractors: Contractor[], specialty: Specialty, site: Site): Contractor[] {
  const area = areaOf(site)?.toLowerCase() ?? null;
  const covers = (c: Contractor) => area !== null && c.areas.some((a) => a === "*" || area.includes(a.toLowerCase()) || a.toLowerCase().includes(area));
  return contractors
    .filter((c) => c.specialties.includes(specialty))
    .sort((a, b) => Number(covers(b)) - Number(covers(a)) || Number(Boolean(a.demo)) - Number(Boolean(b.demo)));
}

export const DEFAULT_CONTRACTORS: Contractor[] = [
  {
    id: "dewa",
    name: "DEWA Customer Care",
    nameAr: "خدمة عملاء هيئة كهرباء ومياه دبي",
    specialties: ["billing"],
    areas: ["*"],
    phone: "+97146019999",
    url: "https://www.dewa.gov.ae/en/consumer/billing",
    note: "Bill disputes, tariff category corrections, missing bills. Official channel.",
  },
  {
    id: "demo-hvac-1",
    name: "CoolFlow Technical Services",
    nameAr: "كول فلو للخدمات الفنية",
    specialties: ["hvac", "refrigeration"],
    areas: ["Al Quoz", "Jumeirah", "Al Barsha", "Business Bay"],
    phone: "+97150000001",
    whatsapp: "+97150000001",
    note: "Split & package AC servicing, coil cleaning, refrigerant top-up. Same-day for Al Quoz.",
    demo: true,
  },
  {
    id: "demo-hvac-2",
    name: "Gulf Climate Maintenance",
    nameAr: "جلف كلايمت للصيانة",
    specialties: ["hvac", "bms"],
    areas: ["Deira", "Bur Dubai", "Al Garhoud", "Dubai Marina"],
    phone: "+97150000002",
    whatsapp: "+97150000002",
    note: "Chiller & AHU maintenance, thermostat and schedule programming.",
    demo: true,
  },
  {
    id: "demo-elec-1",
    name: "Volt & Wire Electrical LLC",
    nameAr: "فولت آند واير للكهرباء",
    specialties: ["electrical", "bms"],
    areas: ["*"],
    phone: "+97150000003",
    whatsapp: "+97150000003",
    note: "DEWA-approved contractor. Sub-metering, load surveys, timer installation.",
    demo: true,
  },
  {
    id: "demo-esco-1",
    name: "Etihad ESCO",
    nameAr: "الاتحاد إسكو",
    specialties: ["energy-audit", "lighting"],
    areas: ["*"],
    url: "https://etihadesco.ae",
    note: "Dubai government energy services company; audits and retrofit financing for commercial buildings.",
  },
  {
    id: "demo-light-1",
    name: "BrightSave Lighting Retrofits",
    nameAr: "برايت سيف لتحديث الإنارة",
    specialties: ["lighting", "electrical"],
    areas: ["Deira", "Al Quoz", "Jebel Ali", "Dubai Investment Park"],
    phone: "+97150000005",
    email: "hello@brightsave.example",
    note: "LED retrofits with payback modelling.",
    demo: true,
  },
  {
    id: "demo-ref-1",
    name: "Jebel Ali Refrigeration Works",
    nameAr: "جبل علي لأعمال التبريد",
    specialties: ["refrigeration", "hvac"],
    areas: ["Jebel Ali", "Dubai Industrial City", "Dubai Investment Park"],
    phone: "+97150000006",
    whatsapp: "+97150000006",
    note: "Cold rooms, industrial chillers, compressor overhauls.",
    demo: true,
  },
];
