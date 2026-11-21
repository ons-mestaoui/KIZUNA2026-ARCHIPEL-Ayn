// Snapshots Open-Meteo data for the demo parcel into data/demo/ so the demo runs offline.
//   summer: real heatwave day 2026-07-21 (archive API)  ← default demo scenario
//   live:   today's forecast (forecast API)
// Usage: node scripts/snapshot-weather.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOC = { lat: 36.68, lon: 10.58, name: "Cap Bon, Tunisia", tz: "Africa/Tunis" };
const PANEL = { tilt: 30, azimuth: 0 };
const OUT = join(process.cwd(), "data", "demo");
mkdirSync(OUT, { recursive: true });

const common = `latitude=${LOC.lat}&longitude=${LOC.lon}&tilt=${PANEL.tilt}&azimuth=${PANEL.azimuth}&timezone=${encodeURIComponent(LOC.tz)}`;
const base = "temperature_2m,relative_humidity_2m,wind_speed_10m,et0_fao_evapotranspiration,shortwave_radiation,global_tilted_irradiance,precipitation";

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

function normalize(j, soilKeys) {
  const h = j.hourly;
  return {
    time: h.time,
    temp: h.temperature_2m,
    rh: h.relative_humidity_2m,
    wind: h.wind_speed_10m,
    et0: h.et0_fao_evapotranspiration,
    ghi: h.shortwave_radiation,
    gti: h.global_tilted_irradiance,
    precip: h.precipitation,
    soilMoisture: h.time.map((_, i) => {
      const v = soilKeys.map((k) => h[k]?.[i]).filter((x) => typeof x === "number");
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null;
    }),
  };
}

// ── Summer heatwave (archive) ───────────────────────────────────────────────
{
  const soil = ["soil_moisture_0_to_7cm", "soil_moisture_7_to_28cm"];
  const j = await get(
    `https://archive-api.open-meteo.com/v1/archive?${common}&start_date=2026-07-19&end_date=2026-07-23&hourly=${base},${soil.join(",")}`,
  );
  const scenario = {
    id: "summer",
    label: "Heatwave · 21 Jul 2026",
    location: LOC,
    panel: PANEL,
    focusDate: "2026-07-21",
    source: "Open-Meteo Historical Weather API (ERA5 reanalysis), CC BY 4.0",
    fetchedAt: new Date().toISOString(),
    hourly: normalize(j, soil),
  };
  writeFileSync(join(OUT, "weather-summer.json"), JSON.stringify(scenario));
  console.log("summer:", scenario.hourly.time.length, "hours");
}

// ── Live forecast ───────────────────────────────────────────────────────────
{
  const soil = ["soil_moisture_3_to_9cm", "soil_moisture_9_to_27cm"];
  const j = await get(
    `https://api.open-meteo.com/v1/forecast?${common}&past_days=1&forecast_days=4&hourly=${base},${soil.join(",")}`,
  );
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: LOC.tz }).format(new Date());
  const scenario = {
    id: "live",
    label: `Live forecast · ${today}`,
    location: LOC,
    panel: PANEL,
    focusDate: today,
    source: "Open-Meteo Forecast API, CC BY 4.0",
    fetchedAt: new Date().toISOString(),
    hourly: normalize(j, soil),
  };
  writeFileSync(join(OUT, "weather-live.json"), JSON.stringify(scenario));
  console.log("live:", scenario.hourly.time.length, "hours, focus", today);
}
