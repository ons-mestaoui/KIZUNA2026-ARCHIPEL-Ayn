import "server-only";
import { CROPS } from "@/lib/engine/crops";
import type { FarmStateDTO } from "@/lib/state-types";

const r = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d;

/** "Sunday 22 November 2026" — models guess weekdays from ISO dates and get them wrong, so spell them out. */
const dated = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * A compact, factual summary of the farm and its plan for the AI. It never contains the farmer's
 * name or e-mail, and the location is rounded to ~10 km — enough for climate, not for a street address.
 */
export function farmContext(state: FarmStateDTO | null, farm: { crop: string; areaHa: number; lat: number; lon: number; placeName: string | null; waterSource: string; irrigationMethod: string; soilTexture: string; plantingDate: string | null }): string {
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
