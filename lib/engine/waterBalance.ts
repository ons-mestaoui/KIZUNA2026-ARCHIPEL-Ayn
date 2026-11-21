import type { ParcelConfig } from "./types";

// FAO-56 root-zone water balance (chapter 8), daily step.

/** Total available water in the root zone, mm. TAW = 1000 (θFC − θWP) Zr */
export function totalAvailableWater(soil: ParcelConfig["soil"], rootDepthM: number): number {
  return 1000 * (soil.fieldCapacity - soil.wiltingPoint) * rootDepthM;
}

/** Root-zone depletion from a measured θ, mm, clamped to [0, TAW]. */
export function depletionFromTheta(theta: number, soil: ParcelConfig["soil"], rootDepthM: number): number {
  const dr = 1000 * (soil.fieldCapacity - theta) * rootDepthM;
  return clamp(dr, 0, totalAvailableWater(soil, rootDepthM));
}

/** Effective rainfall (simple USDA-style rule): small showers evaporate, 80% of the rest infiltrates. */
export function effectiveRain(rainMm: number): number {
  return rainMm > 2 ? 0.8 * rainMm : 0;
}

/** Calibrated sensor percent (0 = dry air, 100 = in water) → volumetric water content. */
export function thetaFromPercent(pct: number, soil: ParcelConfig["soil"]): number {
  return clamp(pct, 0, 100) / 100 * soil.saturation;
}

export function thetaToPercent(theta: number, soil: ParcelConfig["soil"]): number {
  return clamp((theta / soil.saturation) * 100, 0, 100);
}

/** mm of water over an area in hectares → m³ (1 mm on 1 ha = 10 m³). */
export function mmToM3(mm: number, areaHa: number): number {
  return mm * areaHa * 10;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
