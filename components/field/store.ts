"use client";

import { create } from "zustand";

// What the farmer is looking at in the field view. Shared by the 3D hero, the zone card and the timeline, which live
// in different parts of the page.

export type FieldLayer = "zones" | "green" | "water" | "photo";

interface FieldUi {
  layer: FieldLayer;
  /** index into the field's frames; null = the newest */
  frame: number | null;
  /** the selected zone (index into the field's zones), or null */
  zone: number | null;
  setLayer: (layer: FieldLayer) => void;
  setFrame: (frame: number | null) => void;
  selectZone: (zone: number | null) => void;
  reset: () => void;
}

const initial = { layer: "zones" as FieldLayer, frame: null, zone: null };

export const useFieldUi = create<FieldUi>((set) => ({
  ...initial,
  setLayer: (layer) => set({ layer }),
  setFrame: (frame) => set({ frame }),
  selectZone: (zone) => set((s) => ({ zone: s.zone === zone ? null : zone })), // tapping the selected zone again clears it
  reset: () => set(initial),
}));
