import type { DailyPlan, SoilFeel } from "@/lib/engine/types";
import type { FarmDTO } from "@/lib/farm-types";

export interface DailySummary {
  date: string;
  tmax: number; // °C
  et0: number; // mm
  rain: number; // mm
}

/** Everything the farmer screens need, computed on the server by the engine. */
export interface FarmStateDTO {
  farm: FarmDTO;
  farms?: FarmDTO[];
  tz: string;
  today: string; // farm-local YYYY-MM-DD
  localHour: number; // farm-local hour of day, fractional
  weather: { fetchedAt: string; source: string };
  /** Root-zone depletion this morning (mm), after anything already watered today. */
  depletionMm: number;
  week: { plan: DailyPlan; drStart: number; drAfter: number }[];
  daily: DailySummary[]; // a few days back + the forecast
  logsToday: { id: number; m3: number }[];
  lastCheck: { date: string; feel: SoilFeel } | null;
}
