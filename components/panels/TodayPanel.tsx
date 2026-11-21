"use client";

import { AlertTriangle, CloudRain, Droplets, Sun, Sprout } from "lucide-react";
import type { DailyPlan } from "@/lib/engine/types";
import { thetaFromPercent } from "@/lib/engine/waterBalance";
import { letItDry, pourWater } from "@/lib/sensor/simulated";
import { useApp } from "@/lib/store";

const REASON: Record<DailyPlan["reason"], string> = {
  soil_ok: "The root zone still holds enough water for today's heat.",
  rain_expected: "Expected rain covers today's crop demand.",
  deficit: "The root zone is below the stress threshold for citrus.",
};

/** The decision — the one thing a farmer needs from the app each morning. */
export function Decision({ plan }: { plan: DailyPlan }) {
  const irrigate = plan.decision === "irrigate";
  const [dawn, dusk] = plan.irrigationWindows;
  return (
    <section aria-labelledby="decision" className="px-4 pt-4 pb-2">
      <p className="text-sm text-ink-soft">Today&apos;s plan · {plan.date}</p>
      <h2 id="decision" className="mt-1 flex items-baseline gap-3">
        {irrigate ? (
          <>
            <span className="text-[44px] leading-none font-semibold tracking-tight tabular">{Math.round(plan.grossM3)} m³</span>
            <span className="text-xl font-medium">to irrigate</span>
          </>
        ) : (
          <span className="text-[34px] leading-tight font-semibold tracking-tight">No irrigation today</span>
        )}
      </h2>
      <p className="mt-2 flex items-start gap-2 text-[15px] leading-snug">
        {plan.reason === "rain_expected" ? (
          <CloudRain size={18} className="mt-0.5 shrink-0 text-water-deep" aria-hidden />
        ) : irrigate ? (
          <Droplets size={18} className="mt-0.5 shrink-0 text-water-deep" aria-hidden />
        ) : (
          <Sprout size={18} className="mt-0.5 shrink-0 text-leaf" aria-hidden />
        )}
        {REASON[plan.reason]}
      </p>
      {plan.stress !== "none" && (
        <p className="mt-2 flex items-center gap-2 text-[15px] font-medium text-alarm">
          <AlertTriangle size={18} aria-hidden />
          {plan.stress === "severe" ? "Trees under severe water stress" : "Trees starting to stress"}
        </p>
      )}

      {irrigate && dawn && dusk && plan.pumpWindow && (
        <ol className="mt-4 grid gap-2 text-[15px]">
          <Step icon={<Droplets size={16} />} time={`${dawn.start}–${dawn.end}`} text={`Drip ${dawn.m3} m³ before sunrise`} tone="water" />
          <Step icon={<Sun size={16} />} time={`${plan.pumpWindow.start}–${plan.pumpWindow.end}`} text={`Pump ${plan.pumpWindow.m3} m³ into the basin at solar peak`} tone="sun" />
          <Step icon={<Droplets size={16} />} time={`${dusk.start}–${dusk.end}`} text={`Drip ${dusk.m3} m³ after sunset`} tone="water" />
        </ol>
      )}
    </section>
  );
}

function Step({ icon, time, text, tone }: { icon: React.ReactNode; time: string; text: string; tone: "sun" | "water" }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${tone === "sun" ? "bg-mark-sun text-paper" : "bg-mark-water text-paper"}`}
        aria-hidden
      >
        {icon}
      </span>
      <span>
        <span className="tabular font-semibold">{time}</span>
        <span className="block text-ink-soft">{text}</span>
      </span>
    </li>
  );
}

export function Savings({ plan }: { plan: DailyPlan }) {
  if (plan.baseline.pumpedM3 <= 0) return null;
  return (
    <section aria-label="Savings" className="mx-4 my-3 border-t border-line pt-3">
      <p className="text-[15px] leading-snug">
        Saves <strong className="tabular text-[22px] font-semibold">{Math.round(plan.savings.waterM3)} m³</strong> of groundwater today —{" "}
        <strong className="tabular font-semibold">{Math.round(plan.savings.waterPct)}% less</strong> than pumping every sunny hour, with{" "}
        <strong className="tabular font-semibold">{Math.round(plan.savings.pumpHoursPct)}% fewer</strong> pump hours.
      </p>
    </section>
  );
}

export function SoilSensor() {
  const soilPct = useApp((s) => s.soilPct);
  const mode = useApp((s) => s.sensorMode);
  const connected = useApp((s) => s.sensorConnected);
  const soil = useApp((s) => s.parcel.soil);
  const setSoilPct = useApp((s) => s.setSoilPct);
  const theta = thetaFromPercent(soilPct, soil);
  const live = mode !== "simulated" && connected;

  return (
    <section aria-labelledby="sensor" className="mx-4 my-3 border-t border-line pt-3">
      <div className="flex items-center justify-between">
        <h3 id="sensor" className="font-semibold">Soil sensor</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${live ? "bg-leaf text-paper" : "bg-line text-ink"}`}>
          {live ? "Live from the field" : "Simulated"}
        </span>
      </div>
      <p className="tabular mt-1 text-[15px]">
        <strong className="text-[22px] font-semibold">{Math.round(soilPct)}%</strong>{" "}
        <span className="text-ink-soft">moisture · θ {theta.toFixed(2)} m³/m³</span>
      </p>
      <label className="mt-2 block">
        <span className="sr-only">Soil moisture reading</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(soilPct)}
          onChange={(e) => setSoilPct(Number(e.target.value), "simulated")}
          className="h-11 w-full accent-[var(--water)]"
          style={{ background: "transparent" }}
          disabled={live}
        />
      </label>
      <div className="-mt-1 flex justify-between text-[12px] text-ink-soft" aria-hidden>
        <span>Dry</span>
        <span>Field capacity</span>
        <span>Saturated</span>
      </div>
      {!live && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={pourWater} className="h-11 rounded-lg bg-water font-medium text-paper">
            Pour water
          </button>
          <button type="button" onClick={letItDry} className="h-11 rounded-lg border border-line bg-paper font-medium">
            Let it dry
          </button>
        </div>
      )}
    </section>
  );
}
