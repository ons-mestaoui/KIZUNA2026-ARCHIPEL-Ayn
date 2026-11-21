import { CROPS } from "./crops";
import { addDays, dayClimate, hasDate } from "./climate";
import { computeDailyPlan } from "./plan";
import type { DailyPlan, ParcelConfig, WeatherScenario } from "./types";
import { clamp, effectiveRain, totalAvailableWater } from "./waterBalance";

export interface WeekDay {
  plan: DailyPlan;
  /** Root-zone depletion at the start of the day (mm). */
  drStart: number;
  /** …and after the day's ET, its own rain and the irrigation the plan applies (mm). */
  drAfter: number;
}

/**
 * Seven consecutive daily plans. Each day starts from the previous day's end state, assuming the
 * farmer follows the plan. Rain counts on the day it falls (the planner's 48 h look-ahead is only
 * used for each day's irrigate-or-skip decision, so rain is never counted twice).
 */
export function planWeek(
  parcel: ParcelConfig,
  scenario: WeatherScenario,
  depletionMm: number,
  startDate: string = scenario.focusDate,
  days = 7,
): WeekDay[] {
  const taw = totalAvailableWater(parcel.soil, CROPS[parcel.crop].rootDepthM);
  const out: WeekDay[] = [];
  let dr = clamp(depletionMm, 0, taw);
  let date = startDate;
  for (let i = 0; i < days && hasDate(scenario, date); i++) {
    const plan = computeDailyPlan(parcel, scenario, { depletionMm: dr, source: "estimate" }, date);
    const pe = effectiveRain(dayClimate(scenario, date).rainDay);
    const appliedNetMm = plan.grossMm * parcel.irrigation.efficiency;
    const drAfter = clamp(dr + plan.etcDay - pe - appliedNetMm, 0, taw);
    out.push({ plan, drStart: dr, drAfter });
    dr = drAfter;
    date = addDays(date, 1);
  }
  return out;
}
