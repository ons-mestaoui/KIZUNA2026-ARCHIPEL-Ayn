import * as THREE from "three";

// The 3D shapes of the field view, built as plain geometry (no React) so they can be tested without a browser.
// Scene units are metres. +x east, −z north, +y up; the middle of the scene box is the origin.

export type XZ = [number, number];
export type HeightAt = (x: number, z: number) => number;

/** A flat or hilly square of ground with UVs that put the north edge at the top of the texture. */
export function buildTerrain(sideM: number, segments: number, heightAt: HeightAt): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(sideM, sideM, segments, segments);
  g.rotateX(-Math.PI / 2); // lies in the XZ plane; the top row of the texture (v = 1) is the north edge (−z)
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  pos.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

/** Points along a closed outline, no further apart than `stepM`. The first point is repeated at the end to close it. */
export function densify(ring: XZ[], stepM: number): XZ[] {
  const out: XZ[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / stepM));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(ring[0]);
  return out;
}

/**
 * The field's boundary as a wall that hugs the ground: a thin bright band at the base that fades to nothing at the
 * top. Vertex colours carry the fade (RGBA), so one material draws it.
 */
export function buildWall(ring: XZ[], heightAt: HeightAt, wallH: number, rgb: [number, number, number]): THREE.BufferGeometry {
  const pts = densify(ring, 3);
  const rows = 3;
  const band = Math.min(2.4, Math.max(0.8, wallH * 0.07));
  const alphas = [1, 0.92, 0];
  const pos = new Float32Array(pts.length * rows * 3);
  const col = new Float32Array(pts.length * rows * 4);
  pts.forEach(([x, z], j) => {
    const y0 = heightAt(x, z);
    const ys = [y0 + 0.05, y0 + band, y0 + wallH];
    ys.forEach((y, r) => {
      const k = j * rows + r;
      pos.set([x, y, z], k * 3);
      col.set([rgb[0], rgb[1], rgb[2], alphas[r]], k * 4);
    });
  });
  const idx: number[] = [];
  for (let j = 0; j < pts.length - 1; j++) {
    for (let r = 0; r < rows - 1; r++) {
      const a = j * rows + r;
      const b = (j + 1) * rows + r;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export interface Stratum {
  /** where this layer ends, as a fraction of the slab depth below ground level 0 (the last one is 1) */
  to: number;
  color: string;
}

/** The four cut faces of the slab, banded like the Model view's soil and aquifer layers. */
export function buildSkirt(sideM: number, segments: number, heightAt: HeightAt, depth: number, strata: Stratum[]): THREE.BufferGeometry {
  const half = sideM / 2;
  const sides: ((t: number) => XZ)[] = [
    (t) => [-half + t * sideM, -half], // north
    (t) => [half, -half + t * sideM], // east
    (t) => [half - t * sideM, half], // south
    (t) => [-half, half - t * sideM], // west
  ];
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const colour = new THREE.Color();
  for (const side of sides) {
    for (let b = 0; b < strata.length; b++) {
      colour.set(strata[b].color);
      const base = pos.length / 3;
      for (let i = 0; i <= segments; i++) {
        const [x, z] = side(i / segments);
        const upper = b === 0 ? heightAt(x, z) : -depth * strata[b - 1].to;
        const lower = -depth * strata[b].to;
        pos.push(x, upper, z, x, lower, z);
        col.push(colour.r, colour.g, colour.b, colour.r, colour.g, colour.b);
      }
      for (let i = 0; i < segments; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Height samples on a regular grid (row 0 = north edge), read at any scene position with bilinear blending. */
export function heightSampler(heights: { w: number; h: number; data: ArrayLike<number> }, sideM: number, exaggeration: number, floorM: number): HeightAt {
  const { w, h, data } = heights;
  return (x, z) => {
    const u = Math.min(w - 1, Math.max(0, ((x + sideM / 2) / sideM) * (w - 1)));
    const v = Math.min(h - 1, Math.max(0, ((z + sideM / 2) / sideM) * (h - 1)));
    const i0 = Math.floor(u);
    const j0 = Math.floor(v);
    const i1 = Math.min(w - 1, i0 + 1);
    const j1 = Math.min(h - 1, j0 + 1);
    const fu = u - i0;
    const fv = v - j0;
    const top = data[j0 * w + i0] * (1 - fu) + data[j0 * w + i1] * fu;
    const bottom = data[j1 * w + i0] * (1 - fu) + data[j1 * w + i1] * fu;
    return (top * (1 - fv) + bottom * fv - floorM) * exaggeration;
  };
}

/**
 * How much to stretch heights so a gentle landscape still reads as relief: the field's surroundings should rise by
 * about 4 % of the scene width, never less than ×1 or more than ×6.
 */
export function relief(heights: ArrayLike<number>, sideM: number): { floorM: number; exaggeration: number; rangeM: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    lo = Math.min(lo, heights[i]);
    hi = Math.max(hi, heights[i]);
  }
  const rangeM = Math.max(0, hi - lo);
  const exaggeration = rangeM < 0.5 ? 1 : Math.min(6, Math.max(1, (0.04 * sideM) / rangeM));
  return { floorM: Number.isFinite(lo) ? lo : 0, exaggeration, rangeM };
}
