import { describe, expect, it } from "vitest";
import { localFrame, polygonAreaHa, sceneBox, squareFromArea } from "./geo";
import type { LonLat } from "./types";
import { OUTSIDE, buildZones, fieldCoverage, frameStats, zoneCountFor } from "./zones";

const here: LonLat = [10.573, 36.687];
const W = 100; // 500 m scene at 5 m pixels

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A scene whose greenness is `level(x, y)` (metres from the scene centre) plus a little noise. */
function scene(areaHa: number, level: (x: number, y: number) => number, noise = 0.012, seed = 1) {
  const polygon = squareFromArea(here, areaHa);
  const { box, sideM } = sceneBox(polygon);
  const r = rng(seed);
  const ndvi = new Float32Array(W * W);
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) {
      const x = ((i + 0.5) / W - 0.5) * sideM;
      const y = (0.5 - (j + 0.5) / W) * sideM;
      ndvi[j * W + i] = level(x, y) + (r() - 0.5) * 2 * noise;
    }
  }
  return { polygon, box, ndvi, coverage: fieldCoverage(polygon, box, W, W) };
}

const bands = (x: number) => (x < -33 ? 0.75 : x < 33 ? 0.6 : 0.45); // west → east, 200 m field: thirds

describe("zoneCountFor", () => {
  it("counts in 10 m source pixels: a hectare is about 100 of them", () => {
    expect(zoneCountFor(10)).toBe(1);
    expect(zoneCountFor(24)).toBe(1);
    expect(zoneCountFor(25)).toBe(2);
    expect(zoneCountFor(100)).toBe(3);
    expect(zoneCountFor(199)).toBe(3);
    expect(zoneCountFor(200)).toBe(4);
    expect(zoneCountFor(5000)).toBe(4);
  });
});

describe("fieldCoverage", () => {
  it("covers the field's own area and nothing else", () => {
    const { coverage, polygon } = scene(4, () => 0.5);
    const covered = coverage.reduce((s, v) => s + v, 0) * 25; // 25 m² per pixel
    expect(covered / 10_000).toBeCloseTo(polygonAreaHa(polygon), 1);
    expect(coverage[0]).toBe(0); // a corner of the scene is outside
  });
});

