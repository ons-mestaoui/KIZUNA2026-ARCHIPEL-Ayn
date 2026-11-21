import type { RasterResult } from "./copernicus-core";
import { sceneBox } from "./geo";
import { NDMI_RANGE, NDVI_RANGE, bytesToBase64, encodeGrid } from "./grid";
import type { FieldDTO, GeoBox, LonLat, SeriesPoint } from "./types";
import { buildZones, fieldCoverage, frameStats } from "./zones";

// Turns a field outline into a FieldDTO: pick the passes worth showing, fetch their pictures, split the field
// into zones, average everything. Pure apart from the `FieldSource` it is given (the live Copernicus client, a
// fake in tests, or the same client inside the snapshot script).

export interface FieldSource {
  series(polygon: LonLat[], from: Date, to: Date): Promise<SeriesPoint[]>;
  raster(box: GeoBox, date: string, w: number, h: number): Promise<RasterResult>;
}

export const CLEAR_GOOD = 0.85; // a pass this clear over the field is "clear"
export const CLEAR_PARTIAL = 0.5; // below this a pass is not worth showing at all
const DAY = 86_400_000;

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const gap = (a: string, b: string) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;

/** Pixels of the scene picture: 5 m for small scenes (every 10 m source pixel is hit), 10 m beyond 1.2 km. */
export function gridFor(sideM: number) {
  const pixelM = sideM <= 1200 ? 5 : 10;
  const w = Math.round(sideM / pixelM);
  return { w, h: w, pixelM };
}

/**
 * The newest pass with a clear view of the field, and one about two weeks earlier to compare with.
 * If nothing is fully clear the newest half-clear pass is used and flagged `partial`.
 */
export function pickPasses(series: SeriesPoint[]): { latest: SeriesPoint | null; previous: SeriesPoint | null; partial: boolean; lastClear: string | null } {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const good = sorted.filter((s) => s.clear >= CLEAR_GOOD);
  let latest = good.at(-1) ?? null;
  let partial = false;
  if (!latest) {
    latest = sorted.filter((s) => s.clear >= CLEAR_PARTIAL).at(-1) ?? null;
    partial = latest !== null;
  }
  if (!latest) return { latest: null, previous: null, partial: false, lastClear: null };
  const target = shift(latest.date, -14);
  const earlier = good.filter((s) => gap(latest.date, s.date) >= 10 && gap(latest.date, s.date) <= 40);
  const previous = earlier.length ? earlier.reduce((a, b) => (Math.abs(gap(b.date, target)) < Math.abs(gap(a.date, target)) ? b : a)) : null;
  return { latest, previous, partial, lastClear: latest.date };
}

/** Per-pixel median over several passes, ignoring pixels with no reading. */
export function medianRaster(layers: ArrayLike<number>[]): Float32Array {
  const n = layers[0].length;
  const out = new Float32Array(n);
  const vals: number[] = [];
  for (let p = 0; p < n; p++) {
    vals.length = 0;
    for (const l of layers) if (Number.isFinite(l[p])) vals.push(l[p]);
    if (!vals.length) {
      out[p] = NaN;
      continue;
    }
    vals.sort((a, b) => a - b);
    const m = vals.length >> 1;
    out[p] = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  }
  return out;
}

export interface BuildOptions {
  now: Date;
  source: "live" | "snapshot";
  /** live: how far back to look for passes (default 75 days) */
  lookbackDays?: number;
  /** snapshot: use exactly these passes instead of choosing */
  frameDates?: string[];
  /** snapshot: the passes whose per-pixel median defines the zones (default: the newest frame) */
  zoneDates?: string[];
}

export async function buildField(client: FieldSource, polygon: LonLat[], opts: BuildOptions): Promise<FieldDTO> {
  const { box, sideM } = sceneBox(polygon);
  const { w, h } = gridFor(sideM);
  const forced = opts.frameDates?.length ? [...opts.frameDates].sort() : null;
  const from = forced ? new Date(Date.parse(`${shift(forced[0], -20)}T00:00:00Z`)) : new Date(opts.now.getTime() - (opts.lookbackDays ?? 75) * DAY);
  const series = await client.series(polygon, from, new Date(opts.now.getTime() + DAY));

  let dates: string[];
  let partial = false;
  let lastClear: string | null;
  if (forced) {
    dates = forced;
    lastClear = forced.at(-1) ?? null;
  } else {
    const p = pickPasses(series);
    dates = [p.previous?.date, p.latest?.date].filter((d): d is string => !!d);
    partial = p.partial;
    lastClear = p.lastClear;
  }

  const rasters = await Promise.all(dates.map((d) => client.raster(box, d, w, h)));
  const coverage = fieldCoverage(polygon, box, w, h);

  const zoneDates = opts.zoneDates?.length ? opts.zoneDates : dates.slice(-1);
  const ref = zoneDates.map((d) => rasters[dates.indexOf(d)]).filter(Boolean);
  const refNdvi = ref.length === 0 ? null : ref.length === 1 ? ref[0].ndvi : medianRaster(ref.map((r) => r.ndvi));
  const zones = refNdvi ? buildZones({ polygon, box, w, h, ndvi: refNdvi, coverage }) : null;

  const stats = dates.map((date, i) =>
    frameStats({ date, zoneMap: zones?.map ?? null, zoneCount: zones?.list.length ?? 0, coverage, ndvi: rasters[i].ndvi, ndmi: rasters[i].ndmi }),
  );

  return {
    version: 1,
    source: opts.source,
    asOf: opts.now.toISOString(),
    polygon: polygon.map(([lon, lat]) => [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6] as LonLat),
    box,
    sideM: Math.round(sideM),
    grid: { w, h },
    frames: dates.map((date, i) => ({ date, clear: stats[i].field.clear, ndvi: encodeGrid(rasters[i].ndvi, NDVI_RANGE), ndmi: encodeGrid(rasters[i].ndmi, NDMI_RANGE) })),
    stats,
    zones: zones ? { map: bytesToBase64(zones.map), list: zones.list } : null,
    series,
    lastClear,
    partial,
  };
}
