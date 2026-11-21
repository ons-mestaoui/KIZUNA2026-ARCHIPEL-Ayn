import "server-only";
import snapshot from "@/data/demo/field.json";
import { adviseZones } from "@/lib/field/advice";
import { selectFrames } from "@/lib/field/frames";
import type { FieldDTO } from "@/lib/field/types";

/** The demo's bundled satellite view (see scripts/snapshot-field.mts), on the heatwave passes the demo opens on. */
export function demoHeatwaveField(): FieldDTO {
  const all = snapshot as unknown as FieldDTO;
  return selectFrames(all, all.sets?.heatwave ?? []);
}

/** The zone the app names first on the demo's heatwave day (an irrigation day), e.g. "C", or null if none stands out. */
export function demoFocusZone(): string | null {
  const f = demoHeatwaveField();
  const latest = f.stats.at(-1) ?? null;
  const { advice } = adviseZones({ latest, previous: f.stats.at(-2) ?? null, decision: "irrigate" });
  return "zone" in advice ? (f.zones?.list[advice.zone]?.id ?? null) : null;
}
