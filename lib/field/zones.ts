import { localFrame, pointInRing, polygonAreaHa, polygonAreaM2 } from "./geo";
import type { FrameStats, GeoBox, LonLat, XY, ZoneInfo, ZoneStat } from "./types";

// Splitting a field into zones that behave differently, from one clear satellite pass.
// Everything is deterministic (no random starts) so the same pass always gives the same zones.

export const OUTSIDE = 255;

/** Two clusters closer than this in NDVI are one zone: the sensor's own noise is about 0.02. */
const MIN_GAP_NDVI = 0.04;
const SOURCE_PIXEL_M2 = 100; // Sentinel-2's native 10 m pixel

/** How many zones a field of this size supports, counted in 10 m source pixels (area ÷ 100 m²). */
export function zoneCountFor(sourcePixels: number): number {
  if (sourcePixels < 25) return 1;
  if (sourcePixels < 60) return 2;
  if (sourcePixels < 200) return 3;
  return 4;
}

/** Share of each pixel of the scene that lies inside the field (3 × 3 samples per pixel). Row 0 is north. */
export function fieldCoverage(polygon: LonLat[], box: GeoBox, w: number, h: number): Float32Array {
  const f = localFrame([(box.west + box.east) / 2, (box.south + box.north) / 2]);
  const ring: XY[] = polygon.map(f.toXY);
  const [x0, y0] = f.toXY([box.west, box.south]);
  const [x1, y1] = f.toXY([box.east, box.north]);
  const wM = x1 - x0;
  const hM = y1 - y0;
  const out = new Float32Array(w * h);
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const iMin = Math.max(0, Math.floor(((Math.min(...xs) - x0) / wM) * w) - 1);
  const iMax = Math.min(w - 1, Math.ceil(((Math.max(...xs) - x0) / wM) * w) + 1);
  const jMin = Math.max(0, Math.floor(((y1 - Math.max(...ys)) / hM) * h) - 1);
  const jMax = Math.min(h - 1, Math.ceil(((y1 - Math.min(...ys)) / hM) * h) + 1);
  const S = 3;
  for (let j = jMin; j <= jMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      let hit = 0;
      for (let a = 0; a < S; a++) {
        const sx = x0 + ((i + (a + 0.5) / S) / w) * wM;
        for (let b = 0; b < S; b++) {
          const sy = y1 - ((j + (b + 0.5) / S) / h) * hM;
          if (pointInRing(sx, sy, ring)) hit++;
        }
      }
      out[j * w + i] = hit / (S * S);
    }
  }
  return out;
}

/** 1-D k-means with evenly spaced quantile starts: centres come back in ascending order. */
function kmeans1d(values: number[], k: number): { centres: number[]; labels: Uint8Array } {
  const sorted = [...values].sort((a, b) => a - b);
  let centres = Array.from({ length: k }, (_, c) => sorted[Math.floor(((c + 0.5) / k) * (sorted.length - 1))]);
  const labels = new Uint8Array(values.length);
  for (let iter = 0; iter < 40; iter++) {
    const sum = new Array<number>(k).fill(0);
    const cnt = new Array<number>(k).fill(0);
    for (let i = 0; i < values.length; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = Math.abs(values[i] - centres[c]);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      labels[i] = best;
      sum[best] += values[i];
      cnt[best]++;
    }
    const next = centres.map((c, i) => (cnt[i] ? sum[i] / cnt[i] : c));
    const moved = next.some((c, i) => Math.abs(c - centres[i]) > 1e-6);
    centres = next;
    if (!moved) break;
  }
  return { centres, labels };
}

const NEIGHBOURS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Replace each pixel's zone by the most common zone among its 3 × 3 neighbours (ties keep the current one). */
function modeFilter(labels: Int8Array<ArrayBuffer>, w: number, h: number, k: number): Int8Array<ArrayBuffer> {
  const out = labels.slice();
  const count = new Array<number>(k).fill(0);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = j * w + i;
      const mine = labels[p];
      if (mine < 0) continue;
      count.fill(0);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const x = i + di;
          const y = j + dj;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const l = labels[y * w + x];
          if (l >= 0) count[l]++;
        }
      }
      let best = mine;
      for (let c = 0; c < k; c++) if (count[c] > count[best]) best = c;
      out[p] = best;
    }
  }
  return out;
}

