import { describe, expect, it } from "vitest";
import { farmInputSchema } from "./farm-schema";
import { squareFromArea } from "./field/geo";

const base = {
  name: "Test farm",
  lat: 36.687,
  lon: 10.573,
  placeName: null,
  crop: "citrus",
  plantingDate: null,
  areaHa: 1,
  soilTexture: "sandy_loam",
  irrigationMethod: "drip",
  waterSource: "solar_basin",
  basinM3: 80,
  pvKWp: 3,
  pumpHeadM: 15,
  wellSafeYieldM3h: 20,
  lastIrrigated: "3-5d",
  lang: "en",
};

describe("farm payload with an outline", () => {
  it("accepts no outline, a null outline and a good outline", () => {
    expect(farmInputSchema.safeParse(base).success).toBe(true);
    expect(farmInputSchema.safeParse({ ...base, polygon: null }).success).toBe(true);
    expect(farmInputSchema.safeParse({ ...base, polygon: squareFromArea([10.573, 36.687], 1) }).success).toBe(true);
  });

  it("refuses an outline that crosses itself", () => {
    const [a, b, c, d] = squareFromArea([10.573, 36.687], 1);
    const r = farmInputSchema.safeParse({ ...base, polygon: [a, c, b, d] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("crosses");
  });

  it("refuses too few corners, too many corners and impossible coordinates", () => {
    const sq = squareFromArea([10.573, 36.687], 1);
    expect(farmInputSchema.safeParse({ ...base, polygon: sq.slice(0, 2) }).success).toBe(false);
    expect(farmInputSchema.safeParse({ ...base, polygon: Array.from({ length: 81 }, (_, i) => [10.573 + i * 1e-5, 36.687 + (i % 2) * 1e-5]) }).success).toBe(false);
    expect(farmInputSchema.safeParse({ ...base, polygon: [[200, 36], [10, 36], [10, 37]] }).success).toBe(false);
  });

  it("refuses an outline that is a speck or a province", () => {
    expect(farmInputSchema.safeParse({ ...base, polygon: squareFromArea([10.573, 36.687], 0.01) }).success).toBe(false);
    expect(farmInputSchema.safeParse({ ...base, polygon: squareFromArea([10.573, 36.687], 900) }).success).toBe(false);
  });
});
