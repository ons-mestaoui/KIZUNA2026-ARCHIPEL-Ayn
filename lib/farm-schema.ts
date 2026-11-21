import { z } from "zod";
import { CROPS, CROP_IDS } from "@/lib/engine/crops";
import { SOIL_TEXTURES } from "@/lib/engine/soils";
import type { CropId, LastIrrigated, SoilTexture, WaterSource } from "@/lib/engine/types";
import { isSimplePolygon, polygonAreaHa, spanM } from "@/lib/field/geo";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const corner = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** Limits on an outline: what the satellite view can use and what one farm can plausibly be. */
export const POLYGON_LIMITS = { minHa: 0.05, maxHa: 500, maxCorners: 80, maxSpanM: 3000 } as const;
const WATER_SOURCES: [WaterSource, ...WaterSource[]] = ["solar_basin", "solar_direct", "grid", "diesel", "network"];
const LAST: [LastIrrigated, ...LastIrrigated[]] = ["today", "1-2d", "3-5d", "week+", "unknown"];

/** Shared by the wizard (client) and PUT /api/farm (server). userId is never part of it. */
export const farmInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    placeName: z.string().trim().max(120).nullish(),
    crop: z.enum(CROP_IDS as [CropId, ...CropId[]]),
    plantingDate: ymd.nullish(),
    areaHa: z.number().min(0.05).max(500),
    /** the outline of the field, [lon, lat] corners; when present the server takes area and centre from it */
    polygon: z.array(corner).min(3).max(POLYGON_LIMITS.maxCorners).nullish(),
    soilTexture: z.enum(SOIL_TEXTURES as [SoilTexture, ...SoilTexture[]]),
    irrigationMethod: z.enum(["drip", "sprinkler", "surface"]),
    waterSource: z.enum(WATER_SOURCES),
    basinM3: z.number().min(0).max(5000),
    pvKWp: z.number().min(0).max(500),
    pumpHeadM: z.number().min(1).max(300),
    wellSafeYieldM3h: z.number().min(1).max(1000),
    lastIrrigated: z.enum(LAST),
    lang: z.enum(["en", "ar", "ja"]),
  })
  .superRefine((v, ctx) => {
    if (v.polygon) {
      const bad = (message: string) => ctx.addIssue({ code: "custom", path: ["polygon"], message });
      if (!isSimplePolygon(v.polygon)) bad("outline crosses itself");
      else {
        const ha = polygonAreaHa(v.polygon);
        if (ha < POLYGON_LIMITS.minHa || ha > POLYGON_LIMITS.maxHa) bad("outline area out of range");
        if (spanM(v.polygon) > POLYGON_LIMITS.maxSpanM) bad("outline too large");
      }
    }
    if (CROPS[v.crop].annual && !v.plantingDate) ctx.addIssue({ code: "custom", path: ["plantingDate"], message: "planting date required" });
    const solar = v.waterSource === "solar_basin" || v.waterSource === "solar_direct";
    if (solar && v.pvKWp <= 0) ctx.addIssue({ code: "custom", path: ["pvKWp"], message: "panel power required" });
    if (v.waterSource === "solar_basin" && v.basinM3 <= 0) ctx.addIssue({ code: "custom", path: ["basinM3"], message: "basin volume required" });
  });

export type FarmPayload = z.infer<typeof farmInputSchema>;
