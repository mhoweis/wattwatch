/**
 * Dubai long-run monthly mean air temperature (°C), 1991–2020 normals (rounded).
 * Used to estimate how much of a month-on-month change is explained by cooling demand.
 * Replace with observed data (e.g. Open-Meteo archive) when a live source is connected.
 */
export const DUBAI_MEAN_TEMP_C: Record<string, number> = {
  "01": 19.5,
  "02": 20.5,
  "03": 23.5,
  "04": 27.5,
  "05": 31.5,
  "06": 33.5,
  "07": 35.5,
  "08": 36.0,
  "09": 33.5,
  "10": 30.0,
  "11": 25.5,
  "12": 21.5,
};

export const CDD_BASE_C = 18;

/** Share of a commercial site's electricity that typically goes to cooling in the Gulf. */
export const COOLING_SHARE = 0.6;

/** Cooling degree-days per day for a YYYY-MM month. */
export function cddPerDay(billMonth: string): number {
  const t = DUBAI_MEAN_TEMP_C[billMonth.slice(5, 7)] ?? CDD_BASE_C;
  return Math.max(0, t - CDD_BASE_C);
}

/**
 * Percentage change in total load expected purely from weather when moving from the
 * baseline months to the current month, assuming a fixed cooling share of the load.
 */
export function weatherExpectedPct(currentMonth: string, baselineMonths: string[], coolingShare = COOLING_SHARE): number {
  if (baselineMonths.length === 0) return 0;
  const base = baselineMonths.map(cddPerDay).sort((a, b) => a - b);
  const baseCdd = base[Math.floor(base.length / 2)];
  if (baseCdd <= 0) return 0;
  return coolingShare * (cddPerDay(currentMonth) / baseCdd - 1) * 100;
}
