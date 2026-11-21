import type { CropId, CropStage } from "./types";

// FAO Irrigation & Drainage Paper 56 — Table 12 (Kc), Table 22 (Zr, p).
// Root depth for drip-irrigated trees uses the wetted-bulb depth, not the full rooting depth.
export interface CropParams {
  label: string;
  kc: { ini: number; mid: number; end: number };
  rootDepthM: number; // Zr
  depletionP: number; // p — fraction of TAW usable before stress
}

export const CROPS: Record<CropId, CropParams> = {
  citrus: { label: "Citrus (Maltese orange)", kc: { ini: 0.7, mid: 0.65, end: 0.7 }, rootDepthM: 0.8, depletionP: 0.5 },
  olive: { label: "Olive", kc: { ini: 0.65, mid: 0.7, end: 0.7 }, rootDepthM: 1.0, depletionP: 0.65 },
  tomato: { label: "Tomato", kc: { ini: 0.6, mid: 1.15, end: 0.8 }, rootDepthM: 0.7, depletionP: 0.4 },
  pepper: { label: "Pepper", kc: { ini: 0.6, mid: 1.05, end: 0.9 }, rootDepthM: 0.5, depletionP: 0.3 },
};

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

function round(x: number, d: number) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
