import { cacheLife } from "next/cache";
import type { WeatherScenario } from "@/lib/engine/types";
import { fetchScenario } from "./openMeteo";

/**
 * 14 days back + 7 ahead for a farm. Cached per (rounded) location so many farmers near each other —
 * and repeated refreshes — share one Open-Meteo call. `focusDate` is overridden per request by the caller.
 */
export async function getForecast(lat: number, lon: number): Promise<WeatherScenario> {
  "use cache";
  cacheLife("hours");
  return fetchScenario({ lat, lon, pastDays: 14, forecastDays: 7 });
}

/** ~1 km grid: plenty for weather, and it makes neighbouring farms share a cache entry. */
export const gridCoord = (v: number) => Math.round(v * 100) / 100;
