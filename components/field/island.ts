import * as THREE from "three";
import type { HeightAt } from "./geometry";

// The field view is a floating island: the real ground (photo, terrain) on top; underneath a rugged rock mass wearing moss and
// grass, with vines, waterfalls and a few trees; small rocks drifting around it; clouds far below (see Clouds.tsx and
// IslandLife.tsx). Plain geometry, no React, so it can be tested without a browser. Scene units are metres, +y up, the island is
// centred on (cx, cz).

export interface IslandShape {
  cx: number;
  cz: number;
  /** the radius of the top, before the rim's wobble */
  R: number;
  /** how far the rock body hangs below the rim */
  depth: number;
}

// ── a little deterministic noise (no randomness: the same island every time) ─────────────────────────────────
export function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const w = smooth(z - zi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}
/** Three octaves, 0–1. */
export function fbm(x: number, y: number, z: number): number {
  return noise3(x, y, z) * 0.55 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.15;
}

/** The rim is not a perfect circle: a few slow waves make an organic outline (never smaller than 0.9 R). */
export function rimRadius(R: number, theta: number): number {
  return R * (1 + 0.05 * Math.sin(3 * theta + 0.7) + 0.035 * Math.sin(5 * theta + 2.1) + 0.015 * Math.sin(9 * theta + 4.0));
}

