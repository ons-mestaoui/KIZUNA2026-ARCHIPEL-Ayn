import { cacheLife } from "next/cache";
import { buildField } from "@/lib/field/build";
import type { FieldDTO, LonLat } from "@/lib/field/types";
import { cdse } from "./copernicus";

/**
 * The satellite view of one field, cached per outline: farmers with the same field (and repeat visits) share
 * one set of Copernicus calls. `dayKey` makes the cache roll over at UTC midnight.
 *
 * A bad moment must not be remembered for hours (same rule as lib/server/satellite.ts):
 *   Copernicus unreachable → throw (nothing is cached, the caller shows "could not reach the satellite" and retries)
 *   no clear pass yet, or only a partly clear one → keep it for a few minutes
 *   a clear pass → hours
 */
export async function getField(polygonJson: string, dayKey: string): Promise<FieldDTO> {
  "use cache";
  void dayKey;
  const polygon = JSON.parse(polygonJson) as LonLat[];
  const field = await buildField(cdse(), polygon, { now: new Date(), source: "live" });
  if (field.frames.length > 0 && !field.partial) cacheLife("hours");
  else cacheLife("minutes");
  return field;
}
