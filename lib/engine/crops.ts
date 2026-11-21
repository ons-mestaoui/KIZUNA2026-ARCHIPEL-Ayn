import type { CropId, CropStage } from "./types";

// FAO Irrigation & Drainage Paper 56 — Table 12 (Kc), Table 11 (stage lengths), Table 22 (Zr, p).
// Root depth for drip-irrigated trees uses the wetted-bulb depth, not the full rooting depth.
export interface CropParams {
  label: string;
  kc: { ini: number; mid: number; end: number };
  rootDepthM: number; // Zr
  depletionP: number; // p — fraction of TAW usable before stress
  annual: boolean;
  /** Annuals: stage lengths in days (initial, development, mid-season, late). */
  stageDays?: [number, number, number, number];
  /** Deciduous perennials: Kc by calendar month, Jan…Dec. */
  seasonalKc?: number[];
}

export const CROPS: Record<CropId, CropParams> = {
  citrus: { label: "Citrus", kc: { ini: 0.7, mid: 0.65, end: 0.7 }, rootDepthM: 0.8, depletionP: 0.5, annual: false },
  olive: { label: "Olive", kc: { ini: 0.65, mid: 0.7, end: 0.7 }, rootDepthM: 1.0, depletionP: 0.65, annual: false },
  datePalm: { label: "Date palm", kc: { ini: 0.9, mid: 0.95, end: 0.95 }, rootDepthM: 1.0, depletionP: 0.5, annual: false },
  grape: {
    label: "Grapevine",
    kc: { ini: 0.3, mid: 0.7, end: 0.45 },
    rootDepthM: 1.0,
    depletionP: 0.4,
    annual: false,
    seasonalKc: [0.2, 0.2, 0.3, 0.45, 0.6, 0.7, 0.7, 0.7, 0.55, 0.45, 0.25, 0.2],
  },
  tomato: { label: "Tomato", kc: { ini: 0.6, mid: 1.15, end: 0.8 }, rootDepthM: 0.7, depletionP: 0.4, annual: true, stageDays: [30, 40, 45, 30] },
  pepper: { label: "Pepper", kc: { ini: 0.6, mid: 1.05, end: 0.9 }, rootDepthM: 0.5, depletionP: 0.3, annual: true, stageDays: [25, 35, 40, 20] },
  potato: { label: "Potato", kc: { ini: 0.5, mid: 1.15, end: 0.75 }, rootDepthM: 0.4, depletionP: 0.35, annual: true, stageDays: [25, 30, 45, 30] },
  watermelon: { label: "Watermelon", kc: { ini: 0.4, mid: 1.0, end: 0.75 }, rootDepthM: 0.8, depletionP: 0.4, annual: true, stageDays: [20, 30, 30, 30] },
};

export const CROP_IDS = Object.keys(CROPS) as CropId[];

export function kcFor(crop: CropId, stage: CropStage): number {
  const { kc } = CROPS[crop];
  switch (stage) {
    case "ini":
      return kc.ini;
    case "dev":
      return round((kc.ini + kc.mid) / 2, 3);
    case "mid":
      return kc.mid;
    case "late":
      return kc.end;
  }
}

const DAY_MS = 86_400_000;
const utc = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS);

/** Kc of an annual crop `age` days after planting (linear ramps through development and late season). */
export function kcAtAge(crop: CropId, age: number): number {
  const p = CROPS[crop];
  const [l1, l2, l3, l4] = p.stageDays!;
  if (age <= l1) return p.kc.ini;
  if (age <= l1 + l2) return round(p.kc.ini + ((age - l1) / l2) * (p.kc.mid - p.kc.ini), 3);
  if (age <= l1 + l2 + l3) return p.kc.mid;
  if (age <= l1 + l2 + l3 + l4) return round(p.kc.mid + ((age - l1 - l2 - l3) / l4) * (p.kc.end - p.kc.mid), 3);
  return p.kc.end;
}

/** Total length of an annual crop's cycle in days (undefined for perennials). */
export const cycleDays = (crop: CropId) => CROPS[crop].stageDays?.reduce((a, b) => a + b, 0);

/**
 * Crop coefficient on a given day:
 *  • deciduous perennials (grape) follow a monthly curve,
 *  • annuals with a planting date follow the FAO-56 stage lengths,
 *  • everything else uses the stage override (default: mid-season).
 */
export function kcOn(date: string, crop: CropId, opts: { plantingDate?: string; stage?: CropStage } = {}): number {
  const p = CROPS[crop];
  if (p.seasonalKc) return p.seasonalKc[Number(date.slice(5, 7)) - 1];
  if (p.stageDays && opts.plantingDate) return kcAtAge(crop, daysBetween(opts.plantingDate, date));
  return kcFor(crop, opts.stage ?? "mid");
}

function round(x: number, d: number) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
