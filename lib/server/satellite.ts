import { cacheLife } from "next/cache";
import { DATASETS, type MetricId, type SeriesPoint, readSeries } from "./jaxa";

export interface SatelliteMetric {
  metric: MetricId;
  unit: string;
  points: SeriesPoint[]; // oldest → newest
  latest: SeriesPoint | null; // newest point with a value
  pixelKm: number | null;
  /** UTC date of the newest file that exists — shows the data's lag. */
  newestFile: string | null;
}

/**
 * One metric for one place, cached for hours: farmers within the same ~10 km cell (and repeated visits)
 * share one download from JAXA. `dayKey` makes the cache roll over at UTC midnight.
 *
 * A bad moment must not be remembered for hours, or one Wi-Fi blip would leave every card empty:
 *   every download failed → throw (nothing is cached, the caller shows "could not reach the data" and retries)
 *   some failed, or nothing is published yet → keep it only for a minute or so
 *   all fine → hours
 */
export async function getMetric(metric: MetricId, lat: number, lon: number, dayKey: string): Promise<SatelliteMetric> {
  "use cache";
  void dayKey;
  const ds = DATASETS[metric];
  // the 2.2 km products are 3+ MB a day: five days is enough for a trend and keeps the first load quick
  const { points, pixelKm, failed } = await readSeries(ds, lat, lon, metric === "heat" || metric === "ndvi" ? 5 : 7);
  if (points.length === 0 && failed > 0) throw new Error(`JAXA unreachable: ${failed} downloads failed`);
  if (points.length > 0 && failed === 0) cacheLife("hours");
  else cacheLife("minutes");
  const latest = [...points].reverse().find((p) => p.value !== null) ?? null;
  return { metric, unit: ds.unit, points, latest, pixelKm, newestFile: points.at(-1)?.date ?? null };
}

/** ~11 km grid so neighbouring farms share a cache entry. */
export const cell = (v: number) => Math.round(v * 10) / 10;
