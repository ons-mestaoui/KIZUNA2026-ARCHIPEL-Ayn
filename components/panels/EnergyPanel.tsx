"use client";

import { useState } from "react";
import type { DailyPlan } from "@/lib/engine/types";
import { useApp } from "@/lib/store";
import { pumpFlowM3h } from "@/lib/engine/solarPump";

const W = 240;
const H = 110;
const TOP = 8;
const BASE = 96;

/** Hourly pumping: Goutte d'Or plan vs. the "pump every sunny hour" habit. One axis (m³). */
export function EnergyPanel({ plan }: { plan: DailyPlan }) {
  const parcel = useApp((s) => s.parcel);
  const [hover, setHover] = useState<number | null>(null);
  const baseline = plan.hours.map((h) => pumpFlowM3h(h.pvW, parcel.pump));
  const max = Math.max(...baseline, parcel.well.safeYieldM3h, 1);
  const y = (v: number) => BASE - (v / max) * (BASE - TOP);
  const yieldY = y(parcel.well.safeYieldM3h);
  const hv = hover ?? null;

  return (
    <section aria-labelledby="energy" className="px-4 py-4">
      <h2 id="energy" className="text-lg font-semibold">Pumping, hour by hour</h2>
      <p className="mt-1 text-[14px] text-ink-soft">
        Water pumped each hour (m³). The plan pumps only what the crop needs, at the sunniest hours, and never faster than the well can recharge.
      </p>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-3 rounded-sm bg-mark-ghost" />Pumping every sunny hour</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-3 rounded-sm bg-mark-sun" />Goutte d&apos;Or plan</li>
        <li className="flex items-center gap-1.5"><span className="h-0 w-3 border-t-2 border-dashed border-alarm" />Well safe yield</li>
      </ul>

      <div className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Hourly pumping chart, plan versus habit">
          {[0.5, 1].map((k) => (
            <line key={k} x1={0} x2={W} y1={y(max * k)} y2={y(max * k)} stroke="var(--line)" strokeWidth={0.5} />
          ))}
          {plan.hours.map((h, i) => {
            const x = i * 10;
            const b = baseline[i];
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={x} y={0} width={10} height={H} fill="transparent" />
                {b > 0 && <rect x={x + 1} y={y(b)} width={8} height={BASE - y(b)} rx={1.5} fill="var(--mark-ghost)" />}
                {h.pumpedM3 > 0 && (
                  <rect x={x + 2.5} y={y(h.pumpedM3)} width={5} height={BASE - y(h.pumpedM3)} rx={1.5} fill="var(--mark-sun)" stroke="var(--paper)" strokeWidth={0.6} />
                )}
              </g>
            );
          })}
          <line x1={0} x2={W} y1={yieldY} y2={yieldY} stroke="var(--alarm)" strokeWidth={0.8} strokeDasharray="3 2" />
          <line x1={0} x2={W} y1={BASE} y2={BASE} stroke="var(--ink-soft)" strokeWidth={0.6} />
          {[0, 6, 12, 18].map((h) => (
            <text key={h} x={h * 10 + 1} y={H - 2} fontSize={7} fill="var(--ink-soft)">{String(h).padStart(2, "0")}h</text>
          ))}
          <text x={W - 1} y={y(max) - 1.5} fontSize={7} textAnchor="end" fill="var(--ink-soft)">{Math.round(max)} m³/h</text>
        </svg>
        {hv !== null && (
          <div
            className="tabular pointer-events-none absolute top-0 rounded-md bg-ink px-2 py-1 text-[12px] text-paper shadow"
            style={{ left: `${Math.min(80, (hv / 24) * 100)}%` }}
          >
            {String(hv).padStart(2, "0")}:00 · habit {baseline[hv].toFixed(1)} m³ · plan {plan.hours[hv].pumpedM3.toFixed(1)} m³
          </div>
        )}
      </div>

      <table className="tabular mt-4 w-full text-[14px]">
        <caption className="sr-only">Daily pump metrics, plan versus habit</caption>
        <thead>
          <tr className="text-left text-[12px] text-ink-soft">
            <th className="py-1 font-normal">Today</th>
            <th className="py-1 text-right font-normal">Every sunny hour</th>
            <th className="py-1 text-right font-normal">Goutte d&apos;Or</th>
          </tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-1.5">
          <Row label="Water pumped" a={`${plan.baseline.pumpedM3} m³`} b={`${plan.optimized.pumpedM3} m³`} />
          <Row label="Pump running" a={`${plan.baseline.pumpHours} h`} b={`${plan.optimized.pumpHours} h`} />
          <Row label="Solar energy used" a={`${plan.baseline.energyKWh} kWh`} b={`${plan.optimized.energyKWh} kWh`} />
          <Row label="Above well safe yield" a={`${plan.baseline.overYieldHours} h`} b={`${plan.optimized.overYieldHours} h`} />
          <Row label="Running in weak sun" a={`${plan.baseline.weakSunHours} h`} b={`${plan.optimized.weakSunHours} h`} />
        </tbody>
      </table>
      <p className="mt-2 text-[13px] text-ink-soft">
        Fewer hours, no weak-sun starts and no over-pumping mean less wear on the pump and less stress on the aquifer.
      </p>
    </section>
  );
}

function Row({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="text-right text-ink-soft">{a}</td>
      <td className="text-right font-semibold">{b}</td>
    </tr>
  );
}
