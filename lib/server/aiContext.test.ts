import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import summer from "../../data/demo/weather-summer.json";
import { DEFAULT_PARCEL as P } from "../engine/parcel";
import { computeDailyPlan } from "../engine/plan";
import type { WeatherScenario } from "../engine/types";
import type { FarmStateDTO } from "../state-types";
import { farmContext } from "./aiContext";

const S = summer as unknown as WeatherScenario;
const plan = computeDailyPlan(P, S, { theta: 0.08, source: "simulated" }); // the heatwave day, dry soil: water is needed

const farm = {
  crop: "citrus",
  areaHa: 1,
  lat: 36.687,
  lon: 10.573,
  placeName: "Menzel Bouzelfa",
  waterSource: "solar_basin",
  irrigationMethod: "drip",
  soilTexture: "sandy_loam",
  plantingDate: null,
  basinM3: 80,
  pvKWp: 3,
  pumpHeadM: 15,
  wellSafeYieldM3h: 20,
};

const state = (over: Partial<FarmStateDTO> = {}): FarmStateDTO =>
  ({
    farm: {} as FarmStateDTO["farm"],
    tz: "Africa/Tunis",
    today: plan.date,
    localHour: 9,
    weather: { fetchedAt: "", source: "test" },
    depletionMm: 40,
    week: [{ plan, drStart: 40, drAfter: 0 }],
    daily: [],
    logsToday: [],
    lastCheck: null,
    ...over,
  }) as FarmStateDTO;

describe("farmContext: what the assistant knows that the Today screen no longer shows", () => {
  const text = farmContext(state(), farm);

  it("says why the plan is what it is", () => {
    expect(text).toMatch(/Why: .*(stress threshold|holds enough water|cover)/);
  });

  it("gives the times of the day, not only the amount", () => {
    expect(plan.irrigationWindows.length).toBeGreaterThan(0);
    expect(text).toContain(`Watering times: ${plan.irrigationWindows[0].start}–${plan.irrigationWindows[0].end}`);
    expect(text).toContain("Solar pump runs");
  });

  it("explains what the solar plan saves against pumping every sunny hour, and the kit", () => {
    expect(text).toContain("Solar plan against pumping every sunny hour");
    expect(text).toContain("It saves");
    expect(text).toContain("3 kWp solar panels, 80 m³ basin");
  });

  it("knows what the farmer already did today", () => {
    expect(text).toContain("has not logged any watering today yet");
    const done = farmContext(state({ logsToday: [{ id: 1, m3: 20 }, { id: 2, m3: 15 }], lastCheck: { date: "2026-07-21", feel: "dry" } }), farm);
    expect(done).toContain("logged 35 m³ watered today");
    expect(done).toContain("Last soil squeeze test (2026-07-21): crumbles, dusty (dry)");
  });

  it("leaves the equipment and savings out for a farm without solar", () => {
    const gridPlan = computeDailyPlan({ ...P, waterSource: "grid", basinCapacityM3: 0 }, S, { theta: 0.08, source: "simulated" });
    const grid = farmContext(state({ week: [{ plan: gridPlan, drStart: 40, drAfter: 0 }] }), { ...farm, waterSource: "grid", pvKWp: 0, basinM3: 0 });
    expect(grid).toContain("Watering times");
    expect(grid).not.toContain("kWp");
    expect(grid).not.toContain("Solar");
  });

  it("says the limit when the plan cannot apply what the crop needs", () => {
    const limited = { ...plan, limitedBy: "basin" as const, requestedM3: 120, grossM3: 80 };
    const t = farmContext(state({ week: [{ plan: limited, drStart: 40, drAfter: 0 }] }), farm);
    expect(t).toContain("needs 120 m³ today but only 80 m³ can be applied: limited by the basin (it holds 80 m³)");
  });

  it("stays the same short, private summary: no name, no e-mail, rounded location", () => {
    expect(text).toContain("about 36.7, 10.6");
    expect(text).not.toMatch(/@/);
  });
});
