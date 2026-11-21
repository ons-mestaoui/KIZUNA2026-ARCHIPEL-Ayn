import { describe, expect, it } from "vitest";
import summer from "../../data/demo/weather-summer.json";
import live from "../../data/demo/weather-live.json";
import { DEFAULT_PARCEL as P } from "./parcel";
import { computeDailyPlan } from "./plan";
import { pumpFlowM3h, pvPowerW } from "./solarPump";
import type { WeatherScenario } from "./types";
import { depletionFromTheta, totalAvailableWater } from "./waterBalance";

const S = summer as unknown as WeatherScenario;
const L = live as unknown as WeatherScenario;

describe("physics (hand-checked)", () => {
  it("pump flow Q = P·η/(ρgH)", () => {
    // 2400 W · 0.45 / (1000 · 9.81 · 15) · 3600 = 26.42 m³/h
    expect(pumpFlowM3h(2400, P.pump)).toBeCloseTo(26.42, 1);
    expect(pumpFlowM3h(300, P.pump)).toBe(0); // below start threshold
  });
  it("PV power with temperature derate", () => {
    // 1000 W/m², 25 °C air → Tcell 56.25 → derate 0.875 → 3000·0.8·0.875 = 2100 W
    expect(pvPowerW(1000, 25, P.pv)).toBeCloseTo(2100, 0);
  });
  it("TAW / depletion for citrus on sandy loam", () => {
    expect(totalAvailableWater(P.soil, 0.8)).toBeCloseTo(88, 5);
    expect(depletionFromTheta(0.2, P.soil, 0.8)).toBe(0);
    expect(depletionFromTheta(0.0, P.soil, 0.8)).toBeCloseTo(88, 5); // clamped to TAW
  });
});

describe("heatwave day 2026-07-21", () => {
  const dry = computeDailyPlan(P, S, { theta: 0.08, source: "simulated" });
  const wet = computeDailyPlan(P, S, { theta: 0.2, source: "sensor" });

  it("dry soil → irrigate with an engine-derived volume that fits the basin", () => {
    expect(dry.et0Day).toBeGreaterThan(7.5);
    expect(dry.decision).toBe("irrigate");
    expect(dry.grossM3).toBeGreaterThan(40);
    expect(dry.grossM3).toBeLessThanOrEqual(P.basinCapacityM3);
    expect(dry.stress).toBe("severe");
  });
  it("water is conserved: pumped = irrigated = gross", () => {
    const pumped = dry.hours.reduce((s, h) => s + h.pumpedM3, 0);
    const irrigated = dry.hours.reduce((s, h) => s + h.irrigatedM3, 0);
    expect(pumped).toBeCloseTo(dry.grossM3, 0);
    expect(irrigated).toBeCloseTo(dry.grossM3, 0);
    expect(Math.max(...dry.hours.map((h) => h.basinM3))).toBeLessThanOrEqual(P.basinCapacityM3);
  });
  it("pump at solar peak, irrigate at dawn/dusk", () => {
    const pumpHours = dry.hours.filter((h) => h.pumpOn).map((h) => h.hour);
    expect(Math.min(...pumpHours)).toBeGreaterThanOrEqual(8);
    expect(Math.max(...pumpHours)).toBeLessThanOrEqual(17);
    expect(dry.irrigationWindows[0].start).toBe("05:00");
    expect(dry.irrigationWindows[1].start).toBe("19:00");
    expect(dry.optimized.starts).toBe(1);
    expect(dry.optimized.overYieldHours).toBe(0);
  });
  it("beats the 'pump every sunny hour' habit", () => {
    expect(dry.baseline.pumpedM3).toBeGreaterThan(dry.optimized.pumpedM3);
    expect(dry.savings.waterPct).toBeGreaterThan(20);
  });
  it("wet soil (sensor at field capacity) → skip, pump stays off", () => {
    expect(wet.decision).toBe("skip");
    expect(wet.reason).toBe("soil_ok");
    expect(wet.optimized.pumpedM3).toBe(0);
    expect(wet.savings.waterPct).toBe(100);
  });
  it("volume falls monotonically as the soil gets wetter (pour-water beat)", () => {
    const vols = [0.06, 0.09, 0.12, 0.15, 0.18].map((theta) => computeDailyPlan(P, S, { theta, source: "sensor" }).grossM3);
    for (let i = 1; i < vols.length; i++) expect(vols[i]).toBeLessThanOrEqual(vols[i - 1]);
    // and it actually responds before the flip (not stuck at a cap)
    expect(computeDailyPlan(P, S, { theta: 0.14, source: "sensor" }).grossM3).toBeLessThan(dry.grossM3 - 10);
  });
});

describe("live November forecast", () => {
  it("low ET₀ → small or no irrigation", () => {
    const p = computeDailyPlan(P, L, { theta: 0.14, source: "simulated" });
    expect(p.et0Day).toBeLessThan(4);
    expect(p.grossM3).toBeLessThan(30);
  });
});
