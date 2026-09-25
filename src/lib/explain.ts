import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ActionItem, Explanation, Finding, Site } from "./types";
import { getOpenAI, MODEL } from "./ai";
import { monthLabel } from "./analysis";

const ActionSchema = z.object({
  title_en: z.string(),
  title_ar: z.string(),
  owner: z.string(),
  effort: z.enum(["low", "medium", "high"]),
  checks_en: z.array(z.string()),
  checks_ar: z.array(z.string()),
});

const ExplanationSchema = z.object({
  headline_en: z.string(),
  headline_ar: z.string(),
  explanation_en: z.string(),
  explanation_ar: z.string(),
  actions: z.array(ActionSchema).min(2).max(5),
});

/** Flags any number in the generated text that does not appear in the finding's inputs. */
export function numberGuard(text: string, allowed: number[]): string[] {
  const allowedStr = new Set<string>();
  for (const n of allowed) {
    allowedStr.add(String(n));
    allowedStr.add(n.toFixed(0));
    allowedStr.add(n.toFixed(1));
    allowedStr.add(n.toFixed(2));
    allowedStr.add(Math.round(n).toLocaleString("en-US"));
    allowedStr.add(n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  const found = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return found.filter((f) => !allowedStr.has(f) && !allowedStr.has(f.replace(/,/g, "")) && Number(f.replace(/,/g, "")) > 12);
}

function allowedNumbers(f: Finding, site: Site): number[] {
  const nums = [...Object.values(f.metrics), ...f.calcTrace.map((c) => c.value), Number(f.billMonth.slice(0, 4)), Number(f.billMonth.slice(5))];
  if (site.areaSqm) nums.push(site.areaSqm);
  return nums;
}

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
function monthLabelAr(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${AR_MONTHS[m - 1]} ${y}`;
}

export function templateExplanation(f: Finding, site: Site): Omit<Explanation, "findingId" | "generatedAt" | "model" | "guardWarnings"> {
  const m = f.metrics;
  const en = monthLabel(f.billMonth);
  const ar = monthLabelAr(f.billMonth);
  const nameAr = site.nameAr ?? site.name;
  const coolingActions: ActionItem[] = [
    {
      title_en: "Audit cooling schedule and set-points",
      title_ar: "مراجعة جدول التبريد ودرجات الضبط",
      owner: "Facilities",
      effort: "low",
      checks_en: ["AC timers match opening hours", "Set-point 24°C during trading, setback after hours", "Filters and condenser coils cleaned in the last 90 days"],
      checks_ar: ["مؤقتات التكييف تطابق ساعات العمل", "درجة الضبط 24° خلال ساعات العمل مع رفعها بعد الإغلاق", "تنظيف الفلاتر وملفات المكثف خلال آخر 90 يومًا"],
    },
    {
      title_en: "Walk-through for after-hours loads",
      title_ar: "جولة تفقدية للأحمال بعد ساعات العمل",
      owner: "Branch manager",
      effort: "low",
      checks_en: ["Lighting, signage and displays off after closing", "No new equipment installed since the baseline months", "Water heaters and refrigeration on timers"],
      checks_ar: ["إطفاء الإنارة واللوحات والشاشات بعد الإغلاق", "عدم إضافة معدات جديدة منذ أشهر خط الأساس", "سخانات المياه والتبريد على مؤقتات"],
    },
    {
      title_en: "Re-check next bill against baseline",
      title_ar: "إعادة مقارنة الفاتورة التالية بخط الأساس",
      owner: "Finance",
      effort: "low",
      checks_en: ["Upload next month's bill to WattWatch", "Confirm kWh/day returns within 10% of baseline"],
      checks_ar: ["تحميل فاتورة الشهر القادم إلى WattWatch", "التأكد من عودة كيلوواط ساعة/يوم إلى حدود 10% من خط الأساس"],
    },
  ];
  const dataActions: ActionItem[] = [
    {
      title_en: "Resolve the billing record",
      title_ar: "تسوية سجل الفاتورة",
      owner: "Accounts payable",
      effort: "low",
      checks_en: ["Obtain the missing/duplicate bill from DEWA portal", "Confirm no double payment was made", "Re-upload to WattWatch"],
      checks_ar: ["الحصول على الفاتورة المفقودة/المكررة من بوابة ديوا", "التأكد من عدم الدفع مرتين", "إعادة التحميل إلى WattWatch"],
    },
    {
      title_en: "Verify against the PDF",
      title_ar: "التحقق من ملف الفاتورة",
      owner: "Finance",
      effort: "low",
      checks_en: ["Compare printed total with the tariff recomputation", "Check the tariff category printed on the bill"],
      checks_ar: ["مقارنة الإجمالي المطبوع مع إعادة الحساب وفق التعرفة", "التحقق من فئة التعرفة المطبوعة على الفاتورة"],
    },
  ];

  switch (f.type) {
    case "SPIKE_VS_BASELINE":
      return {
        headline_en: `${site.name}: electricity use up ${Math.round(m.pct)}% vs baseline in ${en}`,
        headline_ar: `${nameAr}: ارتفاع استهلاك الكهرباء بنسبة ${Math.round(m.pct)}% مقارنة بخط الأساس في ${ar}`,
        explanation_en: `Daily consumption reached ${m.currentKwhPerDay} kWh/day against a ${m.baselineKwhPerDay} kWh/day median of the preceding months. That is roughly ${m.excessKwh} kWh of excess over ${m.days} days, worth about AED ${m.excessAed.toFixed(2)} at the marginal tariff including fuel surcharge and VAT. ${f.whyHint}`,
        explanation_ar: `بلغ الاستهلاك اليومي ${m.currentKwhPerDay} كيلوواط ساعة/يوم مقابل وسيط ${m.baselineKwhPerDay} كيلوواط ساعة/يوم للأشهر السابقة، أي زيادة تقارب ${m.excessKwh} كيلوواط ساعة خلال ${m.days} يومًا بقيمة نحو ${m.excessAed.toFixed(2)} درهم وفق التعرفة الهامشية شاملة رسم الوقود وضريبة القيمة المضافة. يُنصح بمراجعة جدول التبريد والمعدات أولًا.`,
        actions: coolingActions,
      };
    case "SUSTAINED_DRIFT":
      return {
        headline_en: `${site.name}: consumption creeping up for three consecutive months`,
        headline_ar: `${nameAr}: ارتفاع تدريجي في الاستهلاك لثلاثة أشهر متتالية`,
        explanation_en: `Usage per day has risen for three months in a row, ${Math.round(m.pct)}% overall, roughly ${m.excessKwh} kWh (about AED ${m.excessAed.toFixed(2)}) in the latest month versus the start of the window. ${f.whyHint}`,
        explanation_ar: `ارتفع الاستهلاك اليومي لثلاثة أشهر متتالية بنسبة ${Math.round(m.pct)}% إجمالًا، أي نحو ${m.excessKwh} كيلوواط ساعة (حوالي ${m.excessAed.toFixed(2)} درهم) في آخر شهر مقارنة ببداية الفترة. غالبًا ما يشير ذلك إلى تراجع كفاءة المعدات أو تمدد ساعات التشغيل.`,
        actions: coolingActions,
      };
    case "PEER_OUTLIER":
      return {
        headline_en: `${site.name}: consistently above comparable branches`,
        headline_ar: `${nameAr}: أعلى باستمرار من الفروع المماثلة`,
        explanation_en: `This site used markedly more electricity per day than the median of comparable branches in ${m.hits} of the last months examined. Because peers face the same weather, the gap is unlikely to be seasonal. ${f.whyHint}`,
        explanation_ar: `استهلك هذا الموقع كهرباء يومية أعلى بشكل ملحوظ من وسيط الفروع المماثلة في ${m.hits} من الأشهر الأخيرة. ولأن الفروع تواجه الطقس نفسه، فمن غير المرجح أن يكون الفارق موسميًا. قارن المساحة وساعات العمل والمعدات مع أفضل فرع أداءً.`,
        actions: coolingActions,
      };
    case "SLAB_BAND_JUMP":
      return {
        headline_en: `${site.name}: crossed into the ${m.boundary + 1}+ kWh tariff band`,
        headline_ar: `${nameAr}: تجاوز شريحة التعرفة ${m.boundary + 1}+ كيلوواط ساعة`,
        explanation_en: `Consumption crossed the ${m.boundary} kWh slab boundary, so ${m.overKwh} kWh were billed at the higher slab rate — a step-up of about AED ${m.stepAed.toFixed(2)} incl. VAT. ${f.whyHint}`,
        explanation_ar: `تجاوز الاستهلاك حد الشريحة ${m.boundary} كيلوواط ساعة، فتمت فوترة ${m.overKwh} كيلوواط ساعة بالسعر الأعلى، بزيادة تقارب ${m.stepAed.toFixed(2)} درهم شاملة الضريبة. إبقاء الموقع تحت هذا الحد يتجنب الزيادة.`,
        actions: coolingActions,
      };
    case "MISSING_BILL":
      return {
        headline_en: `${site.name}: bill for ${en} is missing`,
        headline_ar: `${nameAr}: فاتورة ${ar} مفقودة`,
        explanation_en: `No bill was uploaded for ${en}. Baselines and trends for this site skip that month until it is added. ${f.whyHint}`,
        explanation_ar: `لم يتم تحميل فاتورة ${ar}. تتجاوز خطوط الأساس والاتجاهات هذا الشهر حتى تتم إضافتها. يُرجى طلب الفاتورة من ديوا أو قسم الحسابات.`,
        actions: dataActions,
      };
    case "DUPLICATE_BILL":
      return {
        headline_en: `${site.name}: duplicate bill for ${en}`,
        headline_ar: `${nameAr}: فاتورة مكررة لشهر ${ar}`,
        explanation_en: `Two bills cover the same account and period; the second (AED ${m.totalAed.toFixed(2)}) was excluded from analysis. ${f.whyHint}`,
        explanation_ar: `فاتورتان تغطيان نفس الحساب والفترة؛ تم استبعاد الثانية (${m.totalAed.toFixed(2)} درهم) من التحليل. تأكد من عدم دفعها مرتين.`,
        actions: dataActions,
      };
    case "TOTAL_MISMATCH":
      return {
        headline_en: `${site.name}: printed total differs from tariff recomputation`,
        headline_ar: `${nameAr}: الإجمالي المطبوع يختلف عن إعادة الحساب وفق التعرفة`,
        explanation_en: `The bill shows AED ${m.printed.toFixed(2)} but the DEWA slab tariff, surcharge, meter charge and VAT recompute to AED ${m.recomputed.toFixed(2)} (difference AED ${m.delta.toFixed(2)}). ${f.whyHint}`,
        explanation_ar: `تُظهر الفاتورة ${m.printed.toFixed(2)} درهم بينما تعطي إعادة الحساب وفق شرائح ديوا ورسم الوقود ورسم العداد والضريبة ${m.recomputed.toFixed(2)} درهم (الفارق ${m.delta.toFixed(2)} درهم). تحقق من الفاتورة الأصلية وفئة التعرفة.`,
        actions: dataActions,
      };
  }
}

export async function explainFinding(f: Finding, site: Site): Promise<Explanation> {
  const base = { findingId: f.id, generatedAt: new Date().toISOString() };
  const client = getOpenAI();
  if (!client) {
    return { ...base, model: "template", guardWarnings: [], ...templateExplanation(f, site) };
  }
  const input = {
    finding: { type: f.type, severity: f.severity, billMonth: f.billMonth, headline: f.headline, whyHint: f.whyHint, metrics: f.metrics, calcTrace: f.calcTrace },
    site: { name: site.name, nameAr: site.nameAr, premisesType: site.premisesType, areaSqm: site.areaSqm, hasOwnCooling: site.hasOwnCooling },
  };
  try {
    const res = await client.chat.completions.parse({
      model: MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You write short, plain-language explanations of electricity-bill findings for a finance or facilities manager in Dubai, in English and Modern Standard Arabic. Rules: (1) Do not state any number that is not present in the input JSON. (2) Do not claim a cause; suggest what to check, guided by whyHint. (3) Explanations: 2–4 sentences. (4) Provide 2–4 concrete actions with an owner, effort and 2–3 checklist items each, in both languages. (5) Refer to savings only as scenarios, never guarantees.",
        },
        { role: "user", content: JSON.stringify(input) },
      ],
      response_format: zodResponseFormat(ExplanationSchema, "explanation"),
    });
    const parsed = res.choices[0]?.message?.parsed;
    if (!parsed) throw new Error("empty response");
    const allowed = allowedNumbers(f, site);
    const guardWarnings = [
      ...numberGuard(parsed.explanation_en, allowed).map((n) => `EN explanation mentions "${n}" which is not in the finding inputs`),
      ...numberGuard(parsed.explanation_ar, allowed).map((n) => `AR explanation mentions "${n}" which is not in the finding inputs`),
    ];
    return { ...base, model: MODEL, guardWarnings, ...parsed };
  } catch (e) {
    const t = templateExplanation(f, site);
    return { ...base, model: "template (AI failed)", guardWarnings: [e instanceof Error ? e.message : String(e)], ...t };
  }
}
