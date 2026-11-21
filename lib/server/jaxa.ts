import "server-only";
import { fromArrayBuffer } from "geotiff";

// JAXA Earth API data = static Cloud-Optimized GeoTIFFs on S3 (no key). A daily 90°×90° tile is 0.3–3.4 MB,
// so we download it whole: one request, instead of the many sequential range requests geotiff would need
// across the world to Japan (≈11 s per file from Africa/Europe).
const ROOT = "https://s3.ap-northeast-1.wasabisys.com/je-pds/cog/v1";

export type MetricId = "rain" | "soil" | "heat" | "ndvi";

export interface Dataset {
  id: string;
  band: string;
  /** value = dn × scale + offset, then `convert` */
  scale: number;
  offset: number;
  valid: (dn: number) => boolean;
  convert: (v: number) => number;
  unit: string;
  /** typical publication lag in days (the first day we try) */
  lagDays: number;
  /** a neighbouring pixel up to this far away may stand in for an empty one (coast, cloud, swath gap) */
  radiusKm: number;
}

export const DATASETS: Record<MetricId, Dataset> = {
  // GPM / GSMaP gauge-calibrated rain. The file holds the daily MEAN RATE in mm/hour → ×24 = mm per day.
  rain: { id: "JAXA.EORC_GSMaP_standard.Gauge.00Z-23Z.v6_daily", band: "PRECIP", scale: 1, offset: 0, valid: (dn) => dn > -900, convert: (v) => v * 24, unit: "mm", lagDays: 5, radiusKm: 12 },
  // GCOM-W "SHIZUKU" AMSR2 soil moisture, ~11 km pixels, %
  soil: { id: "JAXA.G-Portal_GCOM-W.AMSR2_standard.L3-SMC.daytime.v3_global_daily", band: "SMC", scale: 0.1, offset: 0, valid: (dn) => dn >= 0 && dn <= 1000, convert: (v) => v, unit: "%", lagDays: 2, radiusKm: 40 },
  // GCOM-C SGLI land surface temperature, ~2.8 km pixels, Kelvin → °C
  heat: { id: "JAXA.G-Portal_GCOM-C.SGLI_standard.L3-LST.daytime.v3_global_daily", band: "LST", scale: 0.02, offset: 0, valid: (dn) => dn > 0 && dn < 65000, convert: (v) => v - 273.15, unit: "°C", lagDays: 1, radiusKm: 10 },
  // GCOM-C SGLI NDVI, ~2.8 km pixels
  ndvi: { id: "JAXA.G-Portal_GCOM-C.SGLI_standard.L3-NDVI.daytime.v3_global_daily", band: "NDVI", scale: 0.0001, offset: -1, valid: (dn) => dn > 0 && dn < 65000, convert: (v) => v, unit: "", lagDays: 1, radiusKm: 10 },
};

const fmtLon = (v: number) => `${v >= 0 ? "E" : "W"}${String(Math.abs(v)).padStart(3, "0")}.00`;
const fmtLat = (v: number) => `${v >= 0 ? "N" : "S"}${String(Math.abs(v)).padStart(2, "0")}.00`;

/**
 * URL of the 90°×90° "level 1" tile that contains (lat, lon) for a given UTC day. Level 0 (a whole
 * hemisphere) is only a 0.2° overview; level 1 holds the native resolution — 0.025° (2.2 km) for the
 * GCOM-C products, 0.1° (9 km) for AMSR2 and GSMaP.
 */
export function dayUrl(ds: Dataset, day: Date, lat: number, lon: number): string {
  const iso = day.toISOString();
  const lonW = Math.min(90, Math.floor((lon + 180) / 90) * 90 - 180);
  const lonE = lonW + 90;
  const latS = lat >= 0 ? 0 : -90;
  const latN = latS + 90;
  return (
    `${ROOT}/${ds.id}/${iso.slice(0, 7)}/${iso.slice(8, 10)}/1/${fmtLon(lonW)}-${fmtLon(lonE)}/` +
    `${fmtLon(lonW)}-${fmtLat(latS)}-${fmtLon(lonE)}-${fmtLat(latN)}-${ds.band}.tiff`
  );
}

