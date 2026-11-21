import { CROPS, kcOn } from "./crops";
import { dayClimate } from "./climate";
import { pumpFlowM3h, pvPowerW } from "./solarPump";
import type {
  DailyPlan,
  DecisionReason,
  HourStep,
  Limiter,
  ParcelConfig,
  PumpMetrics,
  SoilState,
  WaterSource,
  WeatherScenario,
  Window,
} from "./types";
import { clamp, depletionFromTheta, effectiveRain, mmToM3, totalAvailableWater } from "./waterBalance";

const DAWN_START_H = 5;
const DUSK_START_H = 19;
const DAWN_SHARE = 0.4;
const RECOVERY_CAP = 1.2; // max daily net application as a multiple of ETc (drip can't refill the whole root zone in a day)
const MIN_NET_MM = 0.5;
const NON_SOLAR_HOURS = 8; // dawn + dusk windows the network can run
const MORNING_END_H = 13; // solar_direct prefers the cooler morning block

/** A "solar + basin" farm without a basin behaves as direct pumping. */
export function effectiveSource(p: ParcelConfig): WaterSource {
  return p.waterSource === "solar_basin" && p.basinCapacityM3 <= 0 ? "solar_direct" : p.waterSource;
}

/**
 * The plan for one day. The decision (irrigate or skip, and how much the crop needs) is pure
 * FAO-56 water balance; the schedule and the hard limits then depend on the water source:
 *   solar_basin  → pump at solar peak into the basin, drip from it at dawn and dusk
 *   solar_direct → irrigate while pumping, in the cooler morning block when it can
 *   grid | diesel | network → dawn and dusk windows, limited by what the network delivers
 */
