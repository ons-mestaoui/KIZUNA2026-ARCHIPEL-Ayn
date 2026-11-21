import { parcelFromFarm } from "@/lib/engine/farmParcel";
import type { CropId, IrrigationMethod, ParcelConfig, SoilTexture, WaterSource } from "@/lib/engine/types";
import type { FarmDTO } from "./farm-types";

type FarmFields = Pick<
  FarmDTO,
  "name" | "plantingDate" | "areaHa" | "basinM3" | "pvKWp" | "pumpHeadM" | "wellSafeYieldM3h"
> & { crop: string; soilTexture: string; irrigationMethod: string; waterSource: string };

/** A stored farm (DB row or API payload) → the engine's parcel. Works on server and client. */
export const parcelFromRow = (r: FarmFields): ParcelConfig =>
  parcelFromFarm({
    name: r.name,
    crop: r.crop as CropId,
    plantingDate: r.plantingDate,
    areaHa: r.areaHa,
    soilTexture: r.soilTexture as SoilTexture,
    irrigationMethod: r.irrigationMethod as IrrigationMethod,
    waterSource: r.waterSource as WaterSource,
    basinM3: r.basinM3,
    pvKWp: r.pvKWp,
    pumpHeadM: r.pumpHeadM,
    wellSafeYieldM3h: r.wellSafeYieldM3h,
  });
