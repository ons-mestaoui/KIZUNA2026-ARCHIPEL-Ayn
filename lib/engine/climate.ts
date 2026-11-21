import { daysBetween } from "./crops";
import type { WeatherScenario } from "./types";

export interface HourInput {
  hour: number;
  time: string;
  et0: number;
  gti: number;
  temp: number;
  precip: number;
}

export { daysBetween };

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** First calendar date covered by the scenario's hourly series. */
export const firstDate = (s: WeatherScenario) => s.hourly.time[0].slice(0, 10);
export const lastDate = (s: WeatherScenario) => s.hourly.time[s.hourly.time.length - 1].slice(0, 10);

export function hasDate(s: WeatherScenario, date: string): boolean {
  return s.hourly.time.some((t) => t.startsWith(date));
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

export interface DayClimate {
  hours: HourInput[];
  et0Day: number; // mm
  rainDay: number; // mm falling on this day
  rain48h: number; // mm over this day and the next
  tmax: number;
}

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

export function dayClimate(s: WeatherScenario, date: string): DayClimate {
  const hours = hoursForDate(s, date);
  const t = s.hourly.time;
  const start = t.findIndex((x) => x.startsWith(date));
  let rain48h = 0;
  for (let i = start + 1; i <= Math.min(start + 48, t.length - 1); i++) rain48h += s.hourly.precip[i] ?? 0;
  return {
    hours,
    et0Day: sum(hours.map((h) => h.et0)),
    rainDay: sum(hours.map((h) => h.precip)),
    rain48h,
    tmax: Math.max(...hours.map((h) => h.temp)),
  };
}