/** Fold patches smaller than `minPx` into the zone they touch most (or the closest in NDVI when they touch none). */
function absorbSmall(labels: Int8Array, w: number, h: number, k: number, minPx: number, centres: number[]) {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (labels[start] < 0 || seen[start]) continue;
    const lab = labels[start];
    const patch: number[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      patch.push(p);
      const i = p % w;
      const j = (p - i) / w;
      for (const [di, dj] of NEIGHBOURS4) {
        const x = i + di;
        const y = j + dj;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const q = y * w + x;
        if (!seen[q] && labels[q] === lab) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (patch.length >= minPx) continue;
    const touch = new Array<number>(k).fill(0);
    for (const p of patch) {
      const i = p % w;
      const j = (p - i) / w;
      for (const [di, dj] of NEIGHBOURS4) {
        const x = i + di;
        const y = j + dj;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const l = labels[y * w + x];
        if (l >= 0 && l !== lab) touch[l]++;
      }
    }
    let best = -1;
    for (let c = 0; c < k; c++) if (c !== lab && touch[c] > 0 && (best < 0 || touch[c] > touch[best])) best = c;
    if (best < 0) {
      for (let c = 0; c < k; c++) if (c !== lab && (best < 0 || Math.abs(centres[c] - centres[lab]) < Math.abs(centres[best] - centres[lab]))) best = c;
    }
    if (best >= 0) for (const p of patch) labels[p] = best;
  }
}

export interface ZoneBuild {
  /** one byte per scene pixel: zone index in reading order, OUTSIDE (255) elsewhere */
  map: Uint8Array;
  list: ZoneInfo[];
}

/**
 * Zones from one clear pass: group the field's pixels by greenness, tidy the patches, name them from the
 * north-west corner. Returns null when the field is too small, has too little clear data, or is simply even.
 */
export function buildZones(args: { polygon: LonLat[]; box: GeoBox; w: number; h: number; ndvi: ArrayLike<number>; coverage?: Float32Array }): ZoneBuild | null {
  const { polygon, box, w, h, ndvi } = args;
  const cov = args.coverage ?? fieldCoverage(polygon, box, w, h);
  const f = localFrame([(box.west + box.east) / 2, (box.south + box.north) / 2]);
  const [x0, y0] = f.toXY([box.west, box.south]);
  const [x1, y1] = f.toXY([box.east, box.north]);
  const pixelM = (x1 - x0) / w;
  const pixelM2 = pixelM * pixelM;

  const k0 = zoneCountFor(polygonAreaM2(polygon) / SOURCE_PIXEL_M2);
  if (k0 < 2) return null;

  const at: number[] = [];
  const values: number[] = [];
  let inField = 0;
  for (let p = 0; p < w * h; p++) {
    if (cov[p] < 0.5) continue;
    inField++;
    if (Number.isFinite(ndvi[p])) {
      at.push(p);
      values.push(ndvi[p]);
    }
  }
  // zones drawn from a mostly clouded view would be guesses: need half the field and at least ~15 source pixels
  if (at.length < inField / 2 || at.length * pixelM2 < 15 * SOURCE_PIXEL_M2) return null;

  // as many clusters as the size allows, but no two closer than the noise floor
  let km = kmeans1d(values, k0);
  let k = k0;
  while (k > 1) {
    const gaps = km.centres.slice(1).map((c, i) => c - km.centres[i]);
    if (Math.min(...gaps) >= MIN_GAP_NDVI) break;
    k--;
    if (k > 1) km = kmeans1d(values, k);
  }
  if (k < 2) return null;

  let labels = new Int8Array(w * h).fill(-1);
  at.forEach((p, n) => (labels[p] = km.labels[n]));
  labels = modeFilter(modeFilter(labels, w, h, k), w, h, k);
  absorbSmall(labels, w, h, k, Math.max(3, Math.round((8 * SOURCE_PIXEL_M2) / pixelM2)), km.centres);

  // pixels with no clear reading (cloud holes) take the zone of the nearest clear pixel
  const queue: number[] = [];
  for (let p = 0; p < w * h; p++) if (labels[p] >= 0) queue.push(p);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    const i = p % w;
    const j = (p - i) / w;
    for (const [di, dj] of NEIGHBOURS4) {
      const x = i + di;
      const y = j + dj;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const q = y * w + x;
      if (labels[q] === -1 && cov[q] >= 0.5) {
        labels[q] = labels[p];
        queue.push(q);
      }
    }
  }

  // centroid of each surviving zone, then reading order (north-west first) → A, B, C…
  const stat = Array.from({ length: k }, () => ({ n: 0, sx: 0, sy: 0 }));
  for (let p = 0; p < w * h; p++) {
    const l = labels[p];
    if (l < 0 || cov[p] < 0.5) continue;
    const i = p % w;
    const j = (p - i) / w;
    stat[l].n++;
    stat[l].sx += x0 + ((i + 0.5) / w) * (x1 - x0);
    stat[l].sy += y1 - ((j + 0.5) / h) * (y1 - y0);
  }
  const alive = stat.map((s, l) => ({ l, ...s })).filter((s) => s.n > 0);
  if (alive.length < 2) return null;
  alive.sort((a, b) => a.sx / a.n - a.sy / a.n - (b.sx / b.n - b.sy / b.n));
  const rename = new Map(alive.map((s, idx) => [s.l, idx] as const));
  const total = alive.reduce((s, a) => s + a.n, 0);
  const totalHa = polygonAreaHa(polygon);

  const map = new Uint8Array(w * h).fill(OUTSIDE);
  for (let p = 0; p < w * h; p++) {
    const l = labels[p];
    if (l >= 0 && cov[p] >= 0.5) map[p] = rename.get(l) ?? OUTSIDE;
  }
  const list: ZoneInfo[] = alive.map((s, idx) => ({
    id: String.fromCharCode(65 + idx),
    areaHa: Math.round(((totalHa * s.n) / total) * 1000) / 1000,
    centroid: f.toLonLat([s.sx / s.n, s.sy / s.n]),
  }));
  return { map, list };
}