export function computeDailyPlan(
  parcel: ParcelConfig,
  scenario: WeatherScenario,
  soil: SoilState,
  date: string = scenario.focusDate,
): DailyPlan {
  const crop = CROPS[parcel.crop];
  const clim = dayClimate(scenario, date);
  const hours = clim.hours;

  // ── Water balance ────────────────────────────────────────────────────────
  const kc = kcOn(date, parcel.crop, { plantingDate: parcel.plantingDate, stage: parcel.stage });
  const etcDay = kc * clim.et0Day;
  const pe = effectiveRain(clim.rain48h);
  const taw = totalAvailableWater(parcel.soil, crop.rootDepthM);
  const raw = crop.depletionP * taw;
  const drStart =
    "depletionMm" in soil
      ? clamp(soil.depletionMm, 0, taw)
      : depletionFromTheta(soil.theta, parcel.soil, crop.rootDepthM);
  const drNoRain = Math.min(taw, drStart + etcDay);
  const drEnd = Math.max(0, drNoRain - pe);

  let decision: DailyPlan["decision"] = "skip";
  let reason: DecisionReason = "soil_ok";
  let netMm = 0;
  if (drEnd > raw) {
    // Regulated deficit response: apply a fraction of ETc that ramps from 0.5×ETc at the
    // stress threshold (RAW) to RECOVERY_CAP×ETc when the root zone is empty (TAW).
    const severity = clamp((drEnd - raw) / Math.max(taw - raw, 1e-9), 0, 1);
    netMm = Math.min(drEnd, etcDay * (0.5 + (RECOVERY_CAP - 0.5) * severity));
    if (netMm >= MIN_NET_MM) {
      decision = "irrigate";
      reason = "deficit";
    } else netMm = 0;
  } else if (drNoRain > raw) {
    reason = "rain_expected";
  }

  // ── Solar power & pump capacity per hour (zero for grid / diesel / network) ─
  const source = effectiveSource(parcel);
  const solar = source === "solar_basin" || source === "solar_direct";
  const flow = Math.max(parcel.irrigation.flowM3h, 0.1);
  const pvW = hours.map((h) => (solar ? pvPowerW(h.gti, h.temp, parcel.pv) : 0));
  const qRaw = pvW.map((p) => pumpFlowM3h(p, parcel.pump));
  const qOpt = qRaw.map((q) => Math.min(q, parcel.well.safeYieldM3h)); // VFD caps flow at the well's safe yield
  const qDirect = qOpt.map((q) => Math.min(q, flow)); // …and, with no basin, at what the field network takes
  const qSched = source === "solar_direct" ? qDirect : qOpt;

  // ── What the crop needs vs. what this farm can apply today ───────────────
  const requestedM3 = decision === "irrigate" ? mmToM3(netMm / parcel.irrigation.efficiency, parcel.areaHa) : 0;
  let capM3: number;
  let limiter: Limiter;
  if (source === "solar_basin") {
    const pumpCap = sum(qOpt);
    capM3 = Math.min(parcel.basinCapacityM3, pumpCap);
    limiter = parcel.basinCapacityM3 <= pumpCap ? "basin" : "pump";
  } else if (source === "solar_direct") {
    capM3 = sum(qDirect);
    limiter = "pump";
  } else {
    capM3 = flow * NON_SOLAR_HOURS;
    limiter = "network";
  }
  const grossM3 = Math.min(requestedM3, capM3);
  const limitedBy = requestedM3 > capM3 + 1e-6 ? limiter : undefined;
  const grossMm = grossM3 / (parcel.areaHa * 10);

  // ── Schedules ────────────────────────────────────────────────────────────
  const irrigated = new Array<number>(24).fill(0);
  const pumped = new Array<number>(24).fill(0);
  const irrigationWindows: Window[] = [];
  let pumpWindow: Window | null = null;
  const dawnM3 = grossM3 * DAWN_SHARE;
  const duskM3 = grossM3 - dawnM3;

  if (grossM3 > 0) {
    if (source === "solar_basin") {
      // Steady state: the basin starts the day with the dawn share pumped yesterday; today we pump
      // today's dusk share + tomorrow's dawn share = grossM3, in one block grown from the solar peak.
      irrigationWindows.push(fillWindow(irrigated, DAWN_START_H, dawnM3, flow));
      irrigationWindows.push(fillWindow(irrigated, DUSK_START_H, duskM3, flow));
      scheduleBlock(qOpt, grossM3).forEach((v, h) => (pumped[h] = v));
      pumpWindow = blockWindow(pumped, qOpt, grossM3);
    } else if (source === "solar_direct") {
      const morning = hours.map((_, h) => h <= MORNING_END_H);
      const useMorning = sum(qDirect.filter((_, h) => morning[h])) >= grossM3 - 1e-9;
      scheduleBlock(qDirect, grossM3, useMorning ? morning : undefined).forEach((v, h) => {
        pumped[h] = v;
        irrigated[h] = v; // water goes straight to the field
      });
      pumpWindow = blockWindow(pumped, qDirect, grossM3);
      if (pumpWindow) irrigationWindows.push({ ...pumpWindow });
    } else {
      irrigationWindows.push(fillWindow(irrigated, DAWN_START_H, dawnM3, flow));
      irrigationWindows.push(fillWindow(irrigated, DUSK_START_H, duskM3, flow));
    }
  }

  // ── Basin simulation (solar_basin only) ──────────────────────────────────
  let basin = source === "solar_basin" ? (grossM3 > 0 ? dawnM3 : parcel.basinCapacityM3 * 0.25) : 0;
  const steps: HourStep[] = hours.map((h, i) => {
    if (source === "solar_basin") basin = clamp(basin + pumped[i] - irrigated[i], 0, parcel.basinCapacityM3);
    return {
      hour: h.hour,
      time: h.time,
      et0: round(h.et0, 3),
      gti: round(h.gti, 1),
      pvW: Math.round(pvW[i]),
      pumpOn: pumped[i] > 0,
      pumpedM3: round(pumped[i], 2),
      irrigating: irrigated[i] > 0,
      irrigatedM3: round(irrigated[i], 2),
      basinM3: round(basin, 1),
      overYield: false,
    };
  });

  // ── Metrics: plan vs. the "pump every sunny hour" habit (solar sources only) ─
  let optimized = emptyMetrics();
  let baseline = emptyMetrics();
  if (solar) {
    optimized = metrics(
      pumped.map((v, i) => (qSched[i] > 0 ? v / qSched[i] : 0)), // fraction of the hour running
      pumped,
      pvW.map((p, i) => (qRaw[i] > 0 ? (p * qSched[i]) / qRaw[i] : 0)), // capped flow → proportionally less power
      pvW,
      parcel,
    );
    baseline = metrics(
      qRaw.map((q) => (q > 0 ? 1 : 0)),
      qRaw,
      pvW,
      pvW,
      parcel,
    );
  }
  const wasteM3 = Math.max(0, baseline.pumpedM3 - optimized.pumpedM3);
  const pct = (a: number, b: number) => (b > 0 ? round((100 * (b - a)) / b, 1) : 0);

  const stress: DailyPlan["stress"] = drStart > 0.8 * taw ? "severe" : drStart > raw ? "mild" : "none";

  return {
    date,
    source,
    decision,
    reason,
    et0Day: round(clim.et0Day, 2),
    kc,
    etcDay: round(etcDay, 2),
    rainDay: round(clim.rainDay, 1),
    rain48h: round(clim.rain48h, 1),
    effectiveRain: round(pe, 1),
    tawMm: round(taw, 1),
    rawMm: round(raw, 1),
    depletionStartMm: round(drStart, 1),
    depletionEndMm: round(drEnd, 1),
    netMm: round(netMm, 2),
    grossMm: round(grossMm, 2),
    grossM3: round(grossM3, 1),
    requestedM3: round(requestedM3, 1),
    limitedBy,
    pumpWindow,
    irrigationWindows,
    hours: steps,
    optimized,
    baseline: { ...baseline, wasteM3: round(wasteM3, 1) },
    savings: solar
      ? {
          waterM3: round(baseline.pumpedM3 - optimized.pumpedM3, 1),
          waterPct: pct(optimized.pumpedM3, baseline.pumpedM3),
          pumpHoursPct: pct(optimized.pumpHours, baseline.pumpHours),
          energyPct: pct(optimized.energyKWh, baseline.energyKWh),
        }
      : { waterM3: 0, waterPct: 0, pumpHoursPct: 0, energyPct: 0 },
    stress,
  };
}

