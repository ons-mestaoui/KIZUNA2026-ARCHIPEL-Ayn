import type { ParcelConfig, SoilTexture } from "./types";

// Typical volumetric water contents per texture class (FAO-56 Table 19 mid-ranges).
// θFC = field capacity, θWP = permanent wilting point, θsat = saturation.
export const SOILS: Record<SoilTexture, { fieldCapacity: number; wiltingPoint: number; saturation: number }> = {
  sand: { fieldCapacity: 0.13, wiltingPoint: 0.06, saturation: 0.43 },
  loamy_sand: { fieldCapacity: 0.16, wiltingPoint: 0.07, saturation: 0.42 },
  sandy_loam: { fieldCapacity: 0.2, wiltingPoint: 0.09, saturation: 0.41 },
  loam: { fieldCapacity: 0.27, wiltingPoint: 0.12, saturation: 0.45 },
  clay_loam: { fieldCapacity: 0.32, wiltingPoint: 0.17, saturation: 0.47 },
  clay: { fieldCapacity: 0.36, wiltingPoint: 0.22, saturation: 0.5 },
};

export const SOIL_TEXTURES = Object.keys(SOILS) as SoilTexture[];

export const soilFrom = (texture: SoilTexture): ParcelConfig["soil"] => ({ texture, ...SOILS[texture] });