describe("buildZones", () => {
  it("finds the three bands of a field and names them from the north-west", () => {
    const s = scene(4, (x) => bands(x));
    const z = buildZones({ ...s, w: W, h: W });
    expect(z).not.toBeNull();
    expect(z!.list.map((l) => l.id)).toEqual(["A", "B", "C"]);
    const st = frameStats({ date: "2026-11-15", zoneMap: z!.map, zoneCount: 3, coverage: s.coverage, ndvi: s.ndvi, ndmi: new Float32Array(W * W).fill(NaN) });
    expect(st.zones[0].ndvi).toBeCloseTo(0.75, 1); // west
    expect(st.zones[1].ndvi).toBeCloseTo(0.6, 1);
    expect(st.zones[2].ndvi).toBeCloseTo(0.45, 1); // east
  });

  it("zone areas add up to the field's area", () => {
    const s = scene(4, (x) => bands(x));
    const z = buildZones({ ...s, w: W, h: W })!;
    const sum = z.list.reduce((t, l) => t + l.areaHa, 0);
    expect(sum).toBeCloseTo(polygonAreaHa(s.polygon), 2);
    z.list.forEach((l) => expect(l.areaHa).toBeGreaterThan(0.8)); // roughly a third each
  });

  it("letters follow position, not greenness: mirror the bands and A is still the western zone", () => {
    const s = scene(4, (x) => bands(-x));
    const z = buildZones({ ...s, w: W, h: W })!;
    const st = frameStats({ date: "d", zoneMap: z.map, zoneCount: 3, coverage: s.coverage, ndvi: s.ndvi, ndmi: new Float32Array(W * W).fill(NaN) });
    expect(st.zones[0].ndvi).toBeCloseTo(0.45, 1);
    expect(st.zones[2].ndvi).toBeCloseTo(0.75, 1);
  });

  it("puts the zone centroids where the zones are", () => {
    const s = scene(4, (x) => bands(x));
    const z = buildZones({ ...s, w: W, h: W })!;
    const f = localFrame([(s.box.west + s.box.east) / 2, (s.box.south + s.box.north) / 2]);
    const xs = z.list.map((l) => f.toXY(l.centroid)[0]);
    expect(xs[0]).toBeLessThan(-40);
    expect(Math.abs(xs[1])).toBeLessThan(10);
    expect(xs[2]).toBeGreaterThan(40);
  });

  it("does not split an even field into noise", () => {
    expect(buildZones({ ...scene(4, () => 0.62, 0.015), w: W, h: W })).toBeNull();
  });

  it("does not split a field too small to have zones (0.2 ha is 20 source pixels)", () => {
    expect(buildZones({ ...scene(0.2, (x) => (x < 0 ? 0.7 : 0.4)), w: W, h: W })).toBeNull();
  });

  it("uses fewer zones when the data only supports two levels", () => {
    const s = scene(1, (x) => (x < 0 ? 0.72 : 0.5));
    const z = buildZones({ ...s, w: W, h: W })!;
    expect(z.list).toHaveLength(2);
  });

  it("removes single-pixel speckle so zones are patches, not confetti", () => {
    const base = scene(4, (x) => (x < 0 ? 0.72 : 0.5), 0.01, 3);
    const r = rng(9);
    for (let p = 0; p < base.ndvi.length; p++) if (base.coverage[p] >= 0.5 && r() < 0.06) base.ndvi[p] = base.ndvi[p] < 0.6 ? 0.72 : 0.5; // flip 6 %
    const z = buildZones({ ...base, w: W, h: W })!;
    expect(z.list).toHaveLength(2);
    // every row of the field crosses from one zone to the other once at most
    for (let j = 0; j < W; j++) {
      let changes = 0;
      let prev = OUTSIDE;
      for (let i = 0; i < W; i++) {
        const v = z.map[j * W + i];
        if (v === OUTSIDE) continue;
        if (prev !== OUTSIDE && v !== prev) changes++;
        prev = v;
      }
      expect(changes).toBeLessThanOrEqual(1);
    }
  });

  it("fills a cloud hole with the surrounding zone so the whole field is covered", () => {
    const s = scene(4, (x) => bands(x));
    for (let j = 40; j < 50; j++) for (let i = 48; i < 58; i++) s.ndvi[j * W + i] = NaN; // a cloud over the middle of the field
    const z = buildZones({ ...s, w: W, h: W })!;
    for (let p = 0; p < W * W; p++) if (s.coverage[p] >= 0.5) expect(z.map[p]).not.toBe(OUTSIDE);
  });

  it("gives up when too little of the field is clear", () => {
    const s = scene(4, (x) => bands(x));
    for (let p = 0; p < s.ndvi.length; p++) if (p % 20 !== 0) s.ndvi[p] = NaN;
    expect(buildZones({ ...s, w: W, h: W })).toBeNull();
  });

  it("is deterministic", () => {
    const a = buildZones({ ...scene(4, (x) => bands(x)), w: W, h: W })!;
    const b = buildZones({ ...scene(4, (x) => bands(x)), w: W, h: W })!;
    expect(Array.from(a.map)).toEqual(Array.from(b.map));
  });
});

describe("frameStats", () => {
  it("averages only the pixels with a reading and reports how many were clear", () => {
    const s = scene(4, (x) => bands(x), 0);
    const z = buildZones({ ...s, w: W, h: W })!;
    const ndmi = new Float32Array(W * W).fill(0.2);
    for (let p = 0; p < W * W; p++) if (p % 2 === 0) ndmi[p] = NaN; // half the NDMI pixels missing
    const st = frameStats({ date: "d", zoneMap: z.map, zoneCount: 3, coverage: s.coverage, ndvi: s.ndvi, ndmi });
    expect(st.field.ndmi).toBeCloseTo(0.2, 3);
    expect(st.field.clear).toBeCloseTo(1, 3); // NDVI was complete
    expect(st.field.ndvi).toBeCloseTo((0.75 + 0.6 + 0.45) / 3, 1);
  });

  it("without zones it still gives the field's reading", () => {
    const s = scene(0.2, () => 0.5, 0);
    const st = frameStats({ date: "d", zoneMap: null, zoneCount: 0, coverage: s.coverage, ndvi: s.ndvi, ndmi: s.ndvi });
    expect(st.zones).toEqual([]);
    expect(st.field.ndvi).toBeCloseTo(0.5, 3);
  });

  it("a fully clouded frame reports no values and zero clear", () => {
    const s = scene(4, (x) => bands(x));
    const nan = new Float32Array(W * W).fill(NaN);
    const z = buildZones({ ...s, w: W, h: W })!;
    const st = frameStats({ date: "d", zoneMap: z.map, zoneCount: 3, coverage: s.coverage, ndvi: nan, ndmi: nan });
    expect(st.field).toEqual({ ndvi: null, ndmi: null, clear: 0 });
    expect(st.zones.every((q) => q.ndvi === null && q.clear === 0)).toBe(true);
  });
});
