import type { FrameStats, ZoneStat } from "./types";

// What the satellite view means for today's watering. Rules, not AI: free, instant, and the same answer every time.
//
// Careful wording is the point. Low greenness alone can be young trees, gaps, weeds or bare rows, so "water this
// zone first" needs BOTH signals low (greenness and leaf water) and an irrigation day; otherwise the advice is
// "go and look". The irrigation plan still decides how much water; this only orders where it goes.

export const NDVI_STEP = 0.05; // a zone this far below the field's average is "weaker"
export const NDMI_STEP = 0.04; // …and this far below on leaf water is "drier"
export const TREND_STEP = 0.04;
export const TREND_MIN_DAYS = 7;
const MIN_CLEAR = 0.5; // ignore a zone that was mostly under cloud

export type Tag = "greener" | "similar" | "weaker";
export type Wet = "wetter" | "similar" | "drier";

export interface ZoneRow {
  zone: number;
  ndvi: number | null;
  ndmi: number | null;
  /** difference from the field's average */
  dNdvi: number | null;
  dNdmi: number | null;
  tag: Tag;
  wet: Wet;
}

export type Advice =
  | { kind: "none"; reason: "no_data" | "no_zones" }
  | { kind: "even" }
  | { kind: "waterFirst"; zone: number }
  | { kind: "check"; zone: number; why: "leaves" | "green" | "both" };

export interface AdviceResult {
  advice: Advice;
  rows: ZoneRow[];
  /** a zone that lost greenness faster than the rest of the field since an earlier pass */
  trend: { zone: number; delta: number; since: string } | null;
}

/**
 * How far a zone sits from the field's average, as one number for colouring: −1 (clearly weaker and drier) … 0 … +1
 * (clearly stronger and wetter). One threshold step on each signal is ±0.25, so a zone that earns "weaker" and
 * "drier" together lands at about −0.5 and twice that is the full colour.
 */
export function zoneScore(zone: ZoneStat, field: ZoneStat): number {
  if (zone.clear < MIN_CLEAR || zone.ndvi === null || field.ndvi === null) return 0;
  const dN = (zone.ndvi - field.ndvi) / NDVI_STEP;
  const dM = zone.ndmi !== null && field.ndmi !== null ? (zone.ndmi - field.ndmi) / NDMI_STEP : dN; // no leaf-water reading: lean on greenness
  return Math.max(-1, Math.min(1, (dN + dM) / 4));
}

const days = (a: string, b: string) => (Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;

export function adviseZones(args: { latest: FrameStats | null; previous: FrameStats | null; decision: "irrigate" | "skip" }): AdviceResult {
  const { latest, previous, decision } = args;
  if (!latest || latest.field.ndvi === null) return { advice: { kind: "none", reason: "no_data" }, rows: [], trend: null };
  if (latest.zones.length < 2) return { advice: { kind: "none", reason: "no_zones" }, rows: [], trend: null };

  const fN = latest.field.ndvi;
  const fM = latest.field.ndmi;
  const rows: ZoneRow[] = latest.zones.map((z, zone) => {
    if (z.clear < MIN_CLEAR || z.ndvi === null) return { zone, ndvi: null, ndmi: null, dNdvi: null, dNdmi: null, tag: "similar", wet: "similar" };
    const dN = z.ndvi - fN;
    const dM = z.ndmi !== null && fM !== null ? z.ndmi - fM : null;
    return {
      zone,
      ndvi: z.ndvi,
      ndmi: z.ndmi,
      dNdvi: dN,
      dNdmi: dM,
      tag: dN >= NDVI_STEP ? "greener" : dN <= -NDVI_STEP ? "weaker" : "similar",
      wet: dM === null ? "similar" : dM >= NDMI_STEP ? "wetter" : dM <= -NDMI_STEP ? "drier" : "similar",
    };
  });

  // the zone furthest below the average on either signal
  const flagged = rows.filter((r) => r.tag === "weaker" || r.wet === "drier");
  let advice: Advice = { kind: "even" };
  if (flagged.length) {
    const score = (r: ZoneRow) => (r.dNdvi ?? 0) / NDVI_STEP + (r.dNdmi ?? 0) / NDMI_STEP;
    const focus = flagged.reduce((a, b) => (score(b) < score(a) ? b : a));
    const both = focus.tag === "weaker" && focus.wet === "drier";
    advice =
      decision === "irrigate" && both
        ? { kind: "waterFirst", zone: focus.zone }
        : { kind: "check", zone: focus.zone, why: both ? "both" : focus.wet === "drier" ? "leaves" : "green" };
  }

  // a zone losing greenness faster than the whole field (the whole field drifting with the season is not news)
  let trend: AdviceResult["trend"] = null;
  if (previous && days(latest.date, previous.date) >= TREND_MIN_DAYS && previous.field.ndvi !== null) {
    const fieldDelta = fN - previous.field.ndvi;
    latest.zones.forEach((z, zone) => {
      const p = previous.zones[zone];
      if (!p || z.ndvi === null || p.ndvi === null || z.clear < MIN_CLEAR || p.clear < MIN_CLEAR) return;
      const rel = z.ndvi - p.ndvi - fieldDelta;
      if (rel <= -TREND_STEP && (!trend || rel < trend.delta)) trend = { zone, delta: rel, since: previous.date };
    });
  }
  return { advice, rows, trend };
}
