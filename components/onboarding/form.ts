import { CROPS } from "@/lib/engine/crops";
import { defaultsFor } from "@/lib/engine/farmParcel";
import type { CropId, IrrigationMethod, LastIrrigated, SoilTexture, WaterSource } from "@/lib/engine/types";
import type { FarmPayload } from "@/lib/farm-schema";
import type { FarmDTO } from "@/lib/farm-types";
import { checkOutline } from "@/lib/field/geo";
import type { LonLat } from "@/lib/field/types";
import type { Dict, Lang } from "@/lib/i18n";

/** Wizard state. Numbers are strings while typing; empty advanced fields fall back to estimates. */
export interface Form {
  name: string;
  lat: number | null;
  lon: number | null;
  placeName: string | null;
  /** The outline of the field, corners in the order they were tapped. Fewer than 3 = still being drawn. */
  polygon: LonLat[] | null;
  crop: CropId;
  plantingDate: string;
  areaHa: string;
  waterSource: WaterSource;
  irrigationMethod: IrrigationMethod;
  basinM3: string;
  pvKWp: string;
  pumpHeadM: string;
  wellSafeYieldM3h: string;
  soilTexture: SoilTexture | "unknown";
  lastIrrigated: LastIrrigated;
}

export const todayISO = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const initialForm = (): Form => ({
  name: "",
  lat: null,
  lon: null,
  placeName: null,
  polygon: null,
  crop: "citrus",
  plantingDate: "", // filled after mount: Date.now() must not run while the page prerenders
  areaHa: "1",
  waterSource: "solar_basin",
  irrigationMethod: "drip",
  basinM3: "",
  pvKWp: "",
  pumpHeadM: "",
  wellSafeYieldM3h: "",
  soilTexture: "unknown",
  lastIrrigated: "unknown",
});

const num = (s: string) => {
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
};

/** The estimates shown as placeholders for fields the farmer leaves empty. */
export const estimates = (f: Form) => defaultsFor(num(f.areaHa) > 0 ? num(f.areaHa) : 1);

export function toPayload(f: Form, lang: Lang, defaultName: string): FarmPayload {
  const d = estimates(f);
  const pick = (s: string, fallback: number) => (s.trim() === "" ? fallback : num(s));
  return {
    name: f.name.trim() || defaultName,
    lat: f.lat ?? 0,
    lon: f.lon ?? 0,
    placeName: f.placeName,
    polygon: f.polygon && f.polygon.length >= 3 ? f.polygon : null,
    crop: f.crop,
    plantingDate: CROPS[f.crop].annual ? f.plantingDate : null,
    areaHa: num(f.areaHa),
    soilTexture: f.soilTexture === "unknown" ? "sandy_loam" : f.soilTexture,
    irrigationMethod: f.irrigationMethod,
    waterSource: f.waterSource,
    basinM3: pick(f.basinM3, d.basinM3),
    pvKWp: pick(f.pvKWp, d.pvKWp),
    pumpHeadM: pick(f.pumpHeadM, d.pumpHeadM),
    wellSafeYieldM3h: pick(f.wellSafeYieldM3h, d.wellSafeYieldM3h),
    lastIrrigated: f.lastIrrigated,
    lang,
  };
}

export function fromFarm(row: FarmDTO): Form {
  return {
    name: row.name,
    lat: row.lat,
    lon: row.lon,
    placeName: row.placeName,
    polygon: (row.polygon as LonLat[] | null) ?? null,
    crop: row.crop as CropId,
    plantingDate: row.plantingDate ?? todayISO(-30),
    areaHa: String(row.areaHa),
    waterSource: row.waterSource as WaterSource,
    irrigationMethod: row.irrigationMethod as IrrigationMethod,
    basinM3: row.basinM3 > 0 ? String(row.basinM3) : "",
    pvKWp: row.pvKWp > 0 ? String(row.pvKWp) : "",
    pumpHeadM: String(row.pumpHeadM),
    wellSafeYieldM3h: String(row.wellSafeYieldM3h),
    soilTexture: row.soilTexture as SoilTexture,
    lastIrrigated: row.lastIrrigated as LastIrrigated,
  };
}

/** Returns an error message for the step, or null when it can continue. */
export function validateStep(step: number, f: Form, t: Dict): string | null {
  const e = t.onboarding.errors;
  if (step === 0) {
    if (f.lat === null || f.lon === null) return e.location;
    const outline = checkOutline(f.polygon);
    if (outline === "incomplete") return e.outlineIncomplete;
    if (outline === "crosses") return e.outlineCrosses;
    if (outline === "size") return e.outlineSize;
  }
  if (step === 1) {
    if (!(num(f.areaHa) >= 0.05)) return e.area;
    if (CROPS[f.crop].annual && !/^\d{4}-\d{2}-\d{2}$/.test(f.plantingDate)) return e.planted;
  }
  if (step === 2) {
    const d = estimates(f);
    const solar = f.waterSource === "solar_basin" || f.waterSource === "solar_direct";
    if (f.waterSource === "solar_basin" && !(f.basinM3.trim() === "" ? d.basinM3 : num(f.basinM3)) ) return e.basin;
    if (solar && !((f.pvKWp.trim() === "" ? d.pvKWp : num(f.pvKWp)) > 0)) return e.pv;
  }
  return null;
}
