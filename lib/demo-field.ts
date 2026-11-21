import type { LonLat } from "./field/types";

// The pitch demo's field: a real block of mature citrus about 1.3 km north-west of the centre of Menzel Bouzelfa
// (Cap Bon), drawn as a 125 m × 80 m rectangle along the tree rows: exactly 1 ha, so the engine's numbers for the demo
// parcel (80 m³ basin, 3 kWp, the savings) stay what they were. Chosen from real Sentinel-2 passes because zones on
// it repeat from date to date (see scripts/snapshot-field.ts), not drawn to make a picture.
export const DEMO_POLYGON: LonLat[] = [
  [10.56946, 36.689921],
  [10.568647, 36.689617],
  [10.56924, 36.688599],
  [10.570053, 36.688903],
];

/** The middle of the demo field (what the farm row stores as its location). */
export const DEMO_CENTRE: LonLat = [10.56935, 36.68926];

/** The heatwave the demo is built around, and the Sentinel-2 passes either side of it that the snapshot keeps. */
export const DEMO_HEATWAVE_DAY = "2026-07-21";
export const DEMO_SUMMER_PASSES = ["2026-07-13", "2026-07-18", "2026-07-23", "2026-07-28"];
