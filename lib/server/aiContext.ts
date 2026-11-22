import "server-only";
import { CROPS } from "@/lib/engine/crops";
import type { DailyPlan, SoilFeel } from "@/lib/engine/types";
import type { FarmStateDTO } from "@/lib/state-types";

const r = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d;

/** "Sunday 22 November 2026" — models guess weekdays from ISO dates and get them wrong, so spell them out. */
const dated = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Why the plan says what it says, in the words the farmer's screen uses (English: the model translates). */
const REASON: Record<DailyPlan["reason"], string> = {
  soil_ok: "the root zone still holds enough water for today's heat",
  rain_expected: "rain is on the way and will cover today's crop demand",
  deficit: "the root zone has dropped below the stress threshold",
};
const FEEL: Record<SoilFeel, string> = { dry: "crumbles, dusty (dry)", moist: "holds its shape, no water (moist)", wet: "drips water, sticky mud (wet)" };
const span = (w: { start: string; end: string; m3: number }) => `${w.start}–${w.end} (${r(w.m3)} m³)`;

/**
 * What the Today screen deliberately leaves out, as sentences: when to water and pump, what limits the plan, what the
 * solar plan saves against pumping every sunny hour, the kit, and what the farmer already did today. The screen shows
 * the amount, the times and the first zone; the assistant is where the farmer asks "why" and "how much does it save".
 */
function planDetails(plan: DailyPlan, state: FarmStateDTO, farm: FarmKit): string[] {
  const solar = plan.source === "solar_basin" || plan.source === "solar_direct";
  const lines = [`Why: ${REASON[plan.reason]}.`];
  if (plan.limitedBy) {
    lines.push(
      `The crop needs ${r(plan.requestedM3)} m³ today but only ${r(plan.grossM3)} m³ can be applied: limited by the ${plan.limitedBy}${plan.limitedBy === "basin" && farm.basinM3 ? ` (it holds ${r(farm.basinM3)} m³)` : ""}.`,
    );
  }
  if (plan.irrigationWindows.length) lines.push(`Watering times: ${plan.irrigationWindows.map(span).join(", ")}.`);
  if (solar && plan.pumpWindow) lines.push(`Solar pump runs ${span(plan.pumpWindow)}.`);
  if (solar) {
    lines.push(`Equipment: ${r(farm.pvKWp, 1)} kWp solar panels, ${r(farm.basinM3)} m³ basin, pump head ${r(farm.pumpHeadM)} m, well safe flow ${r(farm.wellSafeYieldM3h)} m³/h.`);
    const { baseline: b, optimized: o, savings: s } = plan;
    if (b.pumpedM3 > 0) {
      lines.push(
        `Solar plan against pumping every sunny hour: the plan pumps ${r(o.pumpedM3)} m³ in ${r(o.pumpHours, 1)} h using ${r(o.energyKWh, 1)} kWh; the habit would pump ${r(b.pumpedM3)} m³ in ${r(b.pumpHours, 1)} h using ${r(b.energyKWh, 1)} kWh. It saves ${r(s.waterM3)} m³ of water (${r(s.waterPct)} %), ${r(s.pumpHoursPct)} % of pump hours and ${r(s.energyPct)} % of energy. Hours above the well's safe flow: ${o.overYieldHours} (habit ${b.overYieldHours}); hours in weak sun: ${o.weakSunHours} (habit ${b.weakSunHours}).`,
      );
    }
  }
  const watered = state.logsToday.reduce((sum, l) => sum + l.m3, 0);
  lines.push(watered > 0 ? `The farmer has logged ${r(watered)} m³ watered today.` : plan.grossM3 > 0 ? "The farmer has not logged any watering today yet." : "");
  if (state.lastCheck) lines.push(`Last soil squeeze test (${state.lastCheck.date}): ${FEEL[state.lastCheck.feel]}.`);
  return lines.filter(Boolean);
}

type FarmKit = { basinM3: number; pvKWp: number; pumpHeadM: number; wellSafeYieldM3h: number };

/**
 * A compact, factual summary of the farm and its plan for the AI. It never contains the farmer's
 * name or e-mail, and the location is rounded to ~10 km — enough for climate, not for a street address.
 */
export function farmContext(state: FarmStateDTO | null, farm: FarmKit & { crop: string; areaHa: number; lat: number; lon: number; placeName: string | null; waterSource: string; irrigationMethod: string; soilTexture: string; plantingDate: string | null }): string {
  const crop = CROPS[farm.crop as keyof typeof CROPS]?.label ?? farm.crop;
  const lines = [
    `Crop: ${crop}${farm.plantingDate ? `, planted ${farm.plantingDate}` : ""}. Area: ${farm.areaHa} ha. Soil: ${farm.soilTexture.replace("_", " ")}.`,
    `Location: ${farm.placeName ?? "unknown place"} (about ${r(farm.lat, 1)}, ${r(farm.lon, 1)}). Water: ${farm.waterSource.replace("_", " ")}, ${farm.irrigationMethod} irrigation.`,
  ];
  if (!state) return lines.join("\n") + "\nWeather and plan: not available right now.";

  const today = state.week[0]?.plan;
  const day = state.daily.find((d) => d.date === state.today);
  lines.push(`Today is ${dated(state.today)} (farm local time ${Math.floor(state.localHour)}h).`);
  if (today) {
    lines.push(
      `Root zone: ${r(state.depletionMm)} mm of water used up out of ${r(today.tawMm)} mm available (plants get stressed beyond ${r(today.rawMm)} mm). Plant stress: ${today.stress}.`,
      `Plan today: ${today.decision === "irrigate" ? `water ${r(today.grossM3)} m³` : "no watering"}${today.limitedBy ? ` (limited by ${today.limitedBy})` : ""}.`,
      ...planDetails(today, state, farm),
    );
  }
  if (day) lines.push(`Today's weather: max ${r(day.tmax)} °C, crop water use ${r(day.et0, 1)} mm, rain ${r(day.rain, 1)} mm.`);
  const next = state.week
    .slice(1, 6)
    .map((d) => {
      const w = state.daily.find((x) => x.date === d.plan.date);
      return `${short(d.plan.date)}: ${d.plan.grossM3 > 0 ? `water ${r(d.plan.grossM3)} m³` : "no watering"}${w ? `, max ${r(w.tmax)} °C, rain ${r(w.rain, 1)} mm` : ""}`;
    })
    .join("; ");
  if (next) lines.push(`Next days: ${next}.`);
  return lines.join("\n");
}
