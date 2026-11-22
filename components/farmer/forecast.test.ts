import { describe, expect, it } from "vitest";
import type { DailyPlan } from "@/lib/engine/types";
import { columnAt, feelFor, moodFor, reservePct, smoothPath, wavePoints } from "./forecast";

const plan = (over: Partial<DailyPlan> = {}): DailyPlan => ({ rainDay: 0, stress: "none", ...over }) as DailyPlan;
const day = (tmax: number, rain = 0) => ({ date: "2026-07-21", tmax, et0: 6, rain });

describe("the sky for a day", () => {
  it("rain wins over heat", () => {
    expect(moodFor(plan({ rainDay: 4 }), day(38))).toBe("storm");
    expect(moodFor(plan(), day(38, 3))).toBe("storm");
  });
  it("heat, then warmth, then calm", () => {
    expect(moodFor(plan(), day(36))).toBe("hot");
    expect(moodFor(plan({ stress: "severe" }), day(25))).toBe("hot");
    expect(moodFor(plan(), day(31))).toBe("warm");
    expect(moodFor(plan(), day(22))).toBe("calm");
    expect(moodFor(plan({ rainDay: 1.9 }), day(22, 1.9))).toBe("calm"); // a drizzle is not a storm
  });
  it("copes with a day we have no weather for", () => {
    expect(moodFor(plan())).toBe("calm");
  });
});

describe("soil water", () => {
  it("is a percentage of what the roots can use", () => {
    expect(reservePct(0, 60)).toBe(100);
    expect(reservePct(30, 60)).toBe(50);
    expect(reservePct(60, 60)).toBe(0);
    expect(reservePct(90, 60)).toBe(0); // never below empty
    expect(reservePct(-5, 60)).toBe(100);
    expect(reservePct(10, 0)).toBe(0); // no capacity known
  });
  it("is described in one word", () => {
    expect(feelFor(80, plan())).toBe("ok");
    expect(feelFor(50, plan())).toBe("dry");
    expect(feelFor(80, plan({ stress: "mild" }))).toBe("dry");
    expect(feelFor(20, plan())).toBe("stress");
    expect(feelFor(90, plan({ stress: "severe" }))).toBe("stress");
  });
});

describe("the wave", () => {
  it("puts one point in the middle of each column, high values high", () => {
    const pts = wavePoints([20, 60, 100], 300, 100, 10, false);
    expect(pts.map((p) => p[0])).toEqual([50, 150, 250]);
    expect(pts[2][1]).toBeLessThan(pts[0][1]); // 100 % is higher on screen (smaller y) than 20 %
    for (const [, y] of pts) {
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(90);
    }
  });
  it("a flat week still draws a gentle wave, not a crash", () => {
    const pts = wavePoints([70, 70, 70, 70], 280, 100, 10, false);
    expect(new Set(pts.map((p) => p[1])).size).toBe(1);
    expect(Number.isFinite(pts[0][1])).toBe(true);
  });
  it("mirrors for right-to-left", () => {
    const ltr = wavePoints([10, 90], 200, 100, 0, false);
    const rtl = wavePoints([10, 90], 200, 100, 0, true);
    expect(rtl[0][0]).toBe(200 - ltr[0][0]);
    expect(rtl[0][1]).toBe(ltr[0][1]);
  });
  it("is joined by a smooth path with one curve per gap", () => {
    const d = smoothPath(wavePoints([20, 80, 40, 90, 60], 350, 100, 8, false));
    expect(d.startsWith("M")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(4);
    expect(d).not.toMatch(/NaN/);
    expect(smoothPath([])).toBe("");
    expect(smoothPath([[5, 5]])).toBe("M5.0 5.0");
  });
  it("finds the column under a pointer", () => {
    expect(columnAt(10, 0, 700, 7, false)).toBe(0);
    expect(columnAt(350, 0, 700, 7, false)).toBe(3);
    expect(columnAt(699, 0, 700, 7, false)).toBe(6);
    expect(columnAt(-50, 0, 700, 7, false)).toBe(0); // dragged past the edge: clamps
    expect(columnAt(9999, 0, 700, 7, false)).toBe(6);
    expect(columnAt(10, 0, 700, 7, true)).toBe(6); // right-to-left: the left edge is the last day
  });
});
