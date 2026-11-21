import { fromArrayBuffer } from "geotiff";
import { localFrame, meanPoint, polygonAreaM2 } from "./geo";
import type { GeoBox, LonLat, SeriesPoint } from "./types";

// A small client for the Copernicus Data Space "Sentinel Hub" APIs (Sentinel-2 L2A): a token, a field-level history
// (Statistical API) and a picture of an area (Process API). Framework-free on purpose: the server wrapper, the
// snapshot script and the tests all use this same file. Secrets never appear in an error message.

export type CdseErrorKind = "not_configured" | "auth" | "quota" | "server" | "network" | "bad_request";

export class CdseError extends Error {
  constructor(
    public kind: CdseErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "CdseError";
  }
}

const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const API = "https://sh.dataspace.copernicus.eu/api/v1";
const CRS = "http://www.opengis.net/def/crs/EPSG/0/4326";

/** Scene classification values we trust for crops: dark area, vegetation, bare soil, unclassified (not cloud, shadow, water, snow). */
export const VALID_SCL = [2, 4, 5, 7];
const CLEAR = `s.dataMask===1&&[${VALID_SCL.join(",")}].includes(s.SCL)`;

// All index maths happens here, inside Copernicus: we only download the finished numbers.
const INDICES_SCRIPT = `//VERSION=3
function setup(){return{input:["B04","B08","B8A","B11","SCL","dataMask"],output:{bands:4,sampleType:"FLOAT32"}}}
function evaluatePixel(s){
  const ndvi=(s.B08-s.B04)/(s.B08+s.B04+1e-9);
  const ndmi=(s.B8A-s.B11)/(s.B8A+s.B11+1e-9);
  return[ndvi,ndmi,s.SCL,s.dataMask]}`;

const STATS_SCRIPT = `//VERSION=3
function setup(){return{input:[{bands:["B04","B08","B8A","B11","SCL","dataMask"]}],output:[{id:"ndvi",bands:1},{id:"ndmi",bands:1},{id:"dataMask",bands:1}]}}
function evaluatePixel(s){const ok=${CLEAR}?1:0;return{ndvi:[(s.B08-s.B04)/(s.B08+s.B04+1e-9)],ndmi:[(s.B8A-s.B11)/(s.B8A+s.B11+1e-9)],dataMask:[ok]}}`;

const TRUECOLOR_SCRIPT = `//VERSION=3
function setup(){return{input:["B02","B03","B04"],output:{bands:3}}}
function evaluatePixel(s){return[2.6*s.B04,2.6*s.B03,2.6*s.B02]}`;

export interface CdseCredentials {
  id: string;
  secret: string;
}

/** An index picture of an area: NaN where there was no clear reading. Row 0 is the northern edge. */
export interface RasterResult {
  w: number;
  h: number;
  ndvi: Float32Array;
  ndmi: Float32Array;
}

export interface CdseClient {
  /** One point per Sentinel-2 pass over the field in [from, to): mean readings and the clear share of the field. */
  series(polygon: LonLat[], from: Date, to: Date): Promise<SeriesPoint[]>;
  /** NDVI and NDMI for a box on one UTC day, as a w × h grid. */
  raster(box: GeoBox, date: string, w: number, h: number): Promise<RasterResult>;
  /** A true-colour JPEG of the box on one day. */
  trueColor(box: GeoBox, date: string, w: number, h: number): Promise<Uint8Array>;
}