const mean = (sum: number, n: number): number | null => (n > 0 ? sum / n : null);

/** Average readings of one frame over the whole field and over each zone. `ndvi`/`ndmi` hold NaN where there was no reading. */
export function frameStats(args: { date: string; zoneMap: Uint8Array | null; zoneCount: number; coverage: Float32Array; ndvi: ArrayLike<number>; ndmi: ArrayLike<number> }): FrameStats {
  const { date, zoneMap, zoneCount, coverage, ndvi, ndmi } = args;
  const blank = () => ({ nv: 0, sv: 0, nm: 0, sm: 0, px: 0 });
  const fld = blank();
  const zs = Array.from({ length: zoneCount }, blank);
  for (let p = 0; p < coverage.length; p++) {
    if (coverage[p] < 0.5) continue;
    const z = zoneMap ? zoneMap[p] : OUTSIDE;
    const bins = z < zoneCount ? [fld, zs[z]] : [fld];
    for (const b of bins) {
      b.px++;
      const v = ndvi[p];
      const m = ndmi[p];
      if (Number.isFinite(v)) {
        b.nv++;
        b.sv += v;
      }
      if (Number.isFinite(m)) {
        b.nm++;
        b.sm += m;
      }
    }
  }
  const out = (b: ReturnType<typeof blank>): ZoneStat => ({ ndvi: round(mean(b.sv, b.nv)), ndmi: round(mean(b.sm, b.nm)), clear: b.px ? Math.round((b.nv / b.px) * 1000) / 1000 : 0 });
  return { date, field: out(fld), zones: zs.map(out) };
}

const round = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);
