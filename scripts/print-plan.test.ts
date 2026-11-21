// Dev helper: `npx vitest run scripts/print-plan.test.ts` prints the demo numbers.
import { it } from "vitest";
import summer from "../data/demo/weather-summer.json";
import live from "../data/demo/weather-live.json";
import { DEFAULT_PARCEL } from "../lib/engine/parcel";
import { computeDailyPlan } from "../lib/engine/plan";
import type { WeatherScenario } from "../lib/engine/types";

it("print", () => {
  for (const [name, sc, theta] of [
    ["summer dry", summer, 0.08],
    ["summer mid", summer, 0.14],
    ["summer wet", summer, 0.2],
    ["live mid", live, 0.14],
  ] as const) {
    const p = computeDailyPlan(DEFAULT_PARCEL, sc as unknown as WeatherScenario, { theta, source: "simulated" });
    const { hours, ...rest } = p;
    console.log(name, JSON.stringify(rest));
    console.log("  pv:", hours.map((h) => h.pvW).join(" "));
    console.log("  basin:", hours.map((h) => h.basinM3).join(" "));
  }
});
