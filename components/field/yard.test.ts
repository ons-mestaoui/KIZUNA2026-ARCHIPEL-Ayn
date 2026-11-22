import { describe, expect, it } from "vitest";
import { DEMO_POLYGON } from "@/lib/demo-field";
import { sceneBox } from "@/lib/field/geo";
import type { FieldDTO } from "@/lib/field/types";
import { sceneProjector } from "./derive";
import type { XZ } from "./geometry";
import { PAD, PAD_M, YARD, insideRing, lateralLines, placeYard } from "./yard";

const demoRing = (): { ring: XZ[]; sideM: number } => {
  const { box, sideM } = sceneBox(DEMO_POLYGON);
  const f = { box, polygon: DEMO_POLYGON } as unknown as FieldDTO;
  return { ring: DEMO_POLYGON.map(sceneProjector(f)), sideM };
};
const square = (half: number): XZ[] => [[-half, -half], [half, -half], [half, half], [-half, half]];

describe("the equipment pad", () => {
  it("stands beside the field, not on it, and inside the scene", () => {
    const { ring, sideM } = demoRing();
    const spot = placeYard(ring, sideM)!;
    expect(spot).not.toBeNull();
    const [x, z] = spot.at;
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
      const corner: XZ = [x + (dx * PAD_M.w) / 2, z + (dz * PAD_M.d) / 2];
      expect(insideRing(corner, ring)).toBe(false);
      expect(Math.abs(corner[0])).toBeLessThanOrEqual(sideM / 2);
      expect(Math.abs(corner[1])).toBeLessThanOrEqual(sideM / 2);
    }
  });
  it("goes to the east side first, then the west, and gives up when there is no room", () => {
    const first = placeYard(square(50), 500)!;
    expect(first.side).toBe(1);
    expect(first.at[0]).toBeGreaterThan(50);
    // a field so far east that the east side is outside the scene: the west side is used, mirrored
    const east: XZ[] = square(40).map(([x, z]) => [x + 150, z]);
    const west = placeYard(east, 500)!;
    expect(west.side).toBe(-1);
    expect(west.at[0]).toBeLessThan(110);
    // a big field, or one that fills the scene: no yard
    expect(placeYard(square(250), 1500)).toBeNull();
    expect(PAD_M.w).toBeGreaterThan(PAD.w);
    expect(placeYard(square(120), 300)).toBeNull();
  });
  it("keeps every piece of equipment on the pad", () => {
    const edge = (v: number, half: number) => expect(Math.abs(v)).toBeLessThanOrEqual(half);
    for (const z of YARD.pv.rows) edge(z, PAD.d / 2);
    edge(YARD.pv.x - (YARD.pv.perRow * (YARD.pv.panelW + 0.2)) / 2, PAD.w / 2);
    edge(YARD.pump.x + YARD.pump.w / 2, PAD.w / 2);
    edge(YARD.pump.z + YARD.pump.d / 2, PAD.d / 2);
    edge(YARD.basin.x - YARD.basin.w / 2, PAD.w / 2);
    edge(YARD.basin.z + YARD.basin.d / 2, PAD.d / 2);
    edge(YARD.well.z, PAD.d / 2);
    // and nothing overlaps the basin
    expect(YARD.pump.x - YARD.pump.w / 2).toBeGreaterThan(YARD.basin.x + YARD.basin.w / 2);
  });
});

describe("drip lines", () => {
  it("run inside the outline, evenly spaced, parallel to the long side", () => {
    const ring: XZ[] = [[-60, -25], [60, -25], [60, 25], [-60, 25]]; // 120 × 50 m
    const { lines, header } = lateralLines(ring, [90, 0], 10);
    expect(lines.length).toBe(5);
    for (const [a, b] of lines) {
      expect(insideRing([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ring)).toBe(true);
      expect(Math.abs(a[1] - b[1])).toBeLessThan(0.01); // parallel to x
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThan(110);
    }
    const zs = lines.map(([a]) => a[1]).sort((p, q) => p - q);
    zs.slice(1).forEach((v, i) => expect(v - zs[i]).toBeCloseTo(10, 5));
    expect(header).toHaveLength(5);
  });
  it("start at the end nearest the pad, so the header runs along that side", () => {
    const ring: XZ[] = [[-60, -25], [60, -25], [60, 25], [-60, 25]];
    const east = lateralLines(ring, [100, 0]);
    expect(east.lines.every(([a]) => a[0] > 50)).toBe(true);
    const west = lateralLines(ring, [-100, 0]);
    expect(west.lines.every(([a]) => a[0] < -50)).toBe(true);
  });
  it("follow the real demo field, whatever way it is turned", () => {
    const { ring } = demoRing();
    const { lines } = lateralLines(ring, [100, 0]);
    expect(lines.length).toBeGreaterThanOrEqual(6);
    for (const [a, b] of lines) {
      for (const k of [0, 0.5, 1]) expect(insideRing([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], ring) || k !== 0.5).toBe(true);
    }
  });
  it("use the same end for every line, even when the pad is level with the middle of a long side", () => {
    const ring: XZ[] = [[-25, -60], [25, -60], [25, 60], [-25, 60]]; // long side north-south, pad to the east
    const { lines } = lateralLines(ring, [80, 0], 10);
    const ends = new Set(lines.map(([a]) => Math.sign(a[1])));
    expect(ends.size).toBe(1);
  });
  it("handles a concave outline: a line can be cut into two pieces", () => {
    const u: XZ[] = [[-40, -30], [40, -30], [40, 30], [10, 30], [10, -5], [-10, -5], [-10, 30], [-40, 30]]; // a U shape
    const { lines } = lateralLines(u, [100, 0], 12);
    for (const [a, b] of lines) expect(insideRing([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], u)).toBe(true);
  });
});
