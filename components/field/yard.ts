import { pointInRing } from "@/lib/field/geo";
import type { XZ } from "./geometry";

// Where the farm's equipment (solar panels, pump house, basin) is drawn, and where the water runs in the field.
// The farmer never tells us where the equipment is, so it is drawn on a pad next to the field, labelled as
// illustrative. Scene metres: +x east, +z south.

/** The concrete pad the equipment stands on, in layout units (see YARD_SCALE). */
export const PAD = { w: 46, d: 34 };

/**
 * Metres per layout unit. A real 3 kWp system is a fraction of this size; it is drawn larger so that it reads on a phone,
 * and labelled as illustrative.
 */
export const YARD_SCALE = 1.4;
/** The pad's real size in the scene (metres). */
export const PAD_M = { w: PAD.w * YARD_SCALE, d: PAD.d * YARD_SCALE };

/** Where things stand on the pad, relative to its middle. Everything fits inside ±PAD/2. */
export const YARD = {
  pv: { x: -8, rows: [-11, -5], perRow: 6, panelW: 3.6, panelD: 2.3, tilt: (28 * Math.PI) / 180 },
  cabinet: { x: 11, z: -10, w: 4.2, d: 2.6, h: 3 }, // the inverter, or a diesel generator
  pump: { x: 14, z: 6, w: 7, d: 5, h: 4 },
  well: { x: 14, z: 13 },
  basin: { x: -9, z: 8, w: 20, d: 13, wall: 1.6 },
};

export interface YardSpot {
  /** the middle of the pad, in scene metres */
  at: XZ;
  /** +1: the pad is east of the field (the field is on its −x side); −1: west, with the layout mirrored */
  side: 1 | -1;
}

/** Beyond this the field is too big for one illustrative yard to mean anything on screen. */
export const MAX_YARD_SPAN_M = 400;

/** The pad's place: beside the field (east first, then west) if it fits inside the scene, else null. */
export function placeYard(ring: XZ[], sideM: number): YardSpot | null {
  const xs = ring.map((p) => p[0]);
  const zs = ring.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  if (Math.max(maxX - minX, Math.max(...zs) - Math.min(...zs)) > MAX_YARD_SPAN_M) return null;
  const gap = 8;
  const lim = sideM / 2 - 10;
  const candidates: YardSpot[] = [
    { at: [maxX + gap + PAD_M.w / 2, cz], side: 1 },
    { at: [minX - gap - PAD_M.w / 2, cz], side: -1 },
  ];
  return candidates.find(({ at: [x, z] }) => Math.abs(x) + PAD_M.w / 2 <= lim && Math.abs(z) + PAD_M.d / 2 <= lim) ?? null;
}

export interface Laterals {
  /** drip lines across the field, clipped to its outline */
  lines: [XZ, XZ][];
  /** the main line along the side nearest the pad, joining the lateral ends */
  header: XZ[];
}

/**
 * Drip lines the way a farmer lays them: parallel to the field's long side, `spacingM` apart, clipped to the outline;
 * with the header along the end nearest `toward` (the pad).
 */
export function lateralLines(ring: XZ[], toward: XZ, spacingM = 9): Laterals {
  let best = 0;
  let longest = -1;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > longest) {
      longest = len;
      best = i;
    }
  });
  const a0 = ring[best];
  const b0 = ring[(best + 1) % ring.length];
  const dx = (b0[0] - a0[0]) / longest;
  const dz = (b0[1] - a0[1]) / longest;
  const nx = -dz;
  const nz = dx;
  const t = (p: XZ) => p[0] * nx + p[1] * nz;
  const ts = ring.map(t);
  const lo = Math.min(...ts);
  const hi = Math.max(...ts);
  const raw: { p0: XZ; p1: XZ; t: number }[] = [];
  for (let tt = lo + spacingM / 2; tt < hi; tt += spacingM) {
    const hits: number[] = [];
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const ta = t(a);
      const tb = t(b);
      if ((ta - tt) * (tb - tt) < 0) {
        const u = (tt - ta) / (tb - ta);
        hits.push((a[0] + (b[0] - a[0]) * u) * dx + (a[1] + (b[1] - a[1]) * u) * dz);
      }
    });
    hits.sort((p, q) => p - q);
    for (let k = 0; k + 1 < hits.length; k += 2) {
      const s0 = hits[k] + 1.5;
      const s1 = hits[k + 1] - 1.5;
      if (s1 - s0 < 4) continue;
      const p0: XZ = [dx * s0 + nx * tt, dz * s0 + nz * tt];
      const p1: XZ = [dx * s1 + nx * tt, dz * s1 + nz * tt];
      raw.push({ p0, p1, t: tt });
    }
  }
  // one end for all of them: the header is a single pipe along the side nearer the pad
  const d = (p: XZ) => Math.hypot(p[0] - toward[0], p[1] - toward[1]);
  const flip = raw.reduce((sum, r) => sum + d(r.p0) - d(r.p1), 0) > 0;
  const oriented = raw.map((r) => ({ a: flip ? r.p1 : r.p0, b: flip ? r.p0 : r.p1, t: r.t }));
  return { lines: oriented.map((r) => [r.a, r.b] as [XZ, XZ]), header: oriented.sort((p, q) => p.t - q.t).map((r) => r.a) };
}

/** Is a point inside the outline? (for tests and for keeping equipment off the crop) */
export const insideRing = (p: XZ, ring: XZ[]) => pointInRing(p[0], p[1], ring);