function emptyMetrics(): PumpMetrics {
  return { pumpedM3: 0, pumpHours: 0, starts: 0, weakSunHours: 0, overYieldHours: 0, energyKWh: 0 };
}

function metrics(
  frac: number[],
  pumpedM3: number[],
  powerW: number[],
  pvW: number[],
  parcel: ParcelConfig,
): PumpMetrics {
  let starts = 0;
  let weak = 0;
  let over = 0;
  for (let h = 0; h < 24; h++) {
    const on = frac[h] > 0;
    if (on && !(h > 0 && frac[h - 1] > 0)) starts++;
    if (on && pvW[h] < 1.3 * parcel.pump.minStartW) weak += frac[h];
    if (on && pumpedM3[h] / Math.max(frac[h], 1e-9) > parcel.well.safeYieldM3h + 1e-6) over += frac[h];
  }
  return {
    pumpedM3: round(sum(pumpedM3), 1),
    pumpHours: round(sum(frac), 2),
    starts,
    weakSunHours: round(weak, 2),
    overYieldHours: round(over, 2),
    energyKWh: round(sum(powerW.map((p, i) => (p * frac[i]) / 1000)), 2),
  };
}

/**
 * One contiguous block of pumping, grown outward from the strongest allowed hour until `target`
 * m³ fit; the weakest hours at the edges are trimmed so exactly `target` is pumped.
 */
function scheduleBlock(q: number[], target: number, allowed?: boolean[]): number[] {
  const out = new Array<number>(24).fill(0);
  const eff = q.map((v, i) => (allowed && !allowed[i] ? 0 : v));
  if (target <= 0 || sum(eff) <= 0) return out;
  const peak = argmax(eff);
  let lo = peak;
  let hi = peak;
  let total = eff[peak];
  while (total < target) {
    const left = lo > 0 ? eff[lo - 1] : 0;
    const right = hi < 23 ? eff[hi + 1] : 0;
    if (left <= 0 && right <= 0) break;
    if (right >= left) total += eff[++hi];
    else total += eff[--lo];
  }
  let remaining = target;
  for (const h of range(lo, hi).sort((a, b) => eff[b] - eff[a])) {
    const v = Math.min(eff[h], remaining);
    out[h] = v;
    remaining -= v;
  }
  return out;
}

/** The clock window a pumping block occupies (partial edge hours run at their sunniest end). */
function blockWindow(pumped: number[], q: number[], m3: number): Window | null {
  const first = pumped.findIndex((v) => v > 0);
  if (first < 0) return null;
  const last = 23 - [...pumped].reverse().findIndex((v) => v > 0);
  const frac = (h: number) => Math.min(1, pumped[h] / q[h]);
  return first === last
    ? // short run: centre it on its hour
      { start: fmt(first + 0.5 - frac(first) / 2), end: fmt(first + 0.5 + frac(first) / 2), m3: round(m3, 1) }
    : // leading partial hour runs at its end, trailing partial hour at its start
      { start: fmt(first + 1 - frac(first)), end: fmt(last + frac(last)), m3: round(m3, 1) };
}

/** Spread `m3` over hours starting at `startH` at `flow` m³/h; returns the window. */
function fillWindow(arr: number[], startH: number, m3: number, flow: number): Window {
  let remaining = m3;
  let h = startH;
  while (remaining > 1e-9 && h < 24) {
    const v = Math.min(flow, remaining);
    arr[h] += v;
    remaining -= v;
    h++;
  }
  return { start: fmt(startH), end: fmt(startH + m3 / flow), m3: round(m3, 1) };
}

/** Hour float → "HH:MM", rounded to 5 minutes for display. */
function fmt(hourFloat: number): string {
  const total = Math.round((hourFloat * 60) / 5) * 5;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const argmax = (a: number[]) => a.reduce((bi, x, i) => (x > a[bi] ? i : bi), 0);
const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
function round(x: number, d: number) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
