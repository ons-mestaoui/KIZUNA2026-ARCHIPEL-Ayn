import type { ParcelConfig } from "@/lib/engine/types";
import { thetaFromPercent } from "@/lib/engine/waterBalance";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Demo virtual sensor: 0 = bone dry (≤ 0.6·θWP), 1 = field capacity or wetter. */
export function wetnessFromPct(soilPct: number, soil: ParcelConfig["soil"]): number {
  const theta = thetaFromPercent(soilPct, soil);
  const lo = soil.wiltingPoint * 0.6;
  return clamp01((theta - lo) / (soil.fieldCapacity - lo));
}

/** Farmer app: how wet the root zone looks, from the estimated depletion (0 mm = field capacity). */
export function wetnessFromDepletion(depletionMm: number, tawMm: number): number {
  return clamp01(1 - (0.9 * depletionMm) / Math.max(tawMm, 1));
}
