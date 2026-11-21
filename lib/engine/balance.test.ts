import { describe, expect, it } from "vitest";
import { estimateDepletion, FEEL_DEPLETION, type BalanceInput } from "./balance";
import { CROPS } from "./crops";
import { DEFAULT_PARCEL as P } from "./parcel";
import { computeDailyPlan } from "./plan";
import { makeScenario, repeat } from "./synthetic";
import { planWeek } from "./week";
import { totalAvailableWater } from "./waterBalance";

const TAW = totalAvailableWater(P.soil, CROPS[P.crop].rootDepthM); // 88 mm
const ETC = 0.65 * 8.5; // citrus mid-season on a hot day ≈ 5.5 mm

const base = (over: Partial<BalanceInput> = {}): BalanceInput => ({
  today: "2026-07-15",
  anchor: { date: "2026-07-10", lastIrrigated: "today" },
  irrigations: [],
  checks: [],
  ...over,
});
const hot20 = makeScenario("2026-07-01", repeat(20, { et0: 8.5 }), 14);

describe("running water balance (no sensor)", () => {
  it("grows by ETc each day after an irrigation", () => {
    const r = estimateDepletion(P, hot20, base());
    // anchored 'irrigated today' on 10 Jul → 5 days of ETc by the morning of 15 Jul
    expect(r.depletionMm).toBeGreaterThan(4.5 * ETC);
    expect(r.depletionMm).toBeLessThan(5.5 * ETC);
    expect(r.days).toHaveLength(5);
  });

  it("rain lowers it (80% of a big shower counts)", () => {
    const wet = makeScenario("2026-07-01", [...repeat(11, { et0: 8.5 }), { et0: 8.5, rain: 20 }, ...repeat(8, { et0: 8.5 })], 14);
    const dry = estimateDepletion(P, hot20, base()).depletionMm;
    const rained = estimateDepletion(P, wet, base()).depletionMm;
    expect(dry - rained).toBeCloseTo(16, 0);
  });

  it("small showers (≤ 2 mm) do not count", () => {
    const drizzle = makeScenario("2026-07-01", [...repeat(11, { et0: 8.5 }), { et0: 8.5, rain: 1.5 }, ...repeat(8, { et0: 8.5 })], 14);
    expect(estimateDepletion(P, drizzle, base()).depletionMm).toBeCloseTo(estimateDepletion(P, hot20, base()).depletionMm, 5);
  });

  it("a logged irrigation lowers it by gross × efficiency", () => {
    const none = estimateDepletion(P, hot20, base()).depletionMm;
    const logged = estimateDepletion(P, hot20, base({ irrigations: [{ date: "2026-07-13", m3: 50 }] })).depletionMm;
    expect(none - logged).toBeCloseTo((50 * 0.9) / 10, 1); // 4.5 mm
  });

  it("water already applied today counts toward today's morning state", () => {
    const none = estimateDepletion(P, hot20, base()).depletionMm;
    const today = estimateDepletion(P, hot20, base({ irrigations: [{ date: "2026-07-15", m3: 40 }] })).depletionMm;
    expect(none - today).toBeCloseTo(3.6, 1);
  });

  it("a squeeze test re-anchors the estimate", () => {
    const dry = estimateDepletion(P, hot20, base({ checks: [{ date: "2026-07-14", feel: "dry" }] }));
    expect(dry.depletionMm).toBeCloseTo(Math.min(TAW, FEEL_DEPLETION.dry * TAW + ETC), 0);
    const wet = estimateDepletion(P, hot20, base({ checks: [{ date: "2026-07-14", feel: "wet" }] }));
    expect(wet.depletionMm).toBeCloseTo(ETC, 0);
    const today = estimateDepletion(P, hot20, base({ checks: [{ date: "2026-07-15", feel: "moist" }] }));
    expect(today.depletionMm).toBeCloseTo(FEEL_DEPLETION.moist * TAW, 1); // a check this morning wins
  });

  it("never leaves 0…TAW", () => {
    const long = makeScenario("2026-06-01", repeat(45, { et0: 9 }), 40);
    const r = estimateDepletion(P, long, base({ today: "2026-07-10", anchor: { date: "2026-06-01", lastIrrigated: "week+" } }));
    expect(r.depletionMm).toBeLessThanOrEqual(TAW);
    expect(r.depletionMm).toBeGreaterThanOrEqual(0);
    r.days.forEach((d) => {
      expect(d.drEnd).toBeLessThanOrEqual(TAW);
      expect(d.drEnd).toBeGreaterThanOrEqual(0);
    });
  });

  it("looks back at most 14 days", () => {
    const long = makeScenario("2026-06-01", repeat(45, { et0: 8.5 }), 40);
    const r = estimateDepletion(P, long, base({ today: "2026-07-10", anchor: { date: "2026-06-01", lastIrrigated: "today" } }));
    expect(r.days).toHaveLength(14);
  });

  it("uses the same ET as the daily planner (no drift between history and plan)", () => {
    const r = estimateDepletion(P, hot20, base());
    for (const d of r.days) {
      const plan = computeDailyPlan(P, hot20, { depletionMm: 0, source: "estimate" }, d.date);
      expect(d.etc).toBeCloseTo(plan.etcDay, 1);
    }
  });
});

describe("7-day plan", () => {
  const weekScenario = makeScenario("2026-07-10", repeat(14, { et0: 8.5 }), 5); // 10–23 Jul
  const week = (sc = weekScenario, dr = 70) => planWeek(P, sc, dr, "2026-07-15");

  it("gives seven consecutive days", () => {
    const w = week();
    expect(w).toHaveLength(7);
    expect(w.map((d) => d.plan.date)).toEqual(["2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19", "2026-07-20", "2026-07-21"]);
  });

  it("assumes the farmer follows the plan: each day starts where the last ended", () => {
    const w = week();
    for (let i = 1; i < w.length; i++) {
      expect(w[i].plan.depletionStartMm).toBeCloseTo(w[i - 1].drAfter, 1);
    }
  });

  it("irrigating refills the root zone, so the next day needs less", () => {
    const w = week();
    expect(w[0].plan.decision).toBe("irrigate");
    expect(w[0].drAfter).toBeLessThan(w[0].drStart);
    expect(w[1].plan.requestedM3).toBeLessThanOrEqual(w[0].plan.requestedM3);
  });

  it("counts rain once: a downpour on day 3 lets the days around it skip", () => {
    const rainy = makeScenario("2026-07-15", [{ et0: 8.5 }, { et0: 8.5 }, { et0: 8.5 }, { et0: 3, rain: 30 }, ...repeat(6, { et0: 8.5 })], 0);
    const w = planWeek(P, rainy, 40, "2026-07-15");
    const rainDay = w[3];
    expect(rainDay.plan.rainDay).toBe(30);
    expect(rainDay.plan.decision).toBe("skip");
    // the day before sees the rain coming (48 h look-ahead) but its own balance isn't credited with it
    expect(w[2].drAfter).toBeGreaterThan(w[2].drStart - 1);
  });

  it("stops where the forecast stops", () => {
    expect(planWeek(P, hot20, 50, "2026-07-19")).toHaveLength(2); // data ends 20 Jul
  });
});