const km = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};

export interface Reading {
  value: number; // converted (mm, %, °C, NDVI)
  distKm: number; // from the farm to the centre of the pixel used
  pixelKm: number; // pixel size
}

/**
 * The reading nearest to (lat, lon) on one day.
 *   "missing" → that day's file is not published (yet)      null → file exists but nothing valid nearby
 */
export async function readDay(ds: Dataset, day: Date, lat: number, lon: number): Promise<Reading | null | "missing"> {
  const res = await fetch(dayUrl(ds, day, lat, lon), { signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) return "missing";
  if (!res.ok) throw new Error(`JAXA ${res.status}`);
  const image = await (await fromArrayBuffer(await res.arrayBuffer())).getImage();
  const [ox, oy] = image.getOrigin();
  const [rx, ry] = image.getResolution(); // ry is negative (north-up)
  const pixelKm = Math.abs(rx) * 111.32 * Math.cos((lat * Math.PI) / 180);
  const radiusPx = Math.max(1, Math.ceil(ds.radiusKm / (Math.abs(rx) * 111.32)));
  const cx = Math.floor((lon - ox) / rx);
  const cy = Math.floor((lat - oy) / ry);
  const x0 = Math.max(0, cx - radiusPx);
  const y0 = Math.max(0, cy - radiusPx);
  const x1 = Math.min(image.getWidth(), cx + radiusPx + 1);
  const y1 = Math.min(image.getHeight(), cy + radiusPx + 1);
  if (x1 <= x0 || y1 <= y0) return null;

  const rasters = (await image.readRasters({ window: [x0, y0, x1, y1], samples: [0] })) as unknown as ArrayLike<number>[];
  const a = rasters[0];
  const w = x1 - x0;
  let best: Reading | null = null;
  let bestD = Infinity;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dn = a[(y - y0) * w + (x - x0)];
      if (!ds.valid(dn)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestD) {
        bestD = d;
        best = {
          value: ds.convert(dn * ds.scale + ds.offset),
          distKm: km(lat, lon, oy + (y + 0.5) * ry, ox + (x + 0.5) * rx),
          pixelKm,
        };
      }
    }
  }
  return best;
}

export interface SeriesPoint {
  date: string; // YYYY-MM-DD (UTC)
  value: number | null; // null: file exists but no clear reading (cloud, orbit gap)
  distKm: number | null;
}

/**
 * The last `days` days that have been published, oldest first. Days are fetched in parallel;
 * the walk starts at the dataset's usual lag and looks 2 days further back than `days`
 * (in case the newest files are not out yet).
 *
 * `failed` counts downloads that broke (no network, timeout, a JAXA error). That is not the same as a file
 * that is simply not published yet, and callers need to tell the two apart: one is worth retrying at once.
 */
export async function readSeries(
  ds: Dataset,
  lat: number,
  lon: number,
  days = 7,
): Promise<{ points: SeriesPoint[]; pixelKm: number | null; failed: number }> {
  const backs = Array.from({ length: days + 2 }, (_, i) => ds.lagDays + i);
  let failed = 0;
  const results = await Promise.all(
    backs.map(async (back) => {
      const day = new Date(Date.now() - back * 86_400_000);
      try {
        return { day, r: await readDay(ds, day, lat, lon) };
      } catch {
        failed++;
        return { day, r: "missing" as const };
      }
    }),
  );
  const have = results.filter((x): x is { day: Date; r: Reading | null } => x.r !== "missing").slice(0, days);
  const points = have
    .map(({ day, r }) => ({ date: day.toISOString().slice(0, 10), value: r ? r.value : null, distKm: r ? r.distKm : null }))
    .reverse();
  return { points, pixelKm: have.find((x) => x.r)?.r?.pixelKm ?? null, failed };
}
