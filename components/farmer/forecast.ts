import type { DailyPlan } from "@/lib/engine/types";
import type { DailySummary } from "@/lib/state-types";

// The logic behind the Week tab's forecast card, kept apart from the screen so it can be tested.

export type Mood = "calm" | "warm" | "hot" | "storm";
export const MOODS: Mood[] = ["calm", "warm", "hot", "storm"];

/** The sky that goes with a day: rain first, then heat, then warmth, otherwise calm. */
export function moodFor(plan: DailyPlan, day?: DailySummary): Mood {
  if (Math.max(plan.rainDay, day?.rain ?? 0) >= 2) return "storm";
  if ((day?.tmax ?? 0) >= 36 || plan.stress === "severe") return "hot";
  if ((day?.tmax ?? 0) >= 29) return "warm";
  return "calm";
}

/** How much of the root zone's usable water is left, 0–100 (depletion 0 = full, depletion = TAW = empty). */
export function reservePct(depletionMm: number, tawMm: number): number {
  if (!(tawMm > 0)) return 0;
  return Math.round(Math.min(100, Math.max(0, (1 - depletionMm / tawMm) * 100)));
}

export type Feel = "ok" | "dry" | "stress";
/** The one word for how the soil is doing. */
export function feelFor(pct: number, plan: DailyPlan): Feel {
  if (plan.stress === "severe" || pct < 35) return "stress";
  if (plan.stress === "mild" || pct < 60) return "dry";
  return "ok";
}

/**
 * Where each point goes on the wave: `values` are stretched to fill the height (a flat week still shows a gentle wave),
 * the first point is the left-most column's middle, and so on. `rtl` mirrors it for right-to-left languages.
 */
export function wavePoints(values: number[], width: number, height: number, pad: number, rtl: boolean): [number, number][] {
  const n = values.length;
  if (n === 0) return [];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 14) {
    const mid = (hi + lo) / 2;
    lo = mid - 7;
    hi = mid + 7;
  }
  return values.map((v, i) => {
    const x = ((i + 0.5) / n) * width;
    const y = pad + (1 - (v - lo) / (hi - lo)) * (height - 2 * pad);
    return [rtl ? width - x : x, y];
  });
}

/** A smooth curve through the points (Catmull-Rom turned into cubic Béziers), as an SVG path. */
export function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Which of `n` equal columns a pointer is over (0 = the first day, which is on the right in right-to-left). */
export function columnAt(clientX: number, left: number, width: number, n: number, rtl: boolean): number {
  const k = Math.floor(((clientX - left) / Math.max(1, width)) * n);
  const i = Math.min(n - 1, Math.max(0, k));
  return rtl ? n - 1 - i : i;
}
