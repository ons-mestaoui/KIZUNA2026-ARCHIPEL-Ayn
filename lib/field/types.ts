// Shared shapes for the "your field from space" feature. Pure types: no imports, so the server, the browser,
// vitest and the snapshot script (run with tsx) can all use them.

/** [longitude, latitude] in degrees, the order GeoJSON uses. */
export type LonLat = [number, number];

/** A metric position in a local frame: [metres east, metres north]. */
export type XY = [number, number];

export interface GeoBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** One Sentinel-2 pass over the scene box. The two index layers are one byte per pixel, base64 (see grid.ts). */
export interface FieldFrame {
  /** UTC date of the pass, YYYY-MM-DD */
  date: string;
  /** share of the field's own pixels that were cloud-free on that pass, 0–1 */
  clear: number;
  /** greenness (NDVI) */
  ndvi: string;
  /** leaf water (NDMI: near-infrared against short-wave infrared) */
  ndmi: string;
}

export interface ZoneInfo {
  /** "A", "B", … in reading order, north-west first; the UI localizes the letter */
  id: string;
  areaHa: number;
  centroid: LonLat;
}

export interface ZoneMap {
  /** one byte per scene pixel: the zone index 0…k−1, 255 = outside the field */
  map: string;
  list: ZoneInfo[];
}

export interface ZoneStat {
  ndvi: number | null;
  ndmi: number | null;
  /** share of this zone's pixels that had a clear reading, 0–1 */
  clear: number;
}

/** Mean readings of one frame for the whole field and for each zone (same order as ZoneMap.list). */
export interface FrameStats {
  date: string;
  field: ZoneStat;
  zones: ZoneStat[];
}

/** One point of the field-level history (Statistical API): null = no clear pixel that day. */
export interface SeriesPoint {
  date: string;
  ndvi: number | null;
  ndmi: number | null;
  clear: number;
}

export interface FieldTerrain {
  w: number;
  h: number;
  /** metres above sea level, base64 Int16 in decimetres, row 0 = north, same box as the frames */
  heights: string;
}

export interface FieldDTO {
  version: 1;
  source: "live" | "snapshot";
  /** when this was built (ISO) */
  asOf: string;
  polygon: LonLat[];
  /** the scene: a square of `sideM` metres around the field */
  box: GeoBox;
  sideM: number;
  grid: { w: number; h: number };
  /** oldest → newest; empty when there was no usable pass */
  frames: FieldFrame[];
  stats: FrameStats[];
  /** null when the field is too small, too cloudy or too even to split */
  zones: ZoneMap | null;
  series: SeriesPoint[];
  /** the newest pass with a usable view of the field, whatever the frames hold */
  lastClear: string | null;
  /** true when the newest pass is only partly clear */
  partial: boolean;
  terrain?: FieldTerrain;
  /** snapshot only: a bundled true-colour photo of the scene box (open licence) */
  photoUrl?: string;
}
