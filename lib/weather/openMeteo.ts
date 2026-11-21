import type { HourlyWeather, WeatherScenario } from "@/lib/engine/types";
import { DEMO_LOCATION, PANEL } from "@/lib/engine/parcel";

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

/** Today's forecast for the demo parcel (server-side; no key needed). */
export async function fetchLiveScenario(now: Date): Promise<WeatherScenario> {
  const { lat, lon, tz } = DEMO_LOCATION;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&tilt=${PANEL.tilt}&azimuth=${PANEL.azimuth}&timezone=${encodeURIComponent(tz)}` +
    `&past_days=1&forecast_days=4&hourly=${BASE_VARS},${SOIL_VARS.join(",")}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const j = (await res.json()) as { hourly: OMHourly };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  return {
    id: "live",
    label: `Live forecast · ${today}`,
    location: DEMO_LOCATION,
    panel: PANEL,
    focusDate: today,
    source: "Open-Meteo Forecast API, CC BY 4.0",
    fetchedAt: now.toISOString(),
    hourly: normalize(j.hourly),
  };
}
