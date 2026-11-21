import { describe, expect, it } from "vitest";
import { selectFrames } from "./frames";
import type { FieldDTO, FrameStats } from "./types";

const stat = (date: string): FrameStats => ({ date, field: { ndvi: 0.6, ndmi: 0.2, clear: 1 }, zones: [] });
const field = (dates: string[]): FieldDTO => ({
  version: 1, source: "snapshot", asOf: "x", polygon: [[0, 0], [1, 0], [1, 1]], box: { west: 0, south: 0, east: 1, north: 1 }, sideM: 500, grid: { w: 2, h: 2 },
  frames: dates.map((date) => ({ date, clear: 1, ndvi: "", ndmi: "" })), stats: dates.map(stat), zones: null, series: [], lastClear: dates.at(-1) ?? null, partial: false,
});

describe("selectFrames", () => {
  it("keeps the chosen passes in their original order, with their statistics", () => {
    const f = selectFrames(field(["2026-07-13", "2026-07-18", "2026-07-23", "2026-11-15"]), ["2026-11-15", "2026-07-18"]);
    expect(f.frames.map((x) => x.date)).toEqual(["2026-07-18", "2026-11-15"]);
    expect(f.stats.map((x) => x.date)).toEqual(["2026-07-18", "2026-11-15"]);
    expect(f.lastClear).toBe("2026-11-15");
  });
  it("leaves the original untouched and tolerates dates it does not have", () => {
    const original = field(["2026-07-18", "2026-07-23"]);
    const f = selectFrames(original, ["2026-07-23", "2030-01-01"]);
    expect(original.frames).toHaveLength(2);
    expect(f.frames.map((x) => x.date)).toEqual(["2026-07-23"]);
    expect(selectFrames(original, []).frames).toEqual([]);
  });
});
