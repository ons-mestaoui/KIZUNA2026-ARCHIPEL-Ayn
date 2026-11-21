import { describe, expect, it } from "vitest";
import { type FieldSource, buildField, gridFor, medianRaster, pickPasses } from "./build";
import type { RasterResult } from "./copernicus-core";
import { sceneBox, squareFromArea } from "./geo";
import { NDMI_RANGE, NDVI_RANGE, base64ToBytes, decodeGrid } from "./grid";
import type { GeoBox, LonLat, SeriesPoint } from "./types";

const here: LonLat = [10.573, 36.687];
const pt = (date: string, clear: number): SeriesPoint => ({ date, ndvi: clear ? 0.6 : null, ndmi: clear ? 0.2 : null, clear });

describe("pickPasses", () => {
  const series = [pt("2026-10-16", 1), pt("2026-10-21", 0.4), pt("2026-10-26", 0.95), pt("2026-11-02", 0.9), pt("2026-11-05", 0), pt("2026-11-10", 0.3), pt("2026-11-15", 1), pt("2026-11-20", 0.7)];

  it("takes the newest clear pass and one about two weeks before it", () => {
    const r = pickPasses(series);
    expect(r.latest?.date).toBe("2026-11-15"); // 11-20 is only 70 % clear
    expect(r.previous?.date).toBe("2026-11-02"); // 13 days earlier, closest to 14
    expect(r.partial).toBe(false);
    expect(r.lastClear).toBe("2026-11-15");
  });

  it("falls back to a half-clear pass and says so", () => {
    const r = pickPasses([pt("2026-11-10", 0.2), pt("2026-11-15", 0.6), pt("2026-11-20", 0.3)]);
    expect(r.latest?.date).toBe("2026-11-15");
    expect(r.partial).toBe(true);
    expect(r.previous).toBeNull();
  });

  it("has nothing when every pass is cloudy", () => {
    expect(pickPasses([pt("2026-11-10", 0.2), pt("2026-11-15", 0)])).toEqual({ latest: null, previous: null, partial: false, lastClear: null });
    expect(pickPasses([])).toEqual({ latest: null, previous: null, partial: false, lastClear: null });
  });

  it("does not compare with a pass less than 10 days older or more than 40", () => {
    expect(pickPasses([pt("2026-11-10", 1), pt("2026-11-15", 1)]).previous).toBeNull();
    expect(pickPasses([pt("2026-09-01", 1), pt("2026-11-15", 1)]).previous).toBeNull();
  });
});

describe("gridFor", () => {
  it("uses 5 m pixels for small scenes and 10 m for big ones", () => {
    expect(gridFor(500)).toEqual({ w: 100, h: 100, pixelM: 5 });
    expect(gridFor(1200).pixelM).toBe(5);
    expect(gridFor(3000)).toEqual({ w: 300, h: 300, pixelM: 10 });
  });
});

describe("medianRaster", () => {
  it("takes the per-pixel median and skips missing readings", () => {
    const m = medianRaster([[0.5, NaN, 0.1], [0.7, 0.4, NaN], [0.6, 0.6, NaN]]);
    expect(m[0]).toBeCloseTo(0.6);
    expect(m[1]).toBeCloseTo(0.5);
    expect(m[2]).toBeCloseTo(0.1);
    expect(Number.isNaN(medianRaster([[NaN], [NaN]])[0])).toBe(true);
  });
});

// ── a fake Copernicus: a field whose west half is greener, with some days cloudy ───────────────────────────────
function fake(polygon: LonLat[], cloudy: string[] = []) {
  const { box } = sceneBox(polygon);
  const calls: string[] = [];
  const source: FieldSource = {
    async series() {
      return [pt("2026-10-30", 1), pt("2026-11-02", 1), pt("2026-11-10", 0), pt("2026-11-15", 1)];
    },
    async raster(b: GeoBox, date: string, w: number, h: number): Promise<RasterResult> {
      calls.push(date);
      const ndvi = new Float32Array(w * h);
      const ndmi = new Float32Array(w * h);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const lon = b.west + ((i + 0.5) / w) * (b.east - b.west);
          const west = lon < (b.west + b.east) / 2;
          const day = date === "2026-11-15" ? 0 : 0.03; // a bit greener two weeks ago
          ndvi[j * w + i] = cloudy.includes(date) ? NaN : (west ? 0.74 : 0.5) + day;
          ndmi[j * w + i] = cloudy.includes(date) ? NaN : west ? 0.28 : 0.1;
        }
      }
      return { w, h, ndvi, ndmi };
    },
  };
  return { source, calls, box };
}

