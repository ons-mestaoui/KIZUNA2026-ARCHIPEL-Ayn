import type { ParcelConfig } from "./types";

/** Demo parcel: 1 ha drip-irrigated citrus in Cap Bon, solar pump → storage basin. */
export const DEFAULT_PARCEL: ParcelConfig = {
  name: "Menzel Bouzelfa demo parcel",
  areaHa: 1,
  crop: "citrus",
  stage: "mid",
  soil: { texture: "Sandy loam", fieldCapacity: 0.2, wiltingPoint: 0.09, saturation: 0.41 },
  irrigation: { method: "drip", efficiency: 0.9, flowM3h: 25 },
  basinCapacityM3: 80,
  pv: { kWp: 3, systemEfficiency: 0.8, tempCoeff: -0.004 },
  pump: { headM: 15, efficiency: 0.45, minStartW: 400 },
  well: { safeYieldM3h: 20 },
};

export const DEMO_LOCATION = { lat: 36.68, lon: 10.58, name: "Cap Bon, Tunisia", tz: "Africa/Tunis" };
export const PANEL = { tilt: 30, azimuth: 0 };
