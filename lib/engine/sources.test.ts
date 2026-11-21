import { describe, expect, it } from "vitest";
import { DEFAULT_PARCEL as P } from "./parcel";
import { computeDailyPlan, effectiveSource } from "./plan";
import { makeScenario, repeat } from "./synthetic";
import type { ParcelConfig, SoilState, WaterSource } from "./types";

const hot = makeScenario("2026-07-20", repeat(4, { et0: 8.5, sun: 1, tmax: 40 }));
const overcast = makeScenario("2026-07-20", repeat(4, { et0: 3, sun: 0, tmax: 25 }));
const dry: SoilState = { depletionMm: 80, source: "estimate" };
const withSource = (waterSource: WaterSource, over: Partial<ParcelConfig> = {}): ParcelConfig => ({ ...P, waterSource, ...over });

const SOURCES: WaterSource[] = ["solar_basin", "solar_direct", "grid", "diesel", "network"];

describe("every water source gets a real plan on a hot, dry day", () => {
  for (const src of SOURCES) {
    it(src, () => {
      const p = computeDailyPlan(withSource(src), hot, dry);
      expect(p.source).toBe(src);
      expect(p.decision).toBe("irrigate");
      expect(p.grossM3).toBeGreaterThan(60); // the old bug: non-solar farms got 0 m³ here
      expect(p.limitedBy).toBeUndefined();
      expect(p.irrigationWindows.length).toBeGreaterThan(0);
      const irrigated = p.hours.reduce((s, h) => s + h.irrigatedM3, 0);
      expect(irrigated).toBeCloseTo(p.grossM3, 0);
    });
  }
});

describe("solar + basin", () => {
  const p = computeDailyPlan(withSource("solar_basin"), hot, dry);
  it("pumps at solar peak and irrigates at dawn and dusk", () => {
    const on = p.hours.filter((h) => h.pumpOn).map((h) => h.hour);
    expect(Math.min(...on)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...on)).toBeLessThanOrEqual(17);
    expect(p.irrigationWindows.map((w) => w.start)).toEqual(["05:00", "19:00"]);
    expect(p.savings.waterPct).toBeGreaterThan(20);
  });
  it("a basin of 0 m³ behaves as direct pumping", () => {
    expect(effectiveSource(withSource("solar_basin", { basinCapacityM3: 0 }))).toBe("solar_direct");
  });
});

describe("solar direct (no basin)", () => {
  const p = computeDailyPlan(withSource("solar_direct"), hot, dry);
  it("irrigates while pumping, in the cooler morning block", () => {
    const on = p.hours.filter((h) => h.pumpOn).map((h) => h.hour);
    expect(on.length).toBeGreaterThan(0);
    expect(Math.max(...on)).toBeLessThanOrEqual(15);
    p.hours.forEach((h) => expect(h.irrigatedM3).toBeCloseTo(h.pumpedM3, 5));
    expect(p.irrigationWindows).toHaveLength(1);
    expect(p.irrigationWindows[0].start).toBe(p.pumpWindow?.start);
  });
  it("has no basin and still beats pumping every sunny hour", () => {
    expect(Math.max(...p.hours.map((h) => h.basinM3))).toBe(0);
    expect(p.savings.waterPct).toBeGreaterThan(20);
  });
});

describe("grid, diesel and network farms", () => {
  for (const src of ["grid", "diesel", "network"] as const) {
    it(`${src}: dawn and dusk windows, no pump or solar numbers`, () => {
      const p = computeDailyPlan(withSource(src), hot, dry);
      expect(p.irrigationWindows.map((w) => w.start)).toEqual(["05:00", "19:00"]);
      expect(p.pumpWindow).toBeNull();
      expect(p.optimized.pumpedM3).toBe(0);
      expect(p.baseline.pumpedM3).toBe(0);
      expect(p.savings.waterPct).toBe(0);
      expect(p.hours.every((h) => h.pvW === 0 && h.basinM3 === 0)).toBe(true);
    });
  }
});

describe("limits are reported, never silent", () => {
  it("a slow network limits the day", () => {
    const slow = withSource("network", { irrigation: { ...P.irrigation, flowM3h: 4 } });
    const p = computeDailyPlan(slow, hot, dry);
    expect(p.limitedBy).toBe("network");
    expect(p.grossM3).toBeCloseTo(32, 0); // 4 m³/h × 8 h
    expect(p.requestedM3).toBeGreaterThan(p.grossM3);
  });
  it("a small basin limits the day", () => {
    const p = computeDailyPlan(withSource("solar_basin", { basinCapacityM3: 30 }), hot, dry);
    expect(p.limitedBy).toBe("basin");
    expect(p.grossM3).toBeCloseTo(30, 0);
  });
  it("no sun means no pumping — irrigation is needed but cannot happen", () => {
    const p = computeDailyPlan(withSource("solar_basin"), overcast, dry);
    expect(p.decision).toBe("irrigate");
    expect(p.requestedM3).toBeGreaterThan(0);
    expect(p.grossM3).toBe(0);
    expect(p.limitedBy).toBe("pump");
    expect(p.pumpWindow).toBeNull();
  });
  it("a panel that is too small limits direct pumping", () => {
    const p = computeDailyPlan(withSource("solar_direct", { pv: { ...P.pv, kWp: 0.5 } }), hot, dry);
    expect(p.limitedBy).toBe("pump");
    expect(p.grossM3).toBeLessThan(p.requestedM3);
  });
});

describe("soil state", () => {
  it("a measured θ and the equivalent depletion give the same plan", () => {
    const a = computeDailyPlan(P, hot, { theta: 0.0, source: "sensor" }); // fully dry → clamps to TAW
    const b = computeDailyPlan(P, hot, { depletionMm: 88, source: "estimate" });
    expect(a.grossM3).toBe(b.grossM3);
    expect(a.decision).toBe(b.decision);
  });
  it("a wet root zone skips", () => {
    const p = computeDailyPlan(P, hot, { depletionMm: 0, source: "estimate" });
    expect(p.decision).toBe("skip");
    expect(p.grossM3).toBe(0);
  });
});
