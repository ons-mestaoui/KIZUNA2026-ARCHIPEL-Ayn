"use client";

import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useLang";
import { thetaFromPercent } from "@/lib/engine/waterBalance";
import { letItDry, pourWater } from "@/lib/sensor/simulated";
import { useApp } from "@/lib/store";

/** The demo's stand-in for a soil probe: pour water and the twin, the plan and the numbers react at once. */
export function VirtualSensor() {
  const t = useT();
  const soilPct = useApp((s) => s.soilPct);
  const soil = useApp((s) => s.parcel.soil);
  const setSoilPct = useApp((s) => s.setSoilPct);
  const theta = thetaFromPercent(soilPct, soil);

  return (
    <section aria-labelledby="vsensor" className="mx-4 my-3 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="vsensor" className="font-semibold">
          {t.demo.sensor.title}
        </h3>
        <span className="rounded-full bg-sun/20 px-2.5 py-0.5 text-[12px] font-medium text-sun-deep">{t.demo.sensor.badge}</span>
      </div>
      <p className="mt-1 text-[13px] text-ink-soft">{t.demo.sensor.text}</p>
      <p className="tabular mt-2 text-[15px]" dir="auto">
        <strong className="text-[22px] font-semibold">{fmt(t.demo.sensor.moisture, { pct: Math.round(soilPct) })}</strong>{" "}
        <span className="text-ink-soft">· θ {theta.toFixed(2)} m³/m³</span>
      </p>
      <label className="mt-1 block">
        <span className="sr-only">{t.demo.sensor.reading}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(soilPct)}
          onChange={(e) => setSoilPct(Number(e.target.value), "simulated")}
          className="h-11 w-full accent-[var(--water)]"
          style={{ background: "transparent" }}
        />
      </label>
      <div className="-mt-1 flex justify-between text-[12px] text-ink-soft" aria-hidden>
        <span>{t.demo.sensor.scale.dry}</span>
        <span>{t.demo.sensor.scale.fc}</span>
        <span>{t.demo.sensor.scale.sat}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={pourWater} className="h-12 rounded-xl bg-water font-medium text-paper">
          {t.demo.sensor.pour}
        </button>
        <button type="button" onClick={letItDry} className="h-12 rounded-xl border border-line bg-paper font-medium">
          {t.demo.sensor.dry}
        </button>
      </div>
    </section>
  );
}
