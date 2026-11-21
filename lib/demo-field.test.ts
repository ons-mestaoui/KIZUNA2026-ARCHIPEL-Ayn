import { describe, expect, it } from "vitest";
import { DEMO_CENTRE, DEMO_POLYGON } from "./demo-field";
import { checkOutline, polygonAreaHa, polygonCentroid } from "./field/geo";

describe("the demo field", () => {
  it("is a valid outline of one hectare, so the demo's engine numbers do not change", () => {
    expect(checkOutline(DEMO_POLYGON)).toBe("ok");
    expect(Math.round(polygonAreaHa(DEMO_POLYGON) * 100) / 100).toBe(1);
  });
  it("is centred where the farm row says it is", () => {
    const c = polygonCentroid(DEMO_POLYGON);
    expect(c[0]).toBeCloseTo(DEMO_CENTRE[0], 5);
    expect(c[1]).toBeCloseTo(DEMO_CENTRE[1], 5);
  });
  it("sits in Cap Bon, within 2 km of the weather point the demo already uses", () => {
    const [lon, lat] = DEMO_CENTRE;
    const km = Math.hypot((lon - 10.58) * 89.2, (lat - 36.68) * 111.2);
    expect(km).toBeLessThan(2);
  });
});