/** The island's top: a disc of ground with the field's heights and UVs that index the square ground texture. */
export function buildIslandTop(shape: IslandShape, sideM: number, heightAt: HeightAt, rings = 44, sectors = 96): THREE.BufferGeometry {
  const { cx, cz, R } = shape;
  const pos = new Float32Array((rings * sectors + 1) * 3);
  const uv = new Float32Array((rings * sectors + 1) * 2);
  const put = (i: number, x: number, z: number) => {
    pos.set([x, heightAt(x, z), z], i * 3);
    uv.set([(x + sideM / 2) / sideM, 1 - (z + sideM / 2) / sideM], i * 2); // north (−z) is the top of the texture
  };
  put(0, cx, cz);
  for (let i = 1; i <= rings; i++) {
    for (let j = 0; j < sectors; j++) {
      const a = (j / sectors) * Math.PI * 2;
      const r = rimRadius(R, a) * (i / rings);
      put(1 + (i - 1) * sectors + j, cx + Math.cos(a) * r, cz + Math.sin(a) * r);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < sectors; j++) idx.push(0, 1 + ((j + 1) % sectors), 1 + j); // the middle fan, facing up
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < sectors; j++) {
      const a = 1 + (i - 1) * sectors + j;
      const b = 1 + (i - 1) * sectors + ((j + 1) % sectors);
      const c = 1 + i * sectors + j;
      const d = 1 + i * sectors + ((j + 1) % sectors);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ── the rock body ────────────────────────────────────────────────────────────────────────────────────────────
/**
 * A point on the rock body at angle `a` and depth `t` (0 at the rim, 1 at the tip). The body bulges just under the rim, then
 * tapers in cliffs and ledges (terraces and vertical cracks), with big lumps and small crags, and some sides hang lower
 * than others, so the underside has teeth rather than one smooth point. Vines, waterfalls and trees all hang off this.
 */
export function bodyPoint(shape: IslandShape, heightAt: HeightAt, a: number, t: number): [number, number, number] {
  const { cx, cz, R, depth } = shape;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const rim = rimRadius(R, a);
  const rimY = heightAt(cx + ca * rim, cz + sa * rim);
  if (t <= 0) return [cx + ca * rim, rimY, cz + sa * rim];
  const blend = smooth(Math.min(1, t / 0.12)); // no lumps right at the rim
  const lobes = 0.76 + 0.48 * fbm(ca * 1.5 + 3.1, sa * 1.5 + 7.7, t * 2.0); // big lumps
  const crags = 0.92 + 0.16 * fbm(ca * 6 + 1.3, sa * 6 + 9.1, t * 7); // small ones
  const cracks = 1 - 0.07 * Math.abs(Math.sin(a * 9 + 4 * fbm(ca * 3, sa * 3, t * 3))) * smooth(Math.min(1, t / 0.3)); // vertical fissures
  const terraces = 1 + 0.05 * Math.sin(t * 17 + 3 * fbm(ca * 2 + 8, sa * 2 + 1, 1.7)); // ledges
  const shoulder = 1 + 0.07 * Math.sin(Math.PI * Math.min(1, t / 0.25)); // a bulge just under the rim
  const taper = (1 - t) ** 0.56;
  const r = t >= 1 ? 0 : rim * taper * (1 + (lobes * crags * cracks * terraces - 1) * blend) * shoulder;
  const sag = 0.88 + 0.24 * fbm(ca * 1.2 + 5.5, sa * 1.2 + 2.2, 3.3); // some sides hang lower
  const teeth = depth * 0.2 * smooth(clamp01((t - 0.5) / 0.4)) * Math.max(0, fbm(ca * 3.5 + 2, sa * 3.5 + 6, t * 2.5) - 0.48); // stalactites
  const y = rimY - depth * t ** 1.12 * (1 + (sag - 1) * blend) - teeth;
  return [cx + ca * r, y, cz + sa * r];
}

const ROCK_WARM = new THREE.Color("#b09a80");
const ROCK_DARK = new THREE.Color("#85705c");
const ROCK_COOL = new THREE.Color("#8e8a82");
const GRASS = new THREE.Color("#78a838");
const MOSS = new THREE.Color("#4e7d2f");
const MOSS_DARK = new THREE.Color("#2f5a26");
const HAZE = new THREE.Color("#9fb0c8");

/** Bare rock at depth `t`, with noise so it does not look painted. */
function rockColour(t: number, n: number, out: THREE.Color): THREE.Color {
  if (t < 0.5) out.copy(ROCK_WARM).lerp(ROCK_DARK, t / 0.5);
  else out.copy(ROCK_DARK).lerp(ROCK_COOL, (t - 0.5) / 0.5);
  if (t > 0.8) out.lerp(HAZE, ((t - 0.8) / 0.2) * 0.22); // a little aerial perspective near the tip
  return out.multiplyScalar(0.8 + 0.4 * n);
}

/**
 * The rock body under the top. It starts exactly on the rim (no crack) and is flat shaded in facets. Each facet is coloured
 * by what faces the sky: grass along the rim, moss on the upward-facing surfaces of the upper half, bare rock elsewhere.
 */
export function buildIslandBody(shape: IslandShape, heightAt: HeightAt, rows = 16, sectors = 96): THREE.BufferGeometry {
  const pos: number[] = [];
  const tt: number[] = [];
  for (let k = 0; k <= rows; k++) {
    const t = k / rows;
    const step = t < 0.5 ? 1 : t < 0.75 ? 2 : t < 0.9 ? 4 : 8; // big flat facets near the tip, not slivers
    for (let j = 0; j < sectors; j++) {
      pos.push(...bodyPoint(shape, heightAt, ((Math.floor(j / step) * step) / sectors) * Math.PI * 2, t));
      tt.push(t);
    }
  }
  const idx: number[] = [];
  for (let k = 0; k < rows; k++) {
    for (let j = 0; j < sectors; j++) {
      const a = k * sectors + j;
      const b = k * sectors + ((j + 1) % sectors);
      const c = (k + 1) * sectors + j;
      const d = (k + 1) * sectors + ((j + 1) % sectors);
      idx.push(a, b, c, b, d, c); // counter-clockwise seen from outside: the faces point out of the rock
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(tt, 1));
  g.setIndex(idx);
  const flat = g.toNonIndexed(); // each triangle owns its vertices: flat shading, and one colour per facet
  g.dispose();
  flat.computeVertexNormals();
  const p = flat.attributes.position as THREE.BufferAttribute;
  const n = flat.attributes.normal as THREE.BufferAttribute;
  const t = flat.attributes.aT as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const m = new THREE.Color();
  const R = shape.R;
  for (let i = 0; i < p.count; i += 6) {
    // one colour for the whole quad (its two triangles), so the surface reads as rock faces, not a chessboard
    let cxm = 0;
    let cym = 0;
    let czm = 0;
    let tm = 0;
    for (let k = 0; k < 6; k++) {
      cxm += p.getX(i + k) / 6;
      cym += p.getY(i + k) / 6;
      czm += p.getZ(i + k) / 6;
      tm += t.getX(i + k) / 6;
    }
    const ny = (n.getY(i) + n.getY(i + 3)) / 2;
    const patch = fbm(cxm / (R * 0.38) + 3, cym / (R * 0.5), czm / (R * 0.38) - 1); // big patches of moss
    const streak = fbm(cxm / (R * 0.5), cym / (R * 0.12), czm / (R * 0.5)); // vertical staining, like water runs
    const grain = fbm(cxm / (R * 0.09), cym / (R * 0.09), czm / (R * 0.09));
    rockColour(tm, 0.55 * streak + 0.45 * grain, c);
    const moss = clamp01((ny * 0.8 + 0.42 + (patch - 0.5) * 1.8) * 2) * (1 - smooth(clamp01((tm - 0.4) / 0.5))); // patches on cliffs, full on ledges, none underneath
    m.copy(MOSS).lerp(MOSS_DARK, grain);
    c.lerp(m, moss * 0.9);
    if (tm < 0.05) c.copy(GRASS).multiplyScalar(0.85 + 0.3 * grain); // the grassy lip all round
    else if (tm < 0.1) c.lerp(GRASS, (1 - (tm - 0.05) / 0.05) * 0.7);
    for (let k = 0; k < 6; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  flat.setAttribute("color", new THREE.BufferAttribute(col, 3));
  flat.deleteAttribute("aT");
  flat.computeBoundingSphere();
  return flat;
}

// ── things that hang or stand on the island ──────────────────────────────────────────────────────────────────
/** Vines hanging from the rim down the rock: thin ribbons that follow the body's surface a little way off it. */
export function buildVines(shape: IslandShape, heightAt: HeightAt, count = 30, segments = 7): THREE.BufferGeometry {
  const { R } = shape;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const tip = new THREE.Color("#79ad3f");
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (hash(i, 1, 3) - 0.5) * 0.18;
    const len = 0.1 + 0.3 * hash(i, 2, 5);
    const w0 = R * (0.005 + 0.005 * hash(i, 3, 7));
    const base = pos.length / 3;
    for (let k = 0; k <= segments; k++) {
      const u = k / segments;
      const [x, y, z] = bodyPoint(shape, heightAt, a, 0.01 + len * u);
      const out = R * (0.012 + 0.008 * Math.sin(u * 5 + i)); // a little off the surface, swaying
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const w = w0 * (1 - 0.75 * u);
      pos.push(x + ca * out - sa * w, y, z + sa * out + ca * w, x + ca * out + sa * w, y, z + sa * out - ca * w);
      c.set("#2f5a26").lerp(tip, 0.25 + 0.6 * u * hash(i, 5, 9));
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    for (let k = 0; k < segments; k++) {
      const a0 = base + k * 2;
      idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * The path of a waterfall at angle `a`: it leaves the rim, clings to the rock for the first third of the depth, then falls
 * straight down into the clouds. Points from the top down.
 */
export function waterfallPath(shape: IslandShape, heightAt: HeightAt, a: number): THREE.Vector3[] {
  const { R, depth } = shape;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const pts: THREE.Vector3[] = [];
  const cling = 7;
  for (let k = 0; k <= cling; k++) {
    const t = (k / cling) * 0.3;
    const [x, y, z] = bodyPoint(shape, heightAt, a, t);
    const out = R * (0.018 + 0.05 * (k / cling)); // leaves the wall as it goes
    pts.push(new THREE.Vector3(x + ca * out, y, z + sa * out));
  }
  const last = pts[pts.length - 1];
  const floor = -depth * 1.32;
  for (let k = 1; k <= 6; k++) pts.push(new THREE.Vector3(last.x, last.y + (floor - last.y) * (k / 6), last.z));
  return pts;
}

/** A waterfall as two crossed ribbons (so it shows from every side). UV: u across, v along its length in metres. */
export function buildFall(path: THREE.Vector3[], width0: number, width1: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let along = 0;
  const lens = path.map((p, i) => (along += i ? p.distanceTo(path[i - 1]) : 0));
  [0, Math.PI / 2].forEach((turn) => {
    const base = pos.length / 3;
    path.forEach((p, i) => {
      const w = width0 + (width1 - width0) * (i / (path.length - 1));
      const dx = Math.cos(turn) * w;
      const dz = Math.sin(turn) * w;
      pos.push(p.x - dx / 2, p.y, p.z - dz / 2, p.x + dx / 2, p.y, p.z + dz / 2);
      uv.push(0, lens[i], 1, lens[i]);
    });
    for (let i = 0; i < path.length - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export interface RimTree {
  x: number;
  y: number;
  z: number;
  /** height in metres */
  h: number;
  seed: number;
}

/** Trees along the outer edge of the top, never over the field or the pad. */
export function rimTrees(shape: IslandShape, heightAt: HeightAt, count = 16): RimTree[] {
  const { cx, cz, R } = shape;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + (hash(i, 4, 4) - 0.5) * 0.35;
    const rim = rimRadius(R, a);
    const r = rim * (0.9 + 0.07 * hash(i, 6, 2));
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    return { x, y: heightAt(x, z), z, h: R * (0.045 + 0.04 * hash(i, 8, 1)), seed: i + 1 };
  });
}

export interface FloatingRock {
  /** where it hangs, scene metres */
  at: [number, number, number];
  radius: number;
  seed: number;
  /** bobbing: amplitude (m), speed (rad/s), phase */
  bob: [number, number, number];
}

/** A handful of rocks drifting around the island: bigger ones low and close, small ones high and far. */
export function floatingRocks(shape: IslandShape, count = 8): FloatingRock[] {
  const { cx, cz, R, depth } = shape;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + hash(i, 1, 2) * 0.9;
    const dist = R * (1.08 + 0.42 * hash(i, 3, 4));
    const big = hash(i, 5, 6);
    const radius = R * (0.022 + 0.05 * big * big);
    const y = -depth * (0.1 + 0.8 * hash(i, 7, 8));
    return {
      at: [cx + Math.cos(a) * dist, y, cz + Math.sin(a) * dist],
      radius,
      seed: i + 1,
      bob: [R * (0.008 + 0.012 * hash(i, 9, 1)), 0.25 + 0.35 * hash(i, 2, 9), hash(i, 4, 7) * Math.PI * 2],
    };
  });
}

/** One small rock: a lumpy icosahedron, flat shaded, in the same rock colours (with a little moss on top). */
export function rockGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const lump = 0.72 + 0.5 * fbm(v.x * 1.7 + seed * 7.3, v.y * 1.7 + seed * 3.1, v.z * 1.7 + seed * 5.9);
    const squash = 0.78 + 0.1 * hash(seed, 1, 1);
    p.setXYZ(i, v.x * lump, v.y * lump * squash - (v.y < 0 ? 0.25 * Math.abs(v.y) : 0), v.z * lump); // a heavier, pointier underside
  }
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  const pos = flat.attributes.position as THREE.BufferAttribute;
  const n = flat.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const grain = fbm(pos.getX(i) * 3 + seed, pos.getY(i) * 3, pos.getZ(i) * 3);
    rockColour(0.15 + 0.35 * (1 - (n.getY(i) + 1) / 2), grain, c);
    if (n.getY(i) > 0.55) c.lerp(MOSS, 0.75);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  flat.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return flat;
}
