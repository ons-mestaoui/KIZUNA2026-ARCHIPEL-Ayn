import "server-only";
import { polygonKey } from "@/lib/field/geo";
import { summarizeField } from "@/lib/field/summary";
import type { LonLat } from "@/lib/field/types";
import { demoHeatwaveField } from "./demoField";
import { getField } from "./field";

/** A chat answer must never wait long for the satellite. */
const WAIT_MS = 1500;

/**
 * The satellite view of the farmer's field as sentences for the AI assistant, or null. A view that is already cached
 * answers at once; a cold one is skipped for this question (and the attempt warms the cache for the next one).
 */
export async function fieldContext(farm: { polygon: [number, number][] | null }, decision: "irrigate" | "skip", opts: { demo?: boolean } = {}): Promise<string | null> {
  if (opts.demo) return summarizeField(demoHeatwaveField(), decision); // the demo never calls Copernicus: it reads its bundled snapshot
  const outline = farm.polygon as LonLat[] | null;
  if (!outline || outline.length < 3) return null;
  try {
    const field = await Promise.race([
      getField(polygonKey(outline), new Date().toISOString().slice(0, 10)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS)),
    ]);
    return field ? summarizeField(field, decision) : null;
  } catch {
    return null; // Copernicus down: the assistant simply has no satellite sentences
  }
}
