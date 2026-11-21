import { describe, expect, it } from "vitest";
import { summarizeField } from "./summary";
import type { FieldDTO, FrameStats, ZoneStat } from "./types";

const z = (ndvi: number | null, ndmi: number | null, clear = 1): ZoneStat => ({ ndvi, ndmi, clear });

function field(stats: FrameStats[], withZones = true): FieldDTO {
  return {
    version: 1,
    source: "live",
    asOf: "2026-11-21T08:00:00Z",
    polygon: [[10.573, 36.687], [10.574, 36.687], [10.574, 36.686]],
    box: { west: 10.57, south: 36.68, east: 10.58, north: 36.69 },
    sideM: 500,
    grid: { w: 100, h: 100 },
    frames: stats.map((s) => ({ date: s.date, clear: s.field.clear, ndvi: "", ndmi: "" })),
    stats,
    zones: withZones ? { map: "", list: [{ id: "A", areaHa: 0.41, centroid: [10.573, 36.687] }, { id: "B", areaHa: 0.57, centroid: [10.5735, 36.6865] }] } : null,
    series: [],
    lastClear: stats.at(-1)?.date ?? null,
    partial: false,
  };
}

const weakB: FrameStats = { date: "2026-11-15", field: z(0.6, 0.2), zones: [z(0.68, 0.27), z(0.5, 0.12)] };

describe("summarizeField", () => {
  it("gives the AI the same picture the farmer sees, in plain sentences", () => {
    const s = summarizeField(field([weakB]), "irrigate")!;
    expect(s).toContain("Sentinel-2, 2026-11-15, 100 % of the field clear");
    expect(s).toContain("average greenness (NDVI) 0.60, leaf water (NDMI) 0.20");
    expect(s).toContain("do not measure soil moisture");
    expect(s).toContain("B (0.57 ha): greenness 0.50, leaf water 0.12, less green than the field average, drier leaves");
    expect(s).toContain("A (0.41 ha): greenness 0.68");
    expect(s).toContain("water zone B first");
    expect(s).toContain("still decides how much water");
  });

  it("says to look first, not to water, on a day with no irrigation", () => {
    const s = summarizeField(field([weakB]), "skip")!;
    expect(s).toContain("check zone B first on foot");
    expect(s).not.toContain("water zone B first");
  });

  it("reports an even field", () => {
    const even: FrameStats = { date: "2026-11-15", field: z(0.6, 0.2), zones: [z(0.61, 0.21), z(0.59, 0.19)] };
    expect(summarizeField(field([even]), "irrigate")).toContain("looks even");
  });

  it("mentions a zone that is losing greenness faster than the rest", () => {
    const earlier: FrameStats = { date: "2026-11-01", field: z(0.62, 0.2), zones: [z(0.68, 0.27), z(0.62, 0.2)] };
    expect(summarizeField(field([earlier, weakB]), "skip")).toContain("Zone B lost greenness faster than the rest of the field since 2026-11-01");
  });

  it("handles a field with no zones, and no usable pass", () => {
    expect(summarizeField(field([{ date: "2026-11-15", field: z(0.6, 0.2), zones: [] }], false), "skip")).toContain("too small or too even");
    expect(summarizeField(field([]), "skip")).toBeNull();
    expect(summarizeField(field([{ date: "2026-11-15", field: z(null, null, 0), zones: [] }]), "skip")).toBeNull();
  });

  it("contains no coordinates or place names", () => {
    const s = summarizeField(field([weakB]), "irrigate")!;
    expect(s).not.toMatch(/36\.\d|10\.5|lat|lon/i);
  });
});
