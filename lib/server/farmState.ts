import "server-only";
import { and, asc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { estimateDepletion } from "@/lib/engine/balance";
import { addDays, dayClimate, hasDate } from "@/lib/engine/climate";
import type { LastIrrigated, ParcelConfig, SoilFeel } from "@/lib/engine/types";
import { planWeek } from "@/lib/engine/week";
import { parcelFromRow } from "@/lib/farm-parcel";
import type { FarmDTO } from "@/lib/farm-types";
import type { DailySummary, FarmStateDTO } from "@/lib/state-types";
import { getForecast, gridCoord } from "@/lib/weather/forecast";
import { localDate, localHour } from "@/lib/weather/time";

export type FarmRow = typeof schema.farm.$inferSelect;

const r1 = (x: number) => Math.round(x * 10) / 10;

export const toDTO = (row: FarmRow): FarmDTO => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const parcelOf = (row: FarmRow): ParcelConfig => parcelFromRow(row);

/** The farm's forecast scenario, focused on the farm's own "today". */
export async function loadScenario(row: FarmRow, now: Date = new Date()) {
  const sc = await getForecast(gridCoord(row.lat), gridCoord(row.lon));
  const tz = sc.location.tz;
  const today = localDate(now, tz);
  return { scenario: { ...sc, focusDate: today }, tz, today, hour: localHour(now, tz) };
}

/** Farm-local "today" without needing the full state (falls back to UTC if the forecast is down). */
export async function farmToday(row: FarmRow, now: Date = new Date()): Promise<string> {
  try {
    return localDate(now, (await getForecast(gridCoord(row.lat), gridCoord(row.lon))).location.tz);
  } catch {
    return localDate(now, "UTC");
  }
}

export async function loadFarmState(row: FarmRow, now: Date = new Date()): Promise<FarmStateDTO> {
  const parcel = parcelOf(row);
  const { scenario, tz, today, hour } = await loadScenario(row, now);
  const since = addDays(today, -21);

  const [logs, checks] = await Promise.all([
    db
      .select()
      .from(schema.irrigationLog)
      .where(and(eq(schema.irrigationLog.farmId, row.id), gte(schema.irrigationLog.date, since)))
      .orderBy(asc(schema.irrigationLog.id)),
    db
      .select()
      .from(schema.soilCheck)
      .where(and(eq(schema.soilCheck.farmId, row.id), gte(schema.soilCheck.date, since)))
      .orderBy(asc(schema.soilCheck.id)),
  ]);

  const balance = estimateDepletion(parcel, scenario, {
    today,
    anchor: { date: localDate(row.createdAt, tz), lastIrrigated: row.lastIrrigated as LastIrrigated },
    irrigations: logs.map((l) => ({ date: l.date, m3: l.m3 })),
    checks: checks.map((c) => ({ date: c.date, feel: c.feel as SoilFeel })),
  });
  const week = planWeek(parcel, scenario, balance.depletionMm, today, 7);

  const daily: DailySummary[] = [];
  for (let i = -3; i <= 6; i++) {
    const date = addDays(today, i);
    if (!hasDate(scenario, date)) continue;
    const c = dayClimate(scenario, date);
    daily.push({ date, tmax: Math.round(c.tmax * 10) / 10, et0: Math.round(c.et0Day * 10) / 10, rain: Math.round(c.rainDay * 10) / 10 });
  }

  const lastCheck = checks.at(-1);
  return {
    farm: toDTO(row),
    tz,
    today,
    localHour: hour,
    weather: { fetchedAt: scenario.fetchedAt, source: scenario.source },
    depletionMm: r1(balance.depletionMm),
    week: week.map((d) => ({ plan: d.plan, drStart: r1(d.drStart), drAfter: r1(d.drAfter) })),
    daily,
    logsToday: logs.filter((l) => l.date === today).map((l) => ({ id: l.id, m3: l.m3 })),
    lastCheck: lastCheck ? { date: lastCheck.date, feel: lastCheck.feel as SoilFeel } : null,
  };
}
