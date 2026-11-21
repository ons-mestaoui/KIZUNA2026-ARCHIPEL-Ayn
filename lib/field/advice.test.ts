import { describe, expect, it } from "vitest";
import { adviseZones } from "./advice";
import type { FrameStats, ZoneStat } from "./types";

const z = (ndvi: number | null, ndmi: number | null, clear = 1): ZoneStat => ({ ndvi, ndmi, clear });
const frame = (date: string, field: ZoneStat, zones: ZoneStat[]): FrameStats => ({ date, field, zones });

// field average 0.60 / 0.20; zone B is the odd one
const even = frame("2026-11-15", z(0.6, 0.2), [z(0.61, 0.21), z(0.6, 0.2), z(0.59, 0.19)]);
const bWeakAndDry = frame("2026-11-15", z(0.6, 0.2), [z(0.68, 0.26), z(0.48, 0.1), z(0.62, 0.22)]);

describe("adviseZones", () => {
  it("says 'water zone B first' only on an irrigation day and only when B is low on BOTH signals", () => {
    const r = adviseZones({ latest: bWeakAndDry, previous: null, decision: "irrigate" });
    expect(r.advice).toEqual({ kind: "waterFirst", zone: 1 });
  });

  it("on a skip day the same picture only says to go and look", () => {
    const r = adviseZones({ latest: bWeakAndDry, previous: null, decision: "skip" });
    expect(r.advice).toEqual({ kind: "check", zone: 1, why: "both" });
  });

  it("low greenness without low leaf water is NOT enough to say water (could be young trees, gaps, weeds)", () => {
    const f = frame("d", z(0.6, 0.2), [z(0.66, 0.2), z(0.48, 0.2), z(0.66, 0.2)]);
    expect(adviseZones({ latest: f, previous: null, decision: "irrigate" }).advice).toEqual({ kind: "check", zone: 1, why: "green" });
  });

  it("drier leaves without a greenness gap is a look-first hint too", () => {
    const f = frame("d", z(0.6, 0.2), [z(0.6, 0.25), z(0.6, 0.1), z(0.6, 0.25)]);
    expect(adviseZones({ latest: f, previous: null, decision: "irrigate" }).advice).toEqual({ kind: "check", zone: 1, why: "leaves" });
  });

  it("reports an even field when no zone stands out", () => {
    expect(adviseZones({ latest: even, previous: null, decision: "irrigate" }).advice).toEqual({ kind: "even" });
  });

  it("picks the zone furthest below the average when two are flagged", () => {
    const f = frame("d", z(0.6, 0.2), [z(0.54, 0.15), z(0.7, 0.3), z(0.45, 0.08)]);
    expect(adviseZones({ latest: f, previous: null, decision: "irrigate" }).advice).toEqual({ kind: "waterFirst", zone: 2 });
  });

  it("tags every zone against the field average", () => {
    const rows = adviseZones({ latest: bWeakAndDry, previous: null, decision: "skip" }).rows;
    expect(rows.map((r) => r.tag)).toEqual(["greener", "weaker", "similar"]);
    expect(rows.map((r) => r.wet)).toEqual(["wetter", "drier", "similar"]);
    expect(rows[1].dNdvi).toBeCloseTo(-0.12, 6);
  });

  it("ignores a zone that was mostly under cloud", () => {
    const f = frame("d", z(0.6, 0.2), [z(0.6, 0.2), z(0.3, 0.0, 0.2), z(0.6, 0.2)]);
    const r = adviseZones({ latest: f, previous: null, decision: "irrigate" });
    expect(r.advice).toEqual({ kind: "even" });
    expect(r.rows[1].ndvi).toBeNull();
  });

  it("has nothing to say without data or without zones", () => {
    expect(adviseZones({ latest: null, previous: null, decision: "skip" }).advice).toEqual({ kind: "none", reason: "no_data" });
    expect(adviseZones({ latest: frame("d", z(null, null, 0), []), previous: null, decision: "skip" }).advice).toEqual({ kind: "none", reason: "no_data" });
    expect(adviseZones({ latest: frame("d", z(0.5, 0.1), []), previous: null, decision: "skip" }).advice).toEqual({ kind: "none", reason: "no_zones" });
  });
});

describe("trend", () => {
  const later = frame("2026-11-15", z(0.5, 0.2), [z(0.55, 0.2), z(0.4, 0.2), z(0.55, 0.2)]);

  it("flags a zone that lost greenness faster than the whole field", () => {
    // everything lost 0.06 with the season, but zone B lost 0.16
    const earlier = frame("2026-11-01", z(0.56, 0.2), [z(0.61, 0.2), z(0.56, 0.2), z(0.61, 0.2)]);
    const t = adviseZones({ latest: later, previous: earlier, decision: "skip" }).trend;
    expect(t?.zone).toBe(1);
    expect(t?.since).toBe("2026-11-01");
    expect(t!.delta).toBeLessThan(-0.04);
  });

  it("does not call a field-wide seasonal drop a problem", () => {
    const earlier = frame("2026-11-01", z(0.56, 0.2), [z(0.61, 0.2), z(0.46, 0.2), z(0.61, 0.2)]);
    expect(adviseZones({ latest: later, previous: earlier, decision: "skip" }).trend).toBeNull();
  });

  it("needs at least a week between the passes", () => {
    const earlier = frame("2026-11-12", z(0.56, 0.2), [z(0.61, 0.2), z(0.56, 0.2), z(0.61, 0.2)]);
    expect(adviseZones({ latest: later, previous: earlier, decision: "skip" }).trend).toBeNull();
  });
});
