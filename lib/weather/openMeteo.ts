import { DEMO_LOCATION } from "@/lib/engine/parcel";
import type { HourlyWeather, WeatherScenario } from "@/lib/engine/types";
import { localDate } from "./time";

const BASE_VARS =
  "temperature_2m,relative_humidity_2m,wind_speed_10m,et0_fao_evapotranspiration,shortwave_radiation,global_tilted_irradiance,precipitation";
const SOIL_VARS = ["soil_moisture_3_to_9cm", "soil_moisture_9_to_27cm"];

type OMHourly = Record<string, (number | null)[]> & { time: string[] };

function normalize(h: OMHourly): HourlyWeather {
  const n = (k: string) => (h[k] ?? []).map((v) => v ?? 0);
  return {
    time: h.time,
    temp: n("temperature_2m"),
    rh: n("relative_humidity_2m"),
    wind: n("wind_speed_10m"),
    et0: n("et0_fao_evapotranspiration"),
    ghi: n("shortwave_radiation"),
    gti: n("global_tilted_irradiance"),
    precip: n("precipitation"),
    soilMoisture: h.time.map((_, i) => {
      const v = SOIL_VARS.map((k) => h[k]?.[i]).filter((x): x is number => typeof x === "number");
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null;
    }),
  };
}

export interface ForecastOptions {
  lat: number;
  lon: number;
  name?: string;
  pastDays?: number;
  forecastDays?: number;
}

/**
 * Hourly weather for any point on Earth from Open-Meteo (no key). Times come back in the point's own
 * time zone (`timezone=auto`). Panels face the equator at a 30° tilt (Open-Meteo: azimuth 0 = south).
 */
export async function fetchScenario(o: ForecastOptions, now: Date = new Date()): Promise<WeatherScenario> {
  const panel = { tilt: 30, azimuth: o.lat >= 0 ? 0 : 180 };
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${o.lat}&longitude=${o.lon}` +
    `&tilt=${panel.tilt}&azimuth=${panel.azimuth}&timezone=auto` +
    `&past_days=${o.pastDays ?? 1}&forecast_days=${o.forecastDays ?? 4}&hourly=${BASE_VARS},${SOIL_VARS.join(",")}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const j = (await res.json()) as { hourly: OMHourly; timezone: string };
  const today = localDate(now, j.timezone);
  return {
    id: "live",
    label: `Forecast · ${today}`,
    location: { lat: o.lat, lon: o.lon, name: o.name ?? `${o.lat.toFixed(2)}, ${o.lon.toFixed(2)}`, tz: j.timezone },
    panel,
    focusDate: today,
    source: "Open-Meteo Forecast API, CC BY 4.0",
    fetchedAt: now.toISOString(),
    hourly: normalize(j.hourly),
  };
}

/** The demo page's "today" scenario (Cap Bon). */
export const fetchLiveScenario = (now: Date) =>
  fetchScenario({ lat: DEMO_LOCATION.lat, lon: DEMO_LOCATION.lon, name: DEMO_LOCATION.name, pastDays: 1, forecastDays: 4 }, now);
