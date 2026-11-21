import { zoneScore } from "@/lib/field/advice";
import { fieldCoverage } from "@/lib/field/zones";
import { localFrame } from "@/lib/field/geo";
import { NDMI_RANGE, NDVI_RANGE, base64ToBytes, decodeGrid } from "@/lib/field/grid";
import type { FieldDTO, LonLat } from "@/lib/field/types";
import type { XZ } from "./geometry";

export interface DecodedFrame {
  date: string;
  clear: number;
  ndvi: Float32Array;
  ndmi: Float32Array;
}

/** The payload's compact byte grids, opened up for painting. */
export interface FieldGrids {
  w: number;
  h: number;
  frames: DecodedFrame[];
  /** zone index per pixel, 255 outside the field; null when the field has no zones */
  zoneMap: Uint8Array | null;
  /** share of each pixel inside the field outline, 0–1 */
  coverage: Float32Array;
}

export function decodeField(f: FieldDTO): FieldGrids {
  return {
    w: f.grid.w,
    h: f.grid.h,
    frames: f.frames.map((fr) => ({ date: fr.date, clear: fr.clear, ndvi: decodeGrid(fr.ndvi, NDVI_RANGE), ndmi: decodeGrid(fr.ndmi, NDMI_RANGE) })),
    zoneMap: f.zones ? base64ToBytes(f.zones.map) : null,
    coverage: fieldCoverage(f.polygon, f.box, f.grid.w, f.grid.h),
  };
}

/** Which frame to show: the chosen one, else the newest; −1 when there are none. */
export const frameIndex = (f: FieldDTO, chosen: number | null): number => (f.frames.length === 0 ? -1 : chosen === null ? f.frames.length - 1 : Math.min(Math.max(0, chosen), f.frames.length - 1));

/** The diverging colour score of every zone in one frame (see zoneScore). */
export function scoresFor(f: FieldDTO, idx: number): number[] {
  const st = f.stats[idx];
  if (!st) return (f.zones?.list ?? []).map(() => 0);
  return st.zones.map((z) => zoneScore(z, st.field));
}

/** Longitude/latitude → scene metres (x east, z south) around the middle of the scene box. */
export function sceneProjector(f: FieldDTO): (p: LonLat) => XZ {
  const frame = localFrame([(f.box.west + f.box.east) / 2, (f.box.south + f.box.north) / 2]);
  return (p) => {
    const [x, north] = frame.toXY(p);
    return [x, -north];
  };
}

/** Length of the field's longer side in metres (for sizing the wall and the camera). */
export function fieldSpanM(f: FieldDTO): number {
  const toXZ = sceneProjector(f);
  const pts = f.polygon.map(toXZ);
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
}
