import type { GeoBox, LonLat, XY } from "./types";

// Small-area geometry for farm fields. Everything here works in a local flat frame (metres east / north of an
// origin): for a few kilometres the error against a true ellipsoid is far below one Sentinel-2 pixel.

const EARTH_R = 6_371_008.8; // mean Earth radius, metres
const DEG = Math.PI / 180;

export function localFrame(origin: LonLat) {
  const ky = DEG * EARTH_R;
  const kx = ky * Math.cos(origin[1] * DEG);
  return {
    kx,
    ky,
    toXY: (p: LonLat): XY => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * ky],
    toLonLat: (p: XY): LonLat => [origin[0] + p[0] / kx, origin[1] + p[1] / ky],
  };
}

export const meanPoint = (poly: LonLat[]): LonLat => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];

/** Signed shoelace area of a metric ring (positive = counter-clockwise). */
function ringArea(ring: XY[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export const polygonAreaM2 = (poly: LonLat[]): number => {
  if (poly.length < 3) return 0;
  const f = localFrame(meanPoint(poly));
  return Math.abs(ringArea(poly.map(f.toXY)));
};

export const polygonAreaHa = (poly: LonLat[]): number => polygonAreaM2(poly) / 10_000;

/** Area-weighted centre of the field (falls back to the mean of the corners for a degenerate ring). */
export function polygonCentroid(poly: LonLat[]): LonLat {
  const o = meanPoint(poly);
  const f = localFrame(o);
  const ring = poly.map(f.toXY);
  const a = ringArea(ring);
  if (Math.abs(a) < 1e-6) return o;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const cross = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * cross;
    cy += (p[1] + q[1]) * cross;
  }
  return f.toLonLat([cx / (6 * a), cy / (6 * a)]);
}

export function bboxOf(poly: LonLat[]): GeoBox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lon, lat] of poly) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { west, south, east, north };
}

/** Ray casting. The ring is not closed (the last corner connects to the first). */
export function pointInRing(x: number, y: number, ring: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const orient = (a: XY, b: XY, c: XY) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const within = (a: XY, b: XY, c: XY) =>
  Math.min(a[0], b[0]) - 1e-9 <= c[0] && c[0] <= Math.max(a[0], b[0]) + 1e-9 && Math.min(a[1], b[1]) - 1e-9 <= c[1] && c[1] <= Math.max(a[1], b[1]) + 1e-9;

/** Do the segments p1–p2 and p3–p4 touch or cross? */
function segmentsMeet(p1: XY, p2: XY, p3: XY, p4: XY): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const eps = 1e-7;
  return (
    (Math.abs(d1) < eps && within(p3, p4, p1)) ||
    (Math.abs(d2) < eps && within(p3, p4, p2)) ||
    (Math.abs(d3) < eps && within(p1, p2, p3)) ||
    (Math.abs(d4) < eps && within(p1, p2, p4))
  );
}

/** A field outline must not cross itself (a bow-tie has no sensible area) or repeat a corner. */
export function isSimplePolygon(poly: LonLat[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  const f = localFrame(meanPoint(poly));
  const ring = poly.map(f.toXY);
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5) return false; // two corners on top of each other
  }
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const c = ring[j];
      const d = ring[(j + 1) % n];
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) {
        // neighbours share one corner; they must not fold back over each other
        const shared = j === i + 1 ? b : a;
        const far1 = j === i + 1 ? a : b;
        const far2 = j === i + 1 ? d : c;
        const u: XY = [far1[0] - shared[0], far1[1] - shared[1]];
        const v: XY = [far2[0] - shared[0], far2[1] - shared[1]];
        if (Math.abs(u[0] * v[1] - u[1] * v[0]) < 1e-7 && u[0] * v[0] + u[1] * v[1] > 0) return false;
        continue;
      }
      if (segmentsMeet(a, b, c, d)) return false;
    }
  }
  return true;
}

/** Furthest corner from the first one, in metres (a sanity limit on what one farm can be). */
export function spanM(poly: LonLat[]): number {
  const f = localFrame(poly[0]);
  return Math.max(...poly.map((p) => Math.hypot(...f.toXY(p))));
}

/** Limits on a field outline: what the satellite view can use and what one farm can plausibly be. */
export const POLYGON_LIMITS = { minHa: 0.05, maxHa: 500, maxCorners: 80, maxSpanM: 3000 } as const;

export type OutlineCheck = "empty" | "incomplete" | "crosses" | "size" | "ok";

/** Is this outline ready to save? (The same rules the server applies.) */
export function checkOutline(poly: LonLat[] | null): OutlineCheck {
  if (!poly || poly.length === 0) return "empty";
  if (poly.length < 3) return "incomplete";
  if (poly.length > POLYGON_LIMITS.maxCorners || !isSimplePolygon(poly)) return "crosses";
  const ha = polygonAreaHa(poly);
  if (ha < POLYGON_LIMITS.minHa || ha > POLYGON_LIMITS.maxHa || spanM(poly) > POLYGON_LIMITS.maxSpanM) return "size";
  return "ok";
}

export const MIN_SCENE_M = 500;
export const MAX_SCENE_M = 3000;

/**
 * The square picture around a field: the field's box plus a generous margin (so the neighbours show),
 * never smaller than 500 m or larger than 3 km.
 */
export function sceneBox(poly: LonLat[]): { box: GeoBox; sideM: number } {
  const b = bboxOf(poly);
  const centre: LonLat = [(b.west + b.east) / 2, (b.south + b.north) / 2];
  const f = localFrame(centre);
  const [wx, wy] = f.toXY([b.east, b.north]);
  const span = Math.max(2 * Math.abs(wx), 2 * Math.abs(wy)); // the field's larger side, metres
  const sideM = Math.min(MAX_SCENE_M, Math.max(MIN_SCENE_M, span + 2 * Math.max(150, 0.6 * span)));
  const sw = f.toLonLat([-sideM / 2, -sideM / 2]);
  const ne = f.toLonLat([sideM / 2, sideM / 2]);
  return { box: { west: sw[0], south: sw[1], east: ne[0], north: ne[1] }, sideM };
}

/** A north-aligned square of the given area centred on a point: the one-tap start for the outline editor. */
export function squareFromArea(centre: LonLat, areaHa: number): LonLat[] {
  const half = Math.sqrt(Math.max(areaHa, 0) * 10_000) / 2;
  const f = localFrame(centre);
  return ([[-half, half], [half, half], [half, -half], [-half, -half]] as XY[]).map(f.toLonLat); // NW, NE, SE, SW
}

/** A stable cache key: corners rounded to ~10 cm. */
export const polygonKey = (poly: LonLat[]): string => JSON.stringify(poly.map(([lon, lat]) => [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]));

/** Scale a polygon about its centroid so it has exactly the wanted area (used to make the demo field 1.0 ha). */
export function scaleToArea(poly: LonLat[], areaHa: number): LonLat[] {
  const c = polygonCentroid(poly);
  const f = localFrame(c);
  const k = Math.sqrt((areaHa * 10_000) / polygonAreaM2(poly));
  return poly.map((p) => {
    const [x, y] = f.toXY(p);
    return f.toLonLat([x * k, y * k]);
  });
}
