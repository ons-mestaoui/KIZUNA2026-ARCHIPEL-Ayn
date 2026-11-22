"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import type { DailyPlan, Window } from "@/lib/engine/types";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useLang";
import { useApp } from "@/lib/store";

const W = 240; // viewBox width: 10 units per hour
const H = 62;
const BASE = 42; // baseline of the sun-power area

const toHour = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h + m / 60;
};
const fmtHour = (h: number) => {
  const total = Math.floor(h * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * The day at a glance — and the scrubber for the 3D twin.
 * Gold area = solar power available; gold bar = pumping; turquoise bar = watering.
 * The time axis always runs left to right, in every language.
 */
export function DayRibbon({ plan }: { plan: DailyPlan }) {
  const t = useT();
  const hour = useApp((s) => s.hour);
  const playing = useApp((s) => s.playing);
  const setHour = useApp((s) => s.setHour);
  const setPlaying = useApp((s) => s.setPlaying);
  const box = useRef<HTMLDivElement>(null);

  // Play: the clock runs ~1 h per second. It lives here, not in a 3D view, so Play works whichever view is showing
  // (the diagram or the real field): both read the same clock.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const st = useApp.getState();
      st.setHour(st.hour + (now - last) / 1000);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const solar = plan.source === "solar_basin" || plan.source === "solar_direct";
  const maxPv = Math.max(1, ...plan.hours.map((h) => h.pvW));
  const pts = plan.hours.map((s, i) => `${i * 10 + 5},${BASE - (s.pvW / maxPv) * 34}`);
  const area = `M0,${BASE} L${pts.join(" L")} L${W},${BASE} Z`;

  const idx = Math.min(23, Math.floor(hour));
  const step = plan.hours[idx];
  const prevLevel = idx > 0 ? plan.hours[idx - 1].basinM3 : plan.hours[23].basinM3;
  const basinNow = prevLevel + (step.basinM3 - prevLevel) * (hour - idx); // same interpolation as the 3D twin

  const scrub = useCallback(
    (clientX: number) => {
      const r = box.current!.getBoundingClientRect();
      setPlaying(false);
      setHour(Math.max(0, Math.min(23.99, ((clientX - r.left) / r.width) * 24)));
    },
    [setHour, setPlaying],
  );

  const bar = (w: Window, cls: string, row: number) => {
    const x0 = toHour(w.start) * 10;
    const x1 = Math.max(x0 + 2, toHour(w.end) * 10);
    return <rect key={`${cls}${w.start}`} x={x0} y={BASE + 4 + row * 8} width={x1 - x0} height={6} rx={2} className={cls} />;
  };

  const readout = [
    fmtHour(hour),
    solar ? fmt(t.ribbon.readout.sun, { kw: (step.pvW / 1000).toFixed(1) }) : null,
    step.pumpOn ? fmt(t.ribbon.readout.pumping, { m3: step.pumpedM3.toFixed(0) }) : null,
    step.irrigating ? fmt(t.ribbon.readout.watering, { m3: step.irrigatedM3.toFixed(0) }) : null,
    plan.source === "solar_basin" ? fmt(t.ribbon.readout.basin, { m3: Math.round(basinNow) }) : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={() => setPlaying(!playing)}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-paper"
        aria-label={playing ? t.ribbon.pause : t.ribbon.play}
      >
        {playing ? <Pause size={20} /> : <Play size={20} className="translate-x-px rtl:-translate-x-px" />}
      </button>

      <div className="min-w-0 flex-1">
        {/* readout = the crosshair tooltip for the scrubber */}
        <p className="tabular mb-1 truncate text-[13px] text-ink-soft" aria-live="polite" dir="auto">
          <span className="font-semibold text-ink">{readout[0]}</span>
          {readout.slice(1).map((r) => ` · ${r}`)}
        </p>

        <div
          ref={box}
          dir="ltr"
          role="slider"
          tabIndex={0}
          aria-label={t.ribbon.time}
          aria-valuemin={0}
          aria-valuemax={24}
          aria-valuenow={Math.round(hour * 10) / 10}
          aria-valuetext={fmtHour(hour)}
          className="relative cursor-ew-resize touch-none select-none"
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            scrub(e.clientX);
          }}
          onPointerMove={(e) => e.buttons === 1 && scrub(e.clientX)}
          onKeyDown={(e) => {
            const d = e.key === "ArrowRight" ? 0.25 : e.key === "ArrowLeft" ? -0.25 : 0;
            if (d) {
              e.preventDefault();
              setPlaying(false);
              setHour(hour + d);
            }
          }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-16 w-full">
            {[6, 12, 18].map((h) => (
              <line key={h} x1={h * 10} x2={h * 10} y1={4} y2={BASE} stroke="var(--line)" strokeWidth={0.6} />
            ))}
            {solar && (
              <>
                <path d={area} fill="var(--mark-sun)" fillOpacity={0.22} />
                <polyline points={pts.join(" ")} fill="none" stroke="var(--mark-sun)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
              </>
            )}
            <line x1={0} x2={W} y1={BASE} y2={BASE} stroke="var(--ink-soft)" strokeWidth={0.6} />
            {solar && plan.pumpWindow && bar(plan.pumpWindow, "fill-mark-sun", 0)}
            {plan.irrigationWindows.map((w) => bar(w, "fill-mark-water", solar ? 1 : 0))}
            <line x1={hour * 10} x2={hour * 10} y1={0} y2={H} stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="tabular mt-0.5 flex justify-between text-[11px] text-ink-soft" aria-hidden>
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>24</span>
          </div>
        </div>

        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft">
          {solar && (
            <>
              <li className="flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-sm bg-mark-sun/30 ring-1 ring-mark-sun" /> {t.ribbon.sun}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-sm bg-mark-sun" />
                {plan.pumpWindow ? fmt(t.ribbon.pump, { start: plan.pumpWindow.start, end: plan.pumpWindow.end }) : t.ribbon.pumpOff}
              </li>
            </>
          )}
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-mark-water" />
            {plan.irrigationWindows.length
              ? fmt(t.ribbon.water, { times: plan.irrigationWindows.map((w) => w.start).join(" · ") })
              : t.ribbon.noWater}
          </li>
        </ul>
      </div>
    </div>
  );
}
