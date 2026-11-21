// ─────────────────────────────────────────────────────────────────────────────
// FROZEN CONTRACT (H2). The 4 lanes (engine, 3D, AI/voice, sensor) all code
// against these types. Change only with the whole team's agreement.
// ─────────────────────────────────────────────────────────────────────────────

export type CropId = "citrus" | "olive" | "tomato" | "pepper";
export type CropStage = "ini" | "dev" | "mid" | "late";
export type ScenarioId = "summer" | "live";

/** Hourly weather series, all arrays aligned with `time` (local time, Africa/Tunis). */
export interface HourlyWeather {
  time: string[]; // "2026-07-21T13:00"
  temp: number[]; // °C
  rh: number[]; // %
  wind: number[]; // km/h
  et0: number[]; // mm in the preceding hour (FAO-56 Penman-Monteith)
  ghi: number[]; // W/m² global horizontal (shortwave)
  gti: number[]; // W/m² on the PV panel plane (tilt/azimuth below)
  precip: number[]; // mm in the preceding hour
  soilMoisture: (number | null)[]; // m³/m³, weather-model root-zone baseline (NOT parcel truth)
}

export interface WeatherScenario {
  id: ScenarioId;
  label: string; // "Heatwave · 21 Jul 2026"
  location: { lat: number; lon: number; name: string; tz: string };
  panel: { tilt: number; azimuth: number }; // Open-Meteo convention: azimuth 0 = south
  focusDate: string; // YYYY-MM-DD the planner plans for
  source: string; // attribution
  fetchedAt: string; // ISO
  hourly: HourlyWeather;
}

export interface ParcelConfig {
  name: string;
  areaHa: number;
  crop: CropId;
  stage: CropStage;
  soil: {
    texture: string;
    fieldCapacity: number; // θFC m³/m³
    wiltingPoint: number; // θWP m³/m³
    saturation: number; // θsat m³/m³
  };
  irrigation: {
    method: "drip" | "sprinkler" | "surface";
    efficiency: number; // 0–1
    flowM3h: number; // network capacity when irrigating
  };
  basinCapacityM3: number;
  pv: { kWp: number; systemEfficiency: number; tempCoeff: number }; // tempCoeff per °C (e.g. -0.004)
  pump: { headM: number; efficiency: number; minStartW: number };
  well: { safeYieldM3h: number }; // above this flow → drawdown / dry-run risk
}

/** Root-zone soil state fed to the planner. */
export interface SoilState {
  theta: number; // m³/m³
  source: "sensor" | "simulated" | "model";
}

export interface HourStep {
  hour: number; // 0–23
  time: string;
  et0: number; // mm
  gti: number; // W/m²
  pvW: number; // available PV DC power
  pumpOn: boolean;
  pumpedM3: number;
  irrigating: boolean;
  irrigatedM3: number;
  basinM3: number; // level at END of the hour
  overYield: boolean; // pumping faster than the well's safe yield
}

export interface Window {
  start: string; // "05:00"
  end: string; // "07:30"
  m3: number;
}

export type DecisionReason =
  | "soil_ok" // root zone above the stress threshold today
  | "rain_expected" // effective rain covers the deficit
  | "deficit"; // must irrigate

export interface PumpMetrics {
  pumpedM3: number;
  pumpHours: number;
  starts: number;
  weakSunHours: number; // running with PV < 1.3 × start threshold → wear
  overYieldHours: number;
  energyKWh: number;
}

export interface DailyPlan {
  date: string;
  decision: "irrigate" | "skip";
  reason: DecisionReason;
  // water balance (mm unless stated)
  et0Day: number;
  kc: number;
  etcDay: number;
  rainDay: number;
  effectiveRain: number;
  tawMm: number;
  rawMm: number;
  depletionStartMm: number;
  depletionEndMm: number; // projected end of day without irrigation
  netMm: number;
  grossMm: number;
  grossM3: number;
  // schedules
  pumpWindow: Window | null;
  irrigationWindows: Window[];
  hours: HourStep[];
  optimized: PumpMetrics;
  baseline: PumpMetrics & { wasteM3: number }; // "pump every sunny hour" habit
  savings: { waterM3: number; waterPct: number; pumpHoursPct: number; energyPct: number };
  stress: "none" | "mild" | "severe"; // for 3D color + alerts
}
