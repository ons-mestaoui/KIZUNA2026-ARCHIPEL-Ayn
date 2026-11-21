import { CROPS, kcFor } from "./crops";
import { pumpFlowM3h, pvPowerW } from "./solarPump";
import type {
  DailyPlan,
  DecisionReason,
  HourStep,
  ParcelConfig,
  PumpMetrics,
  SoilState,
  WeatherScenario,
  Window,
} from "./types";
import { clamp, depletionFromTheta, effectiveRain, mmToM3, totalAvailableWater } from "./waterBalance";

const DAWN_START_H = 5;
const DUSK_START_H = 19;
const DAWN_SHARE = 0.4;
const RECOVERY_CAP = 1.2; // max daily net application as a multiple of ETc (drip can't refill the whole root zone in a day)
const MIN_NET_MM = 0.5;

interface HourInput {
  hour: number;
  time: string;
  et0: number;
  gti: number;
  temp: number;
  precip: number;
}

/**
 * Open-Meteo hourly values are "preceding hour" sums/means, so the hour h:00–h+1:00
 * is described by the value stamped (h+1):00.
 */
export function hoursForDate(s: WeatherScenario, date: string): HourInput[] {
  const t = s.hourly.time;
  const start = t.findIndex((x) => x.startsWith(date));
  if (start < 0) throw new Error(`Date ${date} not in scenario ${s.id}`);
  const out: HourInput[] = [];
  for (let h = 0; h < 24; h++) {
    const i = Math.min(start + h + 1, t.length - 1);
    out.push({
      hour: h,
      time: `${date}T${String(h).padStart(2, "0")}:00`,
      et0: s.hourly.et0[i] ?? 0,
      gti: s.hourly.gti[i] ?? 0,
      temp: s.hourly.temp[i] ?? 25,
      precip: s.hourly.precip[i] ?? 0,
    });
  }
  return out;
}

/** Rain over the focus day and the next day (what the farmer can count on). */
function rainNext48h(s: WeatherScenario, date: string): number {
  const t = s.hourly.time;
  const start = t.findIndex((x) => x.startsWith(date));
  let sum = 0;
  for (let i = start + 1; i <= Math.min(start + 48, t.length - 1); i++) sum += s.hourly.precip[i] ?? 0;
  return sum;
}

