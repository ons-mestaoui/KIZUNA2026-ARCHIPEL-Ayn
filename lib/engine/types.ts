// ─────────────────────────────────────────────────────────────────────────────
// ENGINE CONTRACT (v2). Everything above the engine (API routes, twin, panels) codes against
// these types. v2 adds: water sources, soil textures, depletion-based soil state, per-day limits.
// ─────────────────────────────────────────────────────────────────────────────

export type CropId = "citrus" | "olive" | "datePalm" | "grape" | "tomato" | "pepper" | "potato" | "watermelon";
export type CropStage = "ini" | "dev" | "mid" | "late";
export type ScenarioId = "summer" | "live";

/** Where the irrigation water and its energy come from. */
export type WaterSource =
  | "solar_basin" // PV pump → storage basin → drip/sprinkler (pump at solar peak, irrigate dawn/dusk)
  | "solar_direct" // PV pump straight to the field (no basin): irrigate while the sun shines
  | "grid" // electric pump on the grid
  | "diesel" // diesel/petrol pump
  | "network"; // shared GDA/collective network or canal turn

export type IrrigationMethod = "drip" | "sprinkler" | "surface";
export type SoilTexture = "sand" | "loamy_sand" | "sandy_loam" | "loam" | "clay_loam" | "clay";
/** Result of the farmer's "squeeze test" (a handful of soil from ~20 cm deep). */
export type SoilFeel = "dry" | "moist" | "wet";
export type LastIrrigated = "today" | "1-2d" | "3-5d" | "week+" | "unknown";

/** Hourly weather series, all arrays aligned with `time` (local time of the farm). */
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
  /** Override for the crop stage; perennials default to "mid". Annuals use `plantingDate` instead. */
  stage?: CropStage;
  /** YYYY-MM-DD — annual crops derive their stage (and Kc) from the days since planting. */
  plantingDate?: string;
  soil: {
    texture: string;
    fieldCapacity: number; // θFC m³/m³
    wiltingPoint: number; // θWP m³/m³
    saturation: number; // θsat m³/m³
  };
  irrigation: {
    method: IrrigationMethod;
    efficiency: number; // 0–1 (drip 0.9, sprinkler 0.75, surface 0.6)
    flowM3h: number; // what the field network can deliver per hour
  };
  waterSource: WaterSource;
  basinCapacityM3: number; // solar_basin only
  pv: { kWp: number; systemEfficiency: number; tempCoeff: number }; // solar_* only; tempCoeff per °C (e.g. -0.004)
  pump: { headM: number; efficiency: number; minStartW: number };
  well: { safeYieldM3h: number }; // above this flow → drawdown / dry-run risk
}

/** Root-zone soil state fed to the planner: a measured θ (demo sensor) or an estimated depletion. */
export type SoilState =
  | { theta: number; source: "sensor" | "simulated" | "model" }
  | { depletionMm: number; source: "estimate" | "squeeze" };

export interface HourStep {
  hour: number; // 0–23
  time: string;
  et0: number; // mm
  gti: number; // W/m²
  pvW: number; // available PV DC power (0 for non-solar sources)
  pumpOn: boolean;
  pumpedM3: number;
  irrigating: boolean;
  irrigatedM3: number;
  basinM3: number; // level at END of the hour (0 without a basin)
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

/** What stops the farm from applying everything the crop needs today. */
export type Limiter = "basin" | "pump" | "network";

export interface DailyPlan {
  date: string;
  source: WaterSource;
  decision: "irrigate" | "skip";
  reason: DecisionReason;
  // water balance (mm unless stated)
  et0Day: number;
  kc: number;
  etcDay: number;
  rainDay: number; // rain falling on this day
  rain48h: number; // rain over this day + the next (what the decision counts on)
  effectiveRain: number;
  tawMm: number;
  rawMm: number;
  depletionStartMm: number;
  depletionEndMm: number; // projected end of day without irrigation
  netMm: number;
  grossMm: number;
  grossM3: number; // what the plan actually applies (after limits)
  requestedM3: number; // what the crop needs (before limits)
  limitedBy?: Limiter; // set when grossM3 < requestedM3
  // schedules
  pumpWindow: Window | null;
  irrigationWindows: Window[];
  hours: HourStep[];
  optimized: PumpMetrics;
  baseline: PumpMetrics & { wasteM3: number }; // "pump every sunny hour" habit (solar sources only)
  savings: { waterM3: number; waterPct: number; pumpHoursPct: number; energyPct: number };
  stress: "none" | "mild" | "severe"; // for 3D colour + alerts
}
