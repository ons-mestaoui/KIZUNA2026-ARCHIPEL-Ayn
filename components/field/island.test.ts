import { describe, expect, it } from "vitest";
import { bodyPoint, buildFall, buildIslandBody, buildIslandTop, buildVines, fbm, floatingRocks, rimRadius, rimTrees, rockGeometry, waterfallPath } from "./island";

const shape = { cx: 20, cz: -30, R: 200, depth: 260 };
const flat = () => 0;
const hills = (x: number, z: number) => 6 * Math.sin(x / 40) + 4 * Math.cos(z / 30);

describe("the island", () => {
  it("has an organic rim that is never much smaller or larger than R", () => {
    for (let i = 0; i < 360; i++) {
      const r = rimRadius(200, (i / 360) * Math.PI * 2);
      expect(r).toBeGreaterThan(200 * 0.89);
      expect(r).toBeLessThan(200 * 1.11);
    }
  });

  it("top: stays inside its rim, follows the ground, and indexes the ground texture inside 0–1", () => {
    const g = buildIslandTop(shape, 800, hills, 20, 64);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      expect(Math.hypot(p.getX(i) - shape.cx, p.getZ(i) - shape.cz)).toBeLessThanOrEqual(200 * 1.11);
      expect(p.getY(i)).toBeCloseTo(hills(p.getX(i), p.getZ(i)), 4);
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(i)).toBeLessThanOrEqual(1);
    }
    // north (−z) is the top of the texture
    expect(uv.getY(0)).toBeCloseTo(1 - (shape.cz + 400) / 800, 5);
  });

  it("body: starts on the rim, hangs below it, ends well below, and stays finite", () => {
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * Math.PI * 2;
      const [x, y, z] = bodyPoint(shape, hills, a, 0);
      expect(Math.hypot(x - shape.cx, z - shape.cz)).toBeCloseTo(rimRadius(shape.R, a), 4);
      expect(y).toBeCloseTo(hills(x, z), 4);
    }
    const g = buildIslandBody(shape, flat, 12, 64);
    let lowest = 0;
    let widest = 0;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      lowest = Math.min(lowest, p.getY(i));
      widest = Math.max(widest, Math.hypot(p.getX(i) - shape.cx, p.getZ(i) - shape.cz));
      expect(p.getY(i)).toBeLessThanOrEqual(1e-6); // nothing above the (flat) rim
      expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
    }
    expect(lowest).toBeLessThan(-shape.depth * 0.8);
    expect(lowest).toBeGreaterThan(-shape.depth * 1.6);
    expect(widest).toBeLessThan(200 * 1.7);
    expect(g.attributes.normal).toBeDefined();
    expect(g.attributes.color.count).toBe(p.count);
  });

  it("body: its faces point out of the rock (the near wall must be drawn, not the inside of the far one)", () => {
    const g = buildIslandBody(shape, flat, 16, 64);
    const p = g.attributes.position;
    const n = g.attributes.normal;
    let outward = 0;
    let total = 0;
    for (let i = 0; i < p.count; i += 3) {
      const mx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3 - shape.cx;
      const mz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3 - shape.cz;
      if (Math.hypot(mx, mz) < 1) continue; // the tip: no outward direction
      if (Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) < 0.5) continue; // a facet squeezed to nothing (the lower rows share points)
      total++;
      if (n.getX(i) * mx + n.getZ(i) * mz > 0) outward++;
    }
    expect(total).toBeGreaterThan(300);
    expect(outward / total).toBeGreaterThan(0.95);
  });

  it("body: grass along the rim, moss and bare rock below (the colours differ by depth)", () => {
    const g = buildIslandBody(shape, flat, 16, 64);
    const p = g.attributes.position;
    const c = g.attributes.color;
    let top: number[] | null = null;
    let deep: number[] | null = null;
    for (let i = 0; i < p.count; i++) {
      if (!top && p.getY(i) > -3) top = [c.getX(i), c.getY(i), c.getZ(i)];
      if (p.getY(i) < -shape.depth * 0.9) deep = [c.getX(i), c.getY(i), c.getZ(i)];
    }
    expect(top).not.toBeNull();
    expect(deep).not.toBeNull();
    expect(top![1]).toBeGreaterThan(top![0]); // green dominates at the lip
    expect(deep![0] + deep![1] + deep![2]).toBeLessThan(top![0] + top![1] + top![2] + 0.3);
  });

  it("is the same island every time", () => {
    const a = buildIslandBody(shape, flat, 8, 32).attributes.position.array;
    const b = buildIslandBody(shape, flat, 8, 32).attributes.position.array;
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(fbm(1.5, 2.5, 3.5)).toBe(fbm(1.5, 2.5, 3.5));
  });

  it("vines hang from the rim and stay near the rock", () => {
    const g = buildVines(shape, flat, 10, 5);
    const p = g.attributes.position;
    expect(p.count).toBe(10 * 6 * 2);
    for (let i = 0; i < p.count; i++) {
      expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
      expect(p.getY(i)).toBeLessThanOrEqual(1e-6);
      expect(Math.hypot(p.getX(i) - shape.cx, p.getZ(i) - shape.cz)).toBeLessThan(200 * 1.6);
    }
  });

  it("waterfalls leave the rim, fall straight down and end far below", () => {
    const path = waterfallPath(shape, flat, 1.1);
    for (let i = 1; i < path.length; i++) expect(path[i].y).toBeLessThanOrEqual(path[i - 1].y + 1e-6);
    expect(path[0].y).toBeCloseTo(0, 4);
    expect(path[path.length - 1].y).toBeLessThan(-shape.depth * 1.2);
    const last = path[path.length - 1];
    const before = path[path.length - 3];
    expect(last.x).toBeCloseTo(before.x, 4); // the free fall is vertical
    expect(last.z).toBeCloseTo(before.z, 4);
    const fall = buildFall(path, 6, 10);
    expect(fall.attributes.uv.count).toBe(fall.attributes.position.count);
    expect(fall.index!.count).toBeGreaterThan(0);
  });

  it("trees stand along the outer edge, on the ground, and never inside the middle", () => {
    const trees = rimTrees(shape, hills, 16);
    expect(trees).toHaveLength(16);
    for (const t of trees) {
      const a = Math.atan2(t.z - shape.cz, t.x - shape.cx);
      expect(Math.hypot(t.x - shape.cx, t.z - shape.cz)).toBeGreaterThan(rimRadius(shape.R, a) * 0.88);
      expect(Math.hypot(t.x - shape.cx, t.z - shape.cz)).toBeLessThan(rimRadius(shape.R, a));
      expect(t.y).toBeCloseTo(hills(t.x, t.z), 4);
      expect(t.h).toBeGreaterThan(3);
    }
  });

  it("has rocks that hang below the rim and outside it, with sensible sizes", () => {
    const rocks = floatingRocks(shape, 8);
    expect(rocks).toHaveLength(8);
    for (const r of rocks) {
      expect(r.at[1]).toBeLessThan(0);
      expect(Math.hypot(r.at[0] - shape.cx, r.at[2] - shape.cz)).toBeGreaterThan(shape.R * 0.95);
      expect(r.radius).toBeGreaterThan(2);
      expect(r.radius).toBeLessThan(shape.R * 0.12);
    }
    const geo = rockGeometry(3);
    expect(geo.attributes.color.count).toBe(geo.attributes.position.count);
  });
});
