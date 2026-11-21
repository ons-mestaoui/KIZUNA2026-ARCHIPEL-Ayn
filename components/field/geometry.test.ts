import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildSkirt, buildTerrain, buildWall, densify, heightSampler, relief, type XZ } from "./geometry";

const flat = () => 0;
const square: XZ[] = [[-50, -50], [50, -50], [50, 50], [-50, 50]]; // a 100 m field

describe("terrain", () => {
  it("is a square of the right size lying flat, north edge at −z", () => {
    const g = buildTerrain(500, 8, flat);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.x).toBeCloseTo(-250);
    expect(g.boundingBox!.max.x).toBeCloseTo(250);
    expect(g.boundingBox!.min.z).toBeCloseTo(-250);
    expect(g.boundingBox!.max.z).toBeCloseTo(250);
    expect(g.boundingBox!.max.y).toBe(0);
  });
  it("puts the top of the texture on the north edge", () => {
    const g = buildTerrain(500, 4, flat);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) if (uv.getY(i) === 1) expect(pos.getZ(i)).toBeCloseTo(-250); // v = 1 is the north edge
    for (let i = 0; i < pos.count; i++) if (uv.getY(i) === 0) expect(pos.getZ(i)).toBeCloseTo(250);
    for (let i = 0; i < pos.count; i++) if (uv.getX(i) === 0) expect(pos.getX(i)).toBeCloseTo(-250); // u = 0 is the west edge
  });
  it("follows the height function", () => {
    const g = buildTerrain(100, 10, (x) => x * 0.1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeCloseTo(pos.getX(i) * 0.1, 5);
  });
});

describe("densify", () => {
  it("keeps every point no further than the step and closes the loop", () => {
    const pts = densify(square, 3);
    expect(pts[0]).toEqual(pts.at(-1));
    for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])).toBeLessThanOrEqual(3.0001);
    expect(pts.length).toBeGreaterThan(130); // 400 m of edge at 3 m
  });
});

describe("wall", () => {
  const wall = buildWall(square, flat, 12, [0.89, 0.64, 0.1]);
  it("hugs the ground and rises to the wall height", () => {
    wall.computeBoundingBox();
    expect(wall.boundingBox!.min.y).toBeCloseTo(0.05, 5);
    expect(wall.boundingBox!.max.y).toBeCloseTo(12, 5);
    expect(wall.boundingBox!.max.x).toBeCloseTo(50, 5);
  });
  it("is opaque at the base and fades to nothing at the top (alpha in the vertex colours)", () => {
    const col = wall.attributes.color as THREE.BufferAttribute;
    expect(col.itemSize).toBe(4);
    expect(col.getW(0)).toBe(1); // base row
    expect(col.getW(1)).toBeCloseTo(0.92);
    expect(col.getW(2)).toBe(0); // top row
  });
  it("rides on the terrain", () => {
    const hilly = buildWall(square, (x) => 10 + x * 0.1, 12, [1, 1, 1]);
    const pos = hilly.attributes.position as THREE.BufferAttribute;
    expect(pos.getY(0)).toBeCloseTo(10 + -50 * 0.1 + 0.05, 5); // first point sits at x = −50
  });
  it("is one closed strip: every index refers to a real vertex", () => {
    const idx = wall.index!;
    const n = (wall.attributes.position as THREE.BufferAttribute).count;
    for (let i = 0; i < idx.count; i++) expect(idx.getX(i)).toBeLessThan(n);
  });
});

describe("skirt", () => {
  const strata = [{ to: 0.28, color: "#d2ae73" }, { to: 0.7, color: "#8a6a45" }, { to: 1, color: "#5c8796" }];
  const skirt = buildSkirt(500, 16, flat, 50, strata);
  it("goes down to the slab depth on all four sides", () => {
    skirt.computeBoundingBox();
    expect(skirt.boundingBox!.min.y).toBeCloseTo(-50);
    expect(skirt.boundingBox!.max.y).toBeCloseTo(0);
    expect(skirt.boundingBox!.min.x).toBeCloseTo(-250);
    expect(skirt.boundingBox!.max.z).toBeCloseTo(250);
  });
  it("has one coloured band per stratum with hard edges", () => {
    const col = skirt.attributes.color as THREE.BufferAttribute;
    const seen = new Set<string>();
    for (let i = 0; i < col.count; i++) seen.add([col.getX(i), col.getY(i), col.getZ(i)].map((v) => v.toFixed(3)).join());
    expect(seen.size).toBe(3);
  });
  it("starts at the terrain edge, wherever the ground is", () => {
    const hilly = buildSkirt(100, 4, (x) => 5 + x * 0.1, 20, strata);
    const pos = hilly.attributes.position as THREE.BufferAttribute;
    expect(pos.getY(0)).toBeCloseTo(5 + -50 * 0.1, 5); // north side, west corner
  });
});

describe("heights and relief", () => {
  // 3 × 3 grid: a ramp rising 10 m from west to east
  const grid = { w: 3, h: 3, data: [100, 105, 110, 100, 105, 110, 100, 105, 110] };
  it("reads heights at scene positions, blending between samples", () => {
    const at = heightSampler(grid, 200, 1, 100);
    expect(at(-100, 0)).toBeCloseTo(0); // west edge
    expect(at(100, 0)).toBeCloseTo(10); // east edge
    expect(at(0, 0)).toBeCloseTo(5);
    expect(at(50, 0)).toBeCloseTo(7.5); // a quarter of the way from the middle: blended
    expect(at(-999, 0)).toBeCloseTo(0); // outside the scene it holds the edge value
  });
  it("applies the exaggeration after removing the floor", () => {
    expect(heightSampler(grid, 200, 3, 100)(100, 0)).toBeCloseTo(30);
  });
  it("stretches gentle ground so it reads, but never more than ×6, and leaves flat ground alone", () => {
    expect(relief([100, 110], 500).exaggeration).toBeCloseTo(2); // 10 m of rise in a 500 m scene → ×2
    expect(relief([100, 101], 500).exaggeration).toBe(6); // almost flat: capped
    expect(relief([100, 100.2], 500).exaggeration).toBe(1); // a billiard table
    expect(relief([100, 300], 500).exaggeration).toBe(1); // already steep
    expect(relief([100, 110], 500).floorM).toBe(100);
    expect(relief([], 500).floorM).toBe(0);
  });
});
