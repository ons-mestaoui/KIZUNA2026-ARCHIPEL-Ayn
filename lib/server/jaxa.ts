import "server-only";
import { fromArrayBuffer } from "geotiff";

// JAXA Earth API data = static Cloud-Optimized GeoTIFFs on S3 (no key). Each 90°×90° daily tile is only
// ~300 KB, so we download it whole (one request, ~2 s) — geotiff's range-request mode needs many round
// trips to Japan and takes ~11 s per file from Europe/Africa.
const ROOT = "https://s3.ap-northeast-1.wasabisys.com/je-pds/cog/v1";

export const COLLECTIONS = {
  // GCOM-W "SHIZUKU" AMSR2 daily soil moisture, ~11 km pixels. Value = DN × 0.1 (%).
  soilMoisture: { id: "JAXA.G-Portal_GCOM-W.AMSR2_standard.L3-SMC.daytime.v3_global_daily", band: "SMC", scale: 0.1 },
} as const;

export type Collection = { id: string; band: string; scale: number };

const fmtLon = (v: number) => `${v >= 0 ? "E" : "W"}${String(Math.abs(v)).padStart(3, "0")}.00`;
const fmtLat = (v: number) => `${v >= 0 ? "N" : "S"}${String(Math.abs(v)).padStart(2, "0")}.00`;

/** URL of the 90°×90° COG tile that contains (lat, lon) for a given day (UTC). */
export function cogUrl(collection: string, band: string, day: Date, lat: number, lon: number): string {
  const lonW = Math.min(90, Math.floor((lon + 180) / 90) * 90 - 180);
  const lonE = lonW + 90;
  const latS = lat >= 0 ? 0 : -90;
  const latN = latS + 90;
  const iso = day.toISOString();
  return (
    `${ROOT}/${collection}/${iso.slice(0, 7)}/${iso.slice(8, 10)}/1/` +
    `${fmtLon(lonW)}-${fmtLon(lonE)}/${fmtLon(lonW)}-${fmtLat(latS)}-${fmtLon(lonE)}-${fmtLat(latN)}-${band}.tiff`
  );
}

const km = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};

export interface PixelHit {
  dn: number;
  distKm: number; // from the requested point to the centre of the pixel used
}

/**
 * Nearest VALID pixel within `radiusPx` of (lat, lon). Coastal and swath-gap pixels are "no data"
 * (−32768) or error codes (−32761…−32767), so the exact pixel is often empty.
 * Returns null when the file is missing (not published yet) or nothing valid is near.
 */
export async function readNearest(url: string, lat: number, lon: number, radiusPx = 3): Promise<PixelHit | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const image = await (await fromArrayBuffer(await res.arrayBuffer())).getImage();
  const [ox, oy] = image.getOrigin();
  const [rx, ry] = image.getResolution(); // ry is negative (north-up)
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
  let best: PixelHit | null = null;
  let bestD = Infinity;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dn = a[(y - y0) * w + (x - x0)];
      if (!(dn > -32700)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestD) {
        bestD = d;
        best = { dn, distKm: km(lat, lon, oy + (y + 0.5) * ry, ox + (x + 0.5) * rx) };
      }
    }
  }
  return best;
}

export interface DailyValue {
  value: number;
  day: string; // YYYY-MM-DD
  distKm: number;
}

/** Most recent day with a valid value near the point. Data lags ~2 days, so we look 2…maxBack days back. */
export async function latestDaily(
  collection: Collection,
  lat: number,
  lon: number,
  opts: { maxBack?: number; radiusPx?: number } = {},
): Promise<DailyValue | null> {
  const { maxBack = 8, radiusPx = 3 } = opts;
  const backs = Array.from({ length: maxBack - 1 }, (_, i) => i + 2);
  const results = await Promise.all(
    backs.map(async (back): Promise<DailyValue | null> => {
      const day = new Date(Date.now() - back * 86_400_000);
      try {
        const hit = await readNearest(cogUrl(collection.id, collection.band, day, lat, lon), lat, lon, radiusPx);
        return hit ? { value: hit.dn * collection.scale, day: day.toISOString().slice(0, 10), distKm: hit.distKm } : null;
      } catch {
        return null;
      }
    }),
  );
  return results.find((r) => r !== null) ?? null; // ordered most-recent first
}
