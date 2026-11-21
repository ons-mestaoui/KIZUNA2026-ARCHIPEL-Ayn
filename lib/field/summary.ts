import { type Advice, adviseZones } from "./advice";
import type { FieldDTO } from "./types";

const f2 = (v: number | null) => (v === null ? "n/a" : v.toFixed(2));

function adviceLine(a: Advice, ids: string[]): string {
  switch (a.kind) {
    case "waterFirst":
      return `What the app tells the farmer: water zone ${ids[a.zone]} first (the weakest and driest part of the field). The watering plan still decides how much water.`;
    case "check":
      return `What the app tells the farmer: check zone ${ids[a.zone]} first on foot (${a.why === "green" ? "it looks less green than the rest: young trees, gaps or weeds are possible" : a.why === "both" ? "it looks weaker and drier than the rest, and no watering is planned today" : "its leaves look drier than the rest"}).`;
    case "even":
      return "What the app tells the farmer: the field looks even, no zone stands out from the average.";
    default:
      return "";
  }
}

/**
 * The satellite view of a field as a few plain sentences for the AI assistant, so "which part of my field needs water?"
 * gets an answer grounded in the same numbers the farmer sees. No coordinates: zones are only named by letter.
 * Returns null when there is no usable pass.
 */
export function summarizeField(field: FieldDTO, decision: "irrigate" | "skip"): string | null {
  const idx = field.frames.length - 1;
  const st = field.stats[idx];
  if (idx < 0 || !st || st.field.ndvi === null) return null;
  const frame = field.frames[idx];
  const lines = [
    `Satellite view of the field (Sentinel-2, ${frame.date}, ${Math.round(frame.clear * 100)} % of the field clear of cloud): average greenness (NDVI) ${f2(st.field.ndvi)}, leaf water (NDMI) ${f2(st.field.ndmi)}. These come from 10 m pixels and show where plants look different; they do not measure soil moisture.`,
  ];
  const zones = field.zones?.list ?? [];
  if (zones.length < 2) {
    lines.push("The field is too small or too even to be split into zones.");
    return lines.join("\n");
  }
  const ids = zones.map((z) => z.id);
  const { advice, rows, trend } = adviseZones({ latest: st, previous: idx > 0 ? field.stats[idx - 1] : null, decision });
  lines.push(
    `Zones (named by position, A is the north-west one): ${rows
      .map((r, i) => {
        const notes = [r.tag === "weaker" ? "less green than the field average" : r.tag === "greener" ? "greener than the field average" : "", r.wet === "drier" ? "drier leaves" : r.wet === "wetter" ? "wetter leaves" : ""].filter(Boolean);
        return `${ids[i]} (${zones[i].areaHa.toFixed(2)} ha): greenness ${f2(r.ndvi)}, leaf water ${f2(r.ndmi)}${notes.length ? `, ${notes.join(", ")}` : ""}`;
      })
      .join("; ")}.`,
  );
  const line = adviceLine(advice, ids);
  if (line) lines.push(line);
  if (trend) lines.push(`Zone ${ids[trend.zone]} lost greenness faster than the rest of the field since ${trend.since}.`);
  return lines.join("\n");
}
