import { addDays } from "./climate";
import type { WeatherScenario } from "./types";

export interface SynthDay {
  /** Daily ET₀ total, mm. */
  et0: number;
  /** Daily rain total, mm (falls 09:00–12:00). */
  rain?: number;
  /** 0 (overcast, no PV) … 1 (clear sky). */
  sun?: number;
  /** Daily maximum temperature, °C. */
  tmax?: number;
}

/**
 * Deterministic hourly weather for tests: a sine bell between 07:00 and 20:00 shapes ET₀,
 * irradiance and temperature, so physics tests don't depend on a downloaded snapshot.
 */
export function makeScenario(startDate: string, days: SynthDay[], focusIndex = 0): WeatherScenario {
  const time: string[] = [];
  const temp: number[] = [];
  const rh: number[] = [];
  const wind: number[] = [];
  const et0: number[] = [];
  const ghi: number[] = [];
  const gti: number[] = [];
  const precip: number[] = [];
  const soilMoisture: (number | null)[] = [];
  const weights = Array.from({ length: 24 }, (_, h) => (h >= 7 && h <= 20 ? Math.sin((Math.PI * (h - 7)) / 13) : 0));
  const wSum = weights.reduce((a, b) => a + b, 0);

  days.forEach((d, di) => {
    const date = addDays(startDate, di);
    for (let h = 0; h < 24; h++) {
      const w = weights[h];
      time.push(`${date}T${String(h).padStart(2, "0")}:00`);
      et0.push((d.et0 * w) / wSum);
      gti.push(1000 * (d.sun ?? 1) * w);
      ghi.push(900 * (d.sun ?? 1) * w);
      temp.push(22 + ((d.tmax ?? 38) - 22) * w);
      rh.push(40);
      wind.push(10);
      precip.push(d.rain && h >= 9 && h <= 12 ? d.rain / 4 : 0);
      soilMoisture.push(null);
    }
  });

  return {
    id: "summer",
    label: "synthetic",
    location: { lat: 36.68, lon: 10.58, name: "test", tz: "Africa/Tunis" },
    panel: { tilt: 30, azimuth: 0 },
    focusDate: addDays(startDate, focusIndex),
    source: "synthetic test data",
    fetchedAt: "2026-01-01T00:00:00Z",
    hourly: { time, temp, rh, wind, et0, ghi, gti, precip, soilMoisture },
  };
}

/** `n` identical days. */
export const repeat = (n: number, day: SynthDay): SynthDay[] => Array.from({ length: n }, () => ({ ...day }));
