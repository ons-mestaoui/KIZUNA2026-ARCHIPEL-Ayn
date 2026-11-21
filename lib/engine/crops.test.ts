import { describe, expect, it } from "vitest";
import { CROPS, CROP_IDS, cycleDays, kcOn } from "./crops";
import { defaultsFor, EFFICIENCY, parcelFromFarm } from "./farmParcel";
import { SOILS, SOIL_TEXTURES } from "./soils";
import { totalAvailableWater } from "./waterBalance";

describe("crop coefficients", () => {
  it("tomato follows the FAO-56 stages from the planting date", () => {
    const planted = "2026-03-01";
    expect(kcOn("2026-03-10", "tomato", { plantingDate: planted })).toBe(0.6); // initial
    expect(kcOn("2026-04-20", "tomato", { plantingDate: planted })).toBeCloseTo(0.6 + (50 - 30) / 40 * (1.15 - 0.6), 2); // development
    expect(kcOn("2026-05-15", "tomato", { plantingDate: planted })).toBe(1.15); // mid-season (day 75)
    expect(kcOn("2026-07-20", "tomato", { plantingDate: planted })).toBeCloseTo(0.847, 3); // day 141: late stage, still easing down
    expect(kcOn("2026-08-20", "tomato", { plantingDate: planted })).toBe(0.8); // day 172: past the 145-day cycle → end value
  });

  it("every annual has stage lengths, no perennial needs them", () => {
    for (const id of CROP_IDS) {
      const c = CROPS[id];
      expect(Boolean(c.stageDays)).toBe(c.annual && !c.seasonalKc);
    }
    expect(cycleDays("tomato")).toBe(145);
    expect(cycleDays("citrus")).toBeUndefined();
  });

  it("grapevine follows a monthly curve", () => {
    expect(kcOn("2026-01-15", "grape")).toBe(0.2);
    expect(kcOn("2026-07-15", "grape")).toBe(0.7);
  });

  it("evergreen trees use a constant mid-season Kc by default", () => {
    expect(kcOn("2026-02-01", "citrus")).toBe(0.65);
    expect(kcOn("2026-08-01", "citrus")).toBe(0.65);
    expect(kcOn("2026-08-01", "datePalm")).toBe(0.95);
  });
});

describe("soils", () => {
  it("available water rises from sand to clay loam", () => {
    const taw = (t: (typeof SOIL_TEXTURES)[number]) => (SOILS[t].fieldCapacity - SOILS[t].wiltingPoint) * 1000;
    expect(taw("sand")).toBeLessThan(taw("sandy_loam"));
    expect(taw("sandy_loam")).toBeLessThan(taw("loam"));
    for (const t of SOIL_TEXTURES) {
      expect(SOILS[t].wiltingPoint).toBeLessThan(SOILS[t].fieldCapacity);
      expect(SOILS[t].fieldCapacity).toBeLessThan(SOILS[t].saturation);
    }
  });
});

describe("farm → engine parcel", () => {
  const farm = {
    name: "Test",
    crop: "olive" as const,
    areaHa: 2,
    soilTexture: "loam" as const,
    irrigationMethod: "sprinkler" as const,
    waterSource: "solar_basin" as const,
    ...defaultsFor(2),
  };
  it("derives efficiency, flow, basin and panel from the answers", () => {
    const p = parcelFromFarm(farm);
    expect(p.irrigation.efficiency).toBe(EFFICIENCY.sprinkler);
    expect(p.irrigation.flowM3h).toBe(40);
    expect(p.basinCapacityM3).toBe(120);
    expect(p.pv.kWp).toBe(6);
    expect(totalAvailableWater(p.soil, CROPS.olive.rootDepthM)).toBeCloseTo(150, 0);
  });
  it("drops basin and panels for farms that don't have them", () => {
    const p = parcelFromFarm({ ...farm, waterSource: "diesel" });
    expect(p.basinCapacityM3).toBe(0);
    expect(p.pv.kWp).toBe(0);
  });
});
