import { soilFrom } from "./soils";
import type { CropId, IrrigationMethod, ParcelConfig, SoilTexture, WaterSource } from "./types";

/** What onboarding collects (and the `farm` table stores). Pure data — no DB types here. */
export interface FarmInput {
  name: string;
  crop: CropId;
  plantingDate?: string | null;
  areaHa: number;
  soilTexture: SoilTexture;
  irrigationMethod: IrrigationMethod;
  waterSource: WaterSource;
  basinM3: number;
  pvKWp: number;
  pumpHeadM: number;
  wellSafeYieldM3h: number;
}

/** Share of applied water that reaches the root zone. */
export const EFFICIENCY: Record<IrrigationMethod, number> = { drip: 0.9, sprinkler: 0.75, surface: 0.6 };
/** Typical field-network delivery per hectare while irrigating (m³/h). */
export const FLOW_PER_HA: Record<IrrigationMethod, number> = { drip: 15, sprinkler: 20, surface: 35 };

export function parcelFromFarm(f: FarmInput): ParcelConfig {
  const solar = f.waterSource === "solar_basin" || f.waterSource === "solar_direct";
  return {
    name: f.name,
    areaHa: f.areaHa,
    crop: f.crop,
    plantingDate: f.plantingDate ?? undefined,
    soil: soilFrom(f.soilTexture),
    irrigation: {
      method: f.irrigationMethod,
      efficiency: EFFICIENCY[f.irrigationMethod],
      flowM3h: Math.max(4, f.areaHa * FLOW_PER_HA[f.irrigationMethod]),
    },
    waterSource: f.waterSource,
    basinCapacityM3: f.waterSource === "solar_basin" ? f.basinM3 : 0,
    pv: { kWp: solar ? f.pvKWp : 0, systemEfficiency: 0.8, tempCoeff: -0.004 },
    pump: { headM: f.pumpHeadM, efficiency: 0.45, minStartW: 400 },
    well: { safeYieldM3h: f.wellSafeYieldM3h },
  };
}

/**
 * Sensible starting values for the onboarding form, scaled to the farm size. They are also what gets saved when the
 * farmer leaves the pump details empty, so they must stay inside what the server accepts (lib/farm-schema.ts: basin
 * 5,000 m³, panels 500 kWp, well 1,000 m³/h): without the caps a field of more than about 50 ha was estimated past
 * the limits and could not be saved at all.
 */
export function defaultsFor(areaHa: number) {
  return {
    basinM3: Math.min(5000, Math.max(20, Math.round(areaHa * 60))),
    pvKWp: Math.min(500, Math.max(1, Math.round(areaHa * 3 * 10) / 10)),
    pumpHeadM: 15,
    wellSafeYieldM3h: Math.min(1000, Math.max(8, Math.round(areaHa * 20))),
  };
}
