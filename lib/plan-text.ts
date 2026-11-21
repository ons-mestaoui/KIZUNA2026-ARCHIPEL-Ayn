import type { DailyPlan } from "@/lib/engine/types";
import { type Dict, fmt } from "@/lib/i18n";

export interface PlanStep {
  tone: "sun" | "water";
  time: string; // "05:00–06:10"
  text: string;
}

const span = (w: { start: string; end: string }) => `${w.start}–${w.end}`;
const n = (x: number) => String(Math.round(x));

/** The day's to-do list, in the farmer's language, shaped by the farm's water source. */
export function planSteps(plan: DailyPlan, t: Dict): PlanStep[] {
  if (plan.grossM3 <= 0) return [];
  const [dawn, dusk] = plan.irrigationWindows;
  if (plan.source === "solar_basin" && dawn && dusk && plan.pumpWindow) {
    return [
      { tone: "water", time: span(dawn), text: fmt(t.today.steps.dawn, { m3: n(dawn.m3) }) },
      { tone: "sun", time: span(plan.pumpWindow), text: fmt(t.today.steps.pump, { m3: n(plan.pumpWindow.m3) }) },
      { tone: "water", time: span(dusk), text: fmt(t.today.steps.dusk, { m3: n(dusk.m3) }) },
    ];
  }
  if (plan.source === "solar_direct" && plan.pumpWindow) {
    return [{ tone: "sun", time: span(plan.pumpWindow), text: fmt(t.today.steps.direct, { m3: n(plan.pumpWindow.m3) }) }];
  }
  return plan.irrigationWindows.map((w, i) => ({
    tone: "water" as const,
    time: span(w),
    text: fmt(i === 0 ? t.today.steps.dawn : t.today.steps.dusk, { m3: n(w.m3) }),
  }));
}

/** Why today's plan applies less than the crop needs — or null when nothing limits it. */
export function limitText(plan: DailyPlan, t: Dict, basinCapacityM3: number): string | null {
  if (!plan.limitedBy) return null;
  const solar = plan.source === "solar_basin" || plan.source === "solar_direct";
  if (solar && plan.grossM3 <= 0) return t.today.limits.noSun;
  const vars = { m3: n(plan.grossM3), need: n(plan.requestedM3), cap: n(basinCapacityM3) };
  return fmt(t.today.limits[plan.limitedBy], vars);
}

/** True when the crop needs water today but nothing can be applied (e.g. no sun for a solar pump). */
export const neededButBlocked = (plan: DailyPlan) => plan.decision === "irrigate" && plan.grossM3 <= 0;