export function computeDailyPlan(
  parcel: ParcelConfig,
  scenario: WeatherScenario,
  soil: SoilState,
  date: string = scenario.focusDate,
): DailyPlan {
  const crop = CROPS[parcel.crop];
  const hours = hoursForDate(scenario, date);

  // ── Water balance ────────────────────────────────────────────────────────
  const et0Day = sum(hours.map((h) => h.et0));
  const kc = kcFor(parcel.crop, parcel.stage);
  const etcDay = kc * et0Day;
  const rainDay = rainNext48h(scenario, date);
  const pe = effectiveRain(rainDay);
  const taw = totalAvailableWater(parcel.soil, crop.rootDepthM);
  const raw = crop.depletionP * taw;
  const drStart = depletionFromTheta(soil.theta, parcel.soil, crop.rootDepthM);
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

  // ── Solar power & pump capacity per hour ─────────────────────────────────
  const pvW = hours.map((h) => pvPowerW(h.gti, h.temp, parcel.pv));
  const qRaw = pvW.map((p) => pumpFlowM3h(p, parcel.pump));
  const qOpt = qRaw.map((q) => Math.min(q, parcel.well.safeYieldM3h)); // VFD caps flow at the well's safe yield
  const dayPumpCapacity = sum(qOpt);

  let grossMm = netMm / parcel.irrigation.efficiency;
  let grossM3 = mmToM3(grossMm, parcel.areaHa);
  const maxM3 = Math.min(parcel.basinCapacityM3, dayPumpCapacity);
  if (grossM3 > maxM3) {
    grossM3 = maxM3;
    grossMm = grossM3 / (parcel.areaHa * 10);
  }
  if (decision === "skip") {
    grossM3 = 0;
    grossMm = 0;
  }

  // ── Irrigation (drip, from basin, dawn + dusk) ───────────────────────────
  const dawnM3 = grossM3 * DAWN_SHARE;
  const duskM3 = grossM3 - dawnM3;
  const irrigated = new Array(24).fill(0);
  const irrigationWindows: Window[] = [];
  if (grossM3 > 0) {
    irrigationWindows.push(fillWindow(irrigated, DAWN_START_H, dawnM3, parcel.irrigation.flowM3h));
    irrigationWindows.push(fillWindow(irrigated, DUSK_START_H, duskM3, parcel.irrigation.flowM3h));
  }

  // ── Pumping: one contiguous block grown from the solar peak ──────────────
  // Steady state: the basin starts with yesterday's dawn share; today we pump today's dusk
  // share + tomorrow's dawn share = grossM3.
  const pumped = new Array(24).fill(0);
  let pumpWindow: Window | null = null;
  if (grossM3 > 0) {
    const peak = argmax(qOpt);
    let lo = peak;
    let hi = peak;
    let total = qOpt[peak];
    while (total < grossM3) {
      const left = lo > 0 ? qOpt[lo - 1] : 0;
      const right = hi < 23 ? qOpt[hi + 1] : 0;
      if (left <= 0 && right <= 0) break;
      if (right >= left) total += qOpt[++hi];
      else total += qOpt[--lo];
    }
    // fill the block, trimming the weakest edge hour so we pump exactly grossM3
    let remaining = grossM3;
    const order = range(lo, hi).sort((a, b) => qOpt[b] - qOpt[a]);
    for (const h of order) {
      const v = Math.min(qOpt[h], remaining);
      pumped[h] = v;
      remaining -= v;
    }
    const first = pumped.findIndex((v) => v > 0);
    const last = 23 - [...pumped].reverse().findIndex((v) => v > 0);
    const frac = (h: number) => pumped[h] / qOpt[h];
    pumpWindow =
      first === last
        ? // short run: centre it on the sunniest hour
          { start: fmt(first + 0.5 - frac(first) / 2), end: fmt(first + 0.5 + frac(first) / 2), m3: round(grossM3, 1) }
        : // leading partial hour runs at its end, trailing partial hour at its start
          { start: fmt(first + 1 - frac(first)), end: fmt(last + frac(last)), m3: round(grossM3, 1) };
  }

  // ── Basin simulation ─────────────────────────────────────────────────────
  let basin = grossM3 > 0 ? dawnM3 : parcel.basinCapacityM3 * 0.25;
  const steps: HourStep[] = hours.map((h, i) => {
    basin = clamp(basin + pumped[i] - irrigated[i], 0, parcel.basinCapacityM3);
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

  // ── Metrics: optimized vs. "pump every sunny hour" habit ─────────────────
  const optimized = metrics(
    pumped.map((v, i) => (qOpt[i] > 0 ? v / qOpt[i] : 0)), // fraction of the hour running
    pumped,
    pvW.map((p, i) => (qRaw[i] > 0 ? (p * qOpt[i]) / qRaw[i] : 0)), // capped flow → proportionally less power
    pvW,
    parcel,
  );
  const baselineFrac = qRaw.map((q) => (q > 0 ? 1 : 0));
  const baseline = metrics(baselineFrac, qRaw, pvW, pvW, parcel);
  const wasteM3 = Math.max(0, baseline.pumpedM3 - grossM3);
  const pct = (a: number, b: number) => (b > 0 ? round((100 * (b - a)) / b, 1) : 0);

  const stress: DailyPlan["stress"] = drStart > 0.8 * taw ? "severe" : drStart > raw ? "mild" : "none";

  return {
    date,
    decision,
    reason,
    et0Day: round(et0Day, 2),
    kc,
    etcDay: round(etcDay, 2),
    rainDay: round(rainDay, 1),
    effectiveRain: round(pe, 1),
    tawMm: round(taw, 1),
    rawMm: round(raw, 1),
    depletionStartMm: round(drStart, 1),
    depletionEndMm: round(drEnd, 1),
    netMm: round(netMm, 2),
    grossMm: round(grossMm, 2),
    grossM3: round(grossM3, 1),
    pumpWindow,
    irrigationWindows,
    hours: steps,
    optimized,
    baseline: { ...baseline, wasteM3: round(wasteM3, 1) },
    savings: {
      waterM3: round(baseline.pumpedM3 - optimized.pumpedM3, 1),
      waterPct: pct(optimized.pumpedM3, baseline.pumpedM3),
      pumpHoursPct: pct(optimized.pumpHours, baseline.pumpHours),
      energyPct: pct(optimized.energyKWh, baseline.energyKWh),
    },
    stress,
  };
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