describe("buildField", () => {
  const polygon = squareFromArea(here, 4);

  it("picks two passes, splits the field and reports readings", async () => {
    const { source, calls } = fake(polygon);
    const f = await buildField(source, polygon, { now: new Date("2026-11-21T08:00:00Z"), source: "live" });
    expect(calls.sort()).toEqual(["2026-11-02", "2026-11-15"]);
    expect(f.frames.map((x) => x.date)).toEqual(["2026-11-02", "2026-11-15"]);
    expect(f.grid).toEqual({ w: 100, h: 100 });
    expect(f.zones?.list.map((z) => z.id)).toEqual(["A", "B"]); // two levels → two zones
    expect(f.stats).toHaveLength(2);
    expect(f.stats[1].zones[0].ndvi).toBeGreaterThan(f.stats[1].zones[1].ndvi!);
    expect(f.lastClear).toBe("2026-11-15");
    expect(f.partial).toBe(false);
    expect(f.source).toBe("live");
  });

  it("ships grids that decode back to the readings", async () => {
    const { source } = fake(polygon);
    const f = await buildField(source, polygon, { now: new Date("2026-11-21T08:00:00Z"), source: "live" });
    const ndvi = decodeGrid(f.frames[1].ndvi, NDVI_RANGE);
    const ndmi = decodeGrid(f.frames[1].ndmi, NDMI_RANGE);
    expect(ndvi).toHaveLength(100 * 100);
    expect(ndvi[50 * 100 + 10]).toBeCloseTo(0.74, 1); // far west of the scene centre
    expect(ndmi[50 * 100 + 90]).toBeCloseTo(0.1, 1);
    expect(base64ToBytes(f.zones!.map)).toHaveLength(100 * 100);
  });

  it("keeps the zones when the earlier pass is cloudy: stats just show no reading", async () => {
    const { source } = fake(polygon, ["2026-11-02"]);
    const f = await buildField(source, polygon, { now: new Date("2026-11-21T08:00:00Z"), source: "live" });
    expect(f.zones).not.toBeNull();
    expect(f.stats[0].field).toEqual({ ndvi: null, ndmi: null, clear: 0 });
  });

  it("with no clear pass returns the history but no frames or zones", async () => {
    const source: FieldSource = { series: async () => [pt("2026-11-10", 0.1), pt("2026-11-15", 0)], raster: async () => Promise.reject(new Error("must not be called")) };
    const f = await buildField(source, polygon, { now: new Date("2026-11-21T08:00:00Z"), source: "live" });
    expect(f.frames).toEqual([]);
    expect(f.zones).toBeNull();
    expect(f.series).toHaveLength(2);
    expect(f.lastClear).toBeNull();
  });

  it("snapshot mode uses exactly the given passes and defines the zones from their median", async () => {
    const { source, calls } = fake(polygon);
    const f = await buildField(source, polygon, { now: new Date("2026-11-21T08:00:00Z"), source: "snapshot", frameDates: ["2026-11-15", "2026-11-02"], zoneDates: ["2026-11-02", "2026-11-15"] });
    expect(calls.sort()).toEqual(["2026-11-02", "2026-11-15"]);
    expect(f.frames.map((x) => x.date)).toEqual(["2026-11-02", "2026-11-15"]); // sorted oldest → newest
    expect(f.zones?.list).toHaveLength(2);
  });

  it("rounds the outline for a stable cache key and a small payload", async () => {
    const { source } = fake(polygon);
    const f = await buildField(source, polygon, { now: new Date("2026-11-21T08:00:00Z"), source: "live" });
    f.polygon.forEach(([lon, lat]) => {
      expect(lon).toBe(Math.round(lon * 1e6) / 1e6);
      expect(lat).toBe(Math.round(lat * 1e6) / 1e6);
    });
  });
});
