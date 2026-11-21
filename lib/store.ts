"use client";

// FROZEN STORE SHAPE (H2) — lanes read/write only through these fields & actions.
import { useMemo } from "react";
import { create } from "zustand";
import summerSnapshot from "@/data/demo/weather-summer.json";
import liveSnapshot from "@/data/demo/weather-live.json";
import { DEFAULT_PARCEL } from "@/lib/engine/parcel";
import { computeDailyPlan } from "@/lib/engine/plan";
import type { DailyPlan, ParcelConfig, ScenarioId, WeatherScenario } from "@/lib/engine/types";
import { thetaFromPercent } from "@/lib/engine/waterBalance";

export type Tab = "today" | "energy" | "leaf" | "satellite";
export type SensorMode = "simulated" | "serial" | "relay";

export interface AppState {
  parcel: ParcelConfig;
  scenarioId: ScenarioId;
  scenarios: Record<ScenarioId, WeatherScenario>;
  liveStatus: "snapshot" | "loading" | "fresh" | "error";

  /** Calibrated soil moisture reading, 0 (dry air) – 100 (in water). */
  soilPct: number;
  sensorMode: SensorMode;
  sensorConnected: boolean;
  lastReadingAt: number | null;

  /** Time of day shown in the twin, 0–24 (float). */
  hour: number;
  playing: boolean;

  /** Offline demo: never call external APIs, use snapshots + cached AI responses. */
  demoMode: boolean;
  tab: Tab;

  setScenario: (id: ScenarioId) => void;
  setLiveScenario: (s: WeatherScenario | null, status: AppState["liveStatus"]) => void;
  setSoilPct: (pct: number, from?: SensorMode) => void;
  setSensor: (mode: SensorMode, connected: boolean) => void;
  setHour: (h: number) => void;
  setPlaying: (p: boolean) => void;
  setDemoMode: (d: boolean) => void;
  setTab: (t: Tab) => void;
}

export const useApp = create<AppState>((set) => ({
  parcel: DEFAULT_PARCEL,
  scenarioId: "summer",
  scenarios: {
    summer: summerSnapshot as unknown as WeatherScenario,
    live: liveSnapshot as unknown as WeatherScenario,
  },
  liveStatus: "snapshot",
  soilPct: 22, // starts dry: the demo opens on a stressed parcel
  sensorMode: "simulated",
  sensorConnected: false,
  lastReadingAt: null,
  hour: 6,
  playing: false,
  demoMode: false,
  tab: "today",

  setScenario: (scenarioId) => set({ scenarioId }),
  setLiveScenario: (s, liveStatus) =>
    set((st) => ({ liveStatus, scenarios: s ? { ...st.scenarios, live: s } : st.scenarios })),
  setSoilPct: (pct, from) =>
    set((st) => ({
      soilPct: Math.min(100, Math.max(0, pct)),
      lastReadingAt: Date.now(),
      sensorMode: from ?? st.sensorMode,
    })),
  setSensor: (sensorMode, sensorConnected) => set({ sensorMode, sensorConnected }),
  setHour: (h) => set({ hour: ((h % 24) + 24) % 24 }),
  setPlaying: (playing) => set({ playing }),
  setDemoMode: (demoMode) => set({ demoMode }),
  setTab: (tab) => set({ tab }),
}));

export const useScenario = () => useApp((s) => s.scenarios[s.scenarioId]);

/** The engine's plan for the current scenario + soil reading. Pure & memoized. */
export function usePlan(): DailyPlan {
  const parcel = useApp((s) => s.parcel);
  const scenario = useScenario();
  const soilPct = useApp((s) => s.soilPct);
  const sensorMode = useApp((s) => s.sensorMode);
  return useMemo(
    () =>
      computeDailyPlan(parcel, scenario, {
        theta: thetaFromPercent(soilPct, parcel.soil),
        source: sensorMode === "simulated" ? "simulated" : "sensor",
      }),
    [parcel, scenario, soilPct, sensorMode],
  );
}
