import { describe, expect, it } from "vitest";
import { bboxOf, checkOutline, isSimplePolygon, localFrame, pointInRing, polygonAreaHa, polygonCentroid, polygonKey, sceneBox, scaleToArea, spanM, squareFromArea } from "./geo";
import type { LonLat, XY } from "./types";

const here: LonLat = [10.573, 36.687]; // a citrus block near Menzel Bouzelfa

describe("area and centre", () => {
  it("a square built from 1 ha measures 1 ha and is centred where asked", () => {
    const sq = squareFromArea(here, 1);
    expect(polygonAreaHa(sq)).toBeCloseTo(1, 3);
    const c = polygonCentroid(sq);
    expect(c[0]).toBeCloseTo(here[0], 6);
    expect(c[1]).toBeCloseTo(here[1], 6);
  });

  it("a 200 m × 50 m rectangle is 1 ha, whichever way round the corners go", () => {
    const f = localFrame(here);
    const rect = ([[0, 0], [200, 0], [200, 50], [0, 50]] as XY[]).map(f.toLonLat);
    expect(polygonAreaHa(rect)).toBeCloseTo(1, 3);
    expect(polygonAreaHa([...rect].reverse())).toBeCloseTo(1, 3);
  });

  it("the centroid of an L-shape is pulled toward the heavy arm, not the middle of its box", () => {
    const f = localFrame(here);
    const l = ([[0, 0], [100, 0], [100, 20], [20, 20], [20, 100], [0, 100]] as XY[]).map(f.toLonLat);
    const [cx, cy] = f.toXY(polygonCentroid(l));
    expect(cx).toBeLessThan(50);
    expect(cy).toBeLessThan(50);
    expect(cx).toBeGreaterThan(10);
  });

  it("scaleToArea makes the demo field exactly the wanted size", () => {
    const f = localFrame(here);
    const odd = ([[0, 0], [130, 10], [120, 95], [15, 80]] as XY[]).map(f.toLonLat);
    const scaled = scaleToArea(odd, 1);
    expect(polygonAreaHa(scaled)).toBeCloseTo(1, 4);
    const [a, b] = [polygonCentroid(odd), polygonCentroid(scaled)];
    expect(Math.hypot(...f.toXY(a)) - Math.hypot(...f.toXY(b))).toBeCloseTo(0, 1); // same place, just resized
  });
});

describe("point in polygon", () => {
  const ring: XY[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  it("separates inside from outside", () => {
    expect(pointInRing(5, 5, ring)).toBe(true);
    expect(pointInRing(11, 5, ring)).toBe(false);
    expect(pointInRing(-0.1, 5, ring)).toBe(false);
  });
  it("handles a concave outline", () => {
    const u: XY[] = [[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]];
    expect(pointInRing(5, 20, u)).toBe(true);
    expect(pointInRing(15, 20, u)).toBe(false); // the notch
    expect(pointInRing(25, 20, u)).toBe(true);
  });
});

describe("simple polygon check", () => {
  const f = localFrame(here);
  const poly = (pts: XY[]) => pts.map(f.toLonLat);
  it("accepts a normal field and an L-shape", () => {
    expect(isSimplePolygon(squareFromArea(here, 2))).toBe(true);
    expect(isSimplePolygon(poly([[0, 0], [100, 0], [100, 20], [20, 20], [20, 100], [0, 100]]))).toBe(true);
  });
  it("rejects a bow-tie", () => {
    expect(isSimplePolygon(poly([[0, 0], [100, 100], [100, 0], [0, 100]]))).toBe(false);
  });
  it("rejects a corner placed on top of another and a spike that folds back", () => {
    expect(isSimplePolygon(poly([[0, 0], [100, 0], [100, 0.1], [100, 100], [0, 100]]))).toBe(false);
    expect(isSimplePolygon(poly([[0, 0], [100, 0], [50, 0], [100, 100], [0, 100]]))).toBe(false);
  });
  it("rejects fewer than three corners", () => {
    expect(isSimplePolygon(poly([[0, 0], [100, 0]]))).toBe(false);
  });
});

describe("checkOutline (the rules the editor and the server share)", () => {
  const f = localFrame(here);
  const poly = (pts: XY[]) => pts.map(f.toLonLat);
  it("tells an unfinished outline from a finished one", () => {
    expect(checkOutline(null)).toBe("empty");
    expect(checkOutline([])).toBe("empty");
    expect(checkOutline(poly([[0, 0]]))).toBe("incomplete");
    expect(checkOutline(poly([[0, 0], [100, 0]]))).toBe("incomplete");
    expect(checkOutline(squareFromArea(here, 1))).toBe("ok");
  });
  it("refuses a crossing outline, a speck and a whole province", () => {
    expect(checkOutline(poly([[0, 0], [100, 100], [100, 0], [0, 100]]))).toBe("crosses");
    expect(checkOutline(poly([[0, 0], [10, 0], [10, 10], [0, 10]]))).toBe("size"); // 100 m² = 0.01 ha
    expect(checkOutline(poly([[0, 0], [5000, 0], [5000, 5000], [0, 5000]]))).toBe("size");
  });
  it("accepts the smallest and the largest allowed fields", () => {
    expect(checkOutline(squareFromArea(here, 0.06))).toBe("ok");
    expect(checkOutline(squareFromArea(here, 400))).toBe("ok"); // 2 km across, under the 3 km span limit
  });
  it("refuses more corners than a farmer could have tapped", () => {
    const ring = Array.from({ length: 90 }, (_, i) => f.toLonLat([100 * Math.cos((i / 90) * 2 * Math.PI), 100 * Math.sin((i / 90) * 2 * Math.PI)]));
    expect(checkOutline(ring)).toBe("crosses");
  });
});

describe("the scene around a field", () => {
  it("is at least 500 m so a small farm still shows its neighbours", () => {
    const { box, sideM } = sceneBox(squareFromArea(here, 1));
    expect(sideM).toBe(500);
    const f = localFrame([(box.west + box.east) / 2, (box.south + box.north) / 2]);
    const [w, h] = f.toXY([box.east, box.north]);
    expect(2 * w).toBeCloseTo(500, 0);
    expect(2 * h).toBeCloseTo(500, 0);
  });
  it("grows with the field and stops at 3 km", () => {
    expect(sceneBox(squareFromArea(here, 20)).sideM).toBeGreaterThan(900); // 20 ha is ~450 m across
    expect(sceneBox(squareFromArea(here, 500)).sideM).toBe(3000);
  });
  it("contains the whole field", () => {
    const poly = squareFromArea(here, 8);
    const { box } = sceneBox(poly);
    const b = bboxOf(poly);
    expect(box.west).toBeLessThan(b.west);
    expect(box.east).toBeGreaterThan(b.east);
    expect(box.south).toBeLessThan(b.south);
    expect(box.north).toBeGreaterThan(b.north);
  });
});

describe("misc", () => {
  it("polygonKey is stable under tiny float noise", () => {
    const a = squareFromArea(here, 1);
    const b = a.map(([x, y]) => [x + 1e-9, y - 1e-9] as LonLat);
    expect(polygonKey(a)).toBe(polygonKey(b));
  });
  it("spanM is the distance from the first corner to the furthest one (the diagonal of a 100 m square)", () => {
    expect(spanM(squareFromArea(here, 1))).toBeCloseTo(141.4, 0);
  });
});
