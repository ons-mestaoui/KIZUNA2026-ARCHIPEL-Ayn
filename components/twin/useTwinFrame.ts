import type { DailyPlan } from "@/lib/engine/types";
import { useApp } from "@/lib/store";

export interface FrameState {
  hour: number;
  idx: number;
  pumpOn: boolean;
  irrigating: boolean;
  basinFrac: number; // 0–1 (0 when there is no basin)
  pvFrac: number; // 0–1 of nameplate (0 without panels)
}

/**
 * Read the plan at the current (float) hour without re-rendering React:
 * call this inside useFrame. Basin level is interpolated between hourly steps.
 */
export function frameAt(plan: DailyPlan, capacity: number, kWp: number): FrameState {
  const hour = useApp.getState().hour;
  const idx = Math.min(23, Math.floor(hour));
  const f = hour - idx;
  const step = plan.hours[idx];
  const prevLevel = idx > 0 ? plan.hours[idx - 1].basinM3 : plan.hours[23].basinM3;
  const level = prevLevel + (step.basinM3 - prevLevel) * f;
  return {
    hour,
    idx,
    pumpOn: step.pumpOn,
    irrigating: step.irrigating,
    basinFrac: capacity > 0 ? Math.max(0, Math.min(1, level / capacity)) : 0,
    pvFrac: kWp > 0 ? Math.min(1, step.pvW / (kWp * 1000 * 0.8)) : 0,
  };
}