export interface CdseOptions {
  fetch?: typeof fetch;
  now?: () => number;
  /** tests pass a no-op so retries are instant */
  sleep?: (ms: number) => Promise<void>;
  /** called before every API request (the server uses it to cap how many we make per hour) */
  beforeCall?: () => void;
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
/**
 * The Statistical API cuts its days starting from the `from` time we send, not from UTC midnight. A request at
 * 22:30 would label a 10:10 pass with the day before (and the next step would then ask for the wrong day), so
 * the range always starts and ends on a UTC midnight.
 */
const midnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const num = (x: unknown): number | null => {
  const v = typeof x === "string" ? Number(x) : (x as number);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

export function createCdseClient(creds: CdseCredentials, opts: CdseOptions = {}): CdseClient {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const scrub = (v: unknown): string =>
    String(v instanceof Error ? v.message : v)
      .split(creds.secret)
      .join("<secret>")
      .split(creds.id)
      .join("<id>")
      .replace(/Bearer\s+[\w.~+/=-]+/gi, "Bearer <token>")
      .slice(0, 240);

  let token: { value: string; exp: number } | null = null;
  let pending: Promise<string> | null = null;

  async function getToken(): Promise<string> {
    if (token && token.exp - now() > 60_000) return token.value;
    pending ??= (async () => {
      try {
        const res = await doFetch(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "client_credentials", client_id: creds.id, client_secret: creds.secret }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new CdseError(res.status === 400 || res.status === 401 ? "auth" : "server", `Copernicus sign-in failed (HTTP ${res.status})`, res.status);
        const j = (await res.json()) as { access_token?: string; expires_in?: number };
        if (!j.access_token) throw new CdseError("auth", "Copernicus sign-in returned no token");
        token = { value: j.access_token, exp: now() + (j.expires_in ?? 600) * 1000 };
        return token.value;
      } catch (e) {
        throw e instanceof CdseError ? e : new CdseError("network", `Copernicus sign-in unreachable: ${scrub(e)}`);
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  async function call(path: string, body: unknown, accept: string, attempt = 0): Promise<Response> {
    opts.beforeCall?.();
    const bearer = await getToken();
    let res: Response;
    try {
      res = await doFetch(`${API}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", Accept: accept },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25_000),
      });
    } catch (e) {
      if (attempt < 1) {
        await sleep(400);
        return call(path, body, accept, attempt + 1);
      }
      throw new CdseError("network", `Copernicus unreachable: ${scrub(e)}`);
    }
    if (res.status === 401 && attempt < 2) {
      token = null; // expired earlier than promised: sign in again once
      return call(path, body, accept, attempt + 1);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      const wait = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(wait) && wait > 0 ? Math.min(wait, 5) * 1000 : 700 * (attempt + 1));
      return call(path, body, accept, attempt + 1);
    }
    if (!res.ok) {
      const text = scrub(await res.text().catch(() => ""));
      const kind: CdseErrorKind = res.status === 429 ? "quota" : res.status >= 500 ? "server" : res.status === 401 || res.status === 403 ? "auth" : "bad_request";
      throw new CdseError(kind, `Copernicus HTTP ${res.status}: ${text}`, res.status);
    }
    return res;
  }

  const bounds = (box: GeoBox) => ({ bbox: [box.west, box.south, box.east, box.north], properties: { crs: CRS } });
  const day = (date: string) => ({ timeRange: { from: `${date}T00:00:00Z`, to: `${date}T23:59:59Z` }, mosaickingOrder: "mostRecent" });

  return {
    async series(polygon, from, to) {
      // GeoJSON wants a closed, counter-clockwise ring
      let ring = [...polygon];
      const f = localFrame(meanPoint(polygon));
      const xy = ring.map(f.toXY);
      let area = 0;
      xy.forEach((p, i) => {
        const q = xy[(i + 1) % xy.length];
        area += p[0] * q[1] - q[0] * p[1];
      });
      if (area < 0) ring = ring.reverse();
      const res = await call(
        "/statistics",
        {
          input: { bounds: { geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] }, properties: { crs: CRS } }, data: [{ type: "sentinel-2-l2a", dataFilter: {} }] },
          aggregation: {
            timeRange: { from: iso(midnight(from)), to: iso(new Date(midnight(to).getTime() + 86_400_000)) },
            aggregationInterval: { of: "P1D" },
            evalscript: STATS_SCRIPT,
            resx: 10 / f.kx,
            resy: 10 / f.ky,
          },
          calculations: { default: { statistics: { default: {} } } },
        },
        "application/json",
      );
      const j = (await res.json()) as { data?: { interval: { from: string }; outputs?: Record<string, { bands?: { B0?: { stats?: Record<string, unknown> } } }> }[] };
      const out: SeriesPoint[] = [];
      for (const row of j.data ?? []) {
        const a = row.outputs?.ndvi?.bands?.B0?.stats;
        const b = row.outputs?.ndmi?.bands?.B0?.stats;
        const samples = num(a?.sampleCount) ?? 0;
        if (!samples) continue;
        // sampleCount covers the polygon's whole bounding box, so a tilted field counts the corners outside it as
        // "no data": measure the clear pixels against the field's own size (area ÷ one 10 m pixel) instead
        const clear = Math.min(1, (samples - (num(a?.noDataCount) ?? 0)) / Math.max(1, polygonAreaM2(polygon) / 100));
        out.push({
          date: row.interval.from.slice(0, 10),
          ndvi: clear > 0 ? num(a?.mean) : null,
          ndmi: clear > 0 ? num(b?.mean) : null,
          clear: Math.round(clear * 1000) / 1000,
        });
      }
      return out.sort((x, y) => x.date.localeCompare(y.date));
    },

    async raster(box, date, w, h) {
      const res = await call(
        "/process",
        {
          input: { bounds: bounds(box), data: [{ type: "sentinel-2-l2a", dataFilter: day(date) }] },
          output: { width: w, height: h, responses: [{ identifier: "default", format: { type: "image/tiff" } }] },
          evalscript: INDICES_SCRIPT,
        },
        "image/tiff",
      );
      const tiff = await fromArrayBuffer(await res.arrayBuffer());
      const img = await tiff.getImage();
      if (img.getWidth() !== w || img.getHeight() !== h) throw new CdseError("server", `Copernicus returned a ${img.getWidth()}×${img.getHeight()} picture, expected ${w}×${h}`);
      const [ndviRaw, ndmiRaw, scl, mask] = (await img.readRasters({ interleave: false })) as unknown as ArrayLike<number>[];
      const ndvi = new Float32Array(w * h);
      const ndmi = new Float32Array(w * h);
      for (let p = 0; p < w * h; p++) {
        const ok = mask[p] === 1 && VALID_SCL.includes(scl[p]) && Number.isFinite(ndviRaw[p]) && Number.isFinite(ndmiRaw[p]);
        ndvi[p] = ok ? ndviRaw[p] : NaN;
        ndmi[p] = ok ? ndmiRaw[p] : NaN;
      }
      return { w, h, ndvi, ndmi };
    },

    async trueColor(box, date, w, h) {
      const res = await call(
        "/process",
        {
          input: { bounds: bounds(box), data: [{ type: "sentinel-2-l2a", dataFilter: day(date), processing: { upsampling: "BICUBIC" } }] },
          output: { width: w, height: h, responses: [{ identifier: "default", format: { type: "image/jpeg", quality: 92 } }] },
          evalscript: TRUECOLOR_SCRIPT,
        },
        "image/jpeg",
      );
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
