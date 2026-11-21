import { CROPS, kcOn } from "./crops";
import { addDays, dayClimate, daysBetween, firstDate, hasDate } from "./climate";
import type { LastIrrigated, ParcelConfig, SoilFeel, WeatherScenario } from "./types";
import { clamp, effectiveRain, totalAvailableWater } from "./waterBalance";

/** How far back the running water balance looks (days). */
export const HISTORY_DAYS = 14;

export interface IrrigationEvent {
  date: string; // YYYY-MM-DD (farm-local)
  m3: number; // water the farmer applied (gross, at the field)
}
export interface SoilCheckEvent {
  date: string;
  feel: SoilFeel;
}

export interface BalanceInput {
  /** The day we are estimating the morning state for (YYYY-MM-DD). */
  today: string;
  /** Registration day and the farmer's answer to "when did you last irrigate?". */
  anchor: { date: string; lastIrrigated: LastIrrigated };
  irrigations: IrrigationEvent[];
  checks: SoilCheckEvent[];
}

export interface BalanceDay {
  date: string;
  drStart: number;
  etc: number;
  rain: number;
  effectiveRain: number;
  irrigationMm: number;
  drEnd: number;
}

export interface BalanceResult {
  /** Root-zone depletion at the start of `today`, after anything already irrigated today (mm). */
  depletionMm: number;
  days: BalanceDay[];
}

/** Depth of root-zone depletion each squeeze-test answer stands for, as a fraction of TAW. */
export const FEEL_DEPLETION = { dry: 0.85, moist: 0.25, wet: 0 } as const;

const DAYS_SINCE: Record<LastIrrigated, number | null> = { today: 0, "1-2d": 1.5, "3-5d": 4, "week+": 9, unknown: null };

/**
 * Day-by-day FAO-56 root-zone balance (eq. 85) with no sensor:
 *   Dr(t+1) = clamp( Dr(t) + ETc(t) − Pe(t) − Irr(t) , 0 , TAW )
 * Every term uses the same ET₀ series and hour offset as the daily planner (see climate.ts).
 * Starting point = the farmer's "last irrigated" answer; squeeze tests re-anchor it.
 */
export function estimateDepletion(parcel: ParcelConfig, scenario: WeatherScenario, input: BalanceInput): BalanceResult {
  const crop = CROPS[parcel.crop];
  const taw = totalAvailableWater(parcel.soil, crop.rootDepthM);
  const raw = crop.depletionP * taw;
  const { today } = input;

  // The window can't start before the registration day, the weather data, or HISTORY_DAYS ago.
  const windowStart = [input.anchor.date, firstDate(scenario), addDays(today, -HISTORY_DAYS)].reduce((a, b) => (a > b ? a : b));
  const etcOn = (date: string) =>
    hasDate(scenario, date)
      ? kcOn(date, parcel.crop, { plantingDate: parcel.plantingDate, stage: parcel.stage }) * dayClimate(scenario, date).et0Day
      : 0;

  // Starting depletion.
  let dr: number;
  const since = DAYS_SINCE[input.anchor.lastIrrigated];
  if (input.anchor.date >= windowStart && since !== null) {
    const sample = [0, 1, 2, 3, 4, 5, 6].map((i) => etcOn(addDays(windowStart, i))).filter((v) => v > 0);
    const etcAvg = sample.length ? sample.reduce((a, b) => a + b, 0) / sample.length : 4;
    dr = clamp(since * etcAvg, 0, taw);
  } else {
    dr = 0.5 * raw; // no usable anchor: assume mid-way to the stress threshold
  }

  const irrMm = (date: string) =>
    input.irrigations.filter((e) => e.date === date).reduce((s, e) => s + (e.m3 * parcel.irrigation.efficiency) / (parcel.areaHa * 10), 0);
  const checkOn = (date: string) => [...input.checks].reverse().find((c) => c.date === date); // latest check that day

  const days: BalanceDay[] = [];
  for (let d = windowStart; d < today; d = addDays(d, 1)) {
    if (!hasDate(scenario, d)) continue;
    const check = checkOn(d);
    const drStart = check ? FEEL_DEPLETION[check.feel] * taw : dr;
    const clim = dayClimate(scenario, d);
    const etc = etcOn(d);
    const pe = effectiveRain(clim.rainDay);
    const irr = irrMm(d);
    dr = clamp(drStart + etc - pe - irr, 0, taw);
    days.push({ date: d, drStart, etc, rain: clim.rainDay, effectiveRain: pe, irrigationMm: irr, drEnd: dr });
  }

  // Morning of `today`: a squeeze test today overrides the estimate; water already applied today counts.
  const checkToday = checkOn(today);
  const start = checkToday ? FEEL_DEPLETION[checkToday.feel] * taw : dr;
  return { depletionMm: clamp(start - irrMm(today), 0, taw), days };
}

export { daysBetween };
