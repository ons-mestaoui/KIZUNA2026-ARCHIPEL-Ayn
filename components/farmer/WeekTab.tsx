"use client";

import { CloudRain, Droplets, Sprout, Thermometer } from "lucide-react";
import { motion } from "motion/react";
import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { dayLabel } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useLang, useLocale, useT } from "@/lib/i18n/useLang";
import { limitText, planSteps } from "@/lib/plan-text";
import type { FarmStateDTO } from "@/lib/state-types";
import { MOODS, columnAt, feelFor, moodFor, reservePct, smoothPath, wavePoints } from "./forecast";

// The Week tab, as a forecast card: a sky that follows the weather of the chosen day, the amount of water to give in big
// light type, frosted-glass panels for the plan, the soil and the weather, and a wave through the week (the water left in
// the root zone, day by day) that you can tap or drag along. Motion (design-motion-principles, Jakub first, Emil for the
// frequent part): the first show settles in with a soft focus; picking a day moves the marker on a spring and swaps the
// text in 260 ms; the sky cross-fades slowly; nothing loops; reduced motion removes the movement, keeps the changes.

const WAVE_H = 96;
const LABEL_H = 36;
const VALUE_H = 48;
const EASE = [0.16, 1, 0.3, 1] as const;
const focusIn = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function WeekTab({ state }: { state: FarmStateDTO }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const locale = useLocale();
  const rtl = lang === "ar";
  const crop = t.crops[state.farm.crop as keyof typeof t.crops].toLocaleLowerCase(lang);

  const [sel, setSel] = useState(0);
  const [touched, setTouched] = useState(false); // the first show has its own entrance; after that, picks swap the text
  const [w, setW] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const dragging = useRef(false);

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.week.length]);

  const days = useMemo(
    () =>
      state.week.map(({ plan, drStart }) => {
        const day = state.daily.find((d) => d.date === plan.date);
        return { plan, day, pct: reservePct(drStart, plan.tawMm), mood: moodFor(plan, day), water: plan.grossM3 > 0 };
      }),
    [state.week, state.daily],
  );
  const pts = useMemo(() => wavePoints(days.map((d) => d.pct), w, WAVE_H, 18, rtl), [days, w, rtl]);
  const path = useMemo(() => smoothPath(pts), [pts]);
  const area = useMemo(() => {
    if (pts.length === 0) return "";
    const last = pts[pts.length - 1];
    const [a, b] = rtl ? [w + 40, -40] : [-40, w + 40];
    return `M${a} ${pts[0][1].toFixed(1)} L${path.slice(1)} L${b} ${last[1].toFixed(1)} L${b} ${WAVE_H + 14} L${a} ${WAVE_H + 14} Z`;
  }, [pts, path, rtl, w]);

  if (days.length === 0) return <p className="px-4 py-6 text-ink-soft">{t.week.empty}</p>;

  const i = Math.min(sel, days.length - 1);
  const cur = days[i];
  const { plan, day } = cur;
  const steps = planSteps(plan, t);
  const limit = limitText(plan, t, state.farm.basinM3);
  const feel = feelFor(cur.pct, plan);
  const shift = days.length > 1 ? (i / (days.length - 1) - 0.5) * -26 : 0; // the sky drifts a little as you move through the week
  const m = pts[i];

  const choose = (n: number) => {
    setTouched(true);
    setSel(n);
  };
  const pick = (clientX: number) => {
    const r = strip.current?.getBoundingClientRect();
    if (r) choose(columnAt(clientX, r.left, r.width, days.length, rtl));
  };
  const onKey = (e: KeyboardEvent) => {
    let to = i;
    const dir = rtl ? -1 : 1;
    if (e.key === "ArrowRight") to = i + dir;
    else if (e.key === "ArrowLeft") to = i - dir;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = days.length - 1;
    else return;
    e.preventDefault();
    to = Math.min(days.length - 1, Math.max(0, to));
    choose(to);
    tabs.current[to]?.focus();
  };

  const dateLine = `${i === 0 ? `${t.week.todayLabel} · ` : ""}${dayLabel(plan.date, locale, { weekday: "long", day: "numeric", month: "long" })}`;
  const swap = touched ? { initial: { opacity: 0, y: 8, filter: "blur(4px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" } } : { initial: false as const, animate: { opacity: 1 } };

  return (
    <section aria-labelledby="week" className="px-4 py-4">
      <div className="relative isolate overflow-hidden rounded-[28px] text-white shadow-[0_30px_70px_-34px_rgb(13_23_49/0.7)]">
        {/* the sky: four moods stacked, the right one shown; they cross-fade (a state-driven transition, so a quick pick never jams) */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-night">
          {MOODS.map((mood) => (
            <div
              key={mood}
              className="absolute inset-y-0 -inset-x-8 bg-cover bg-center"
              style={{
                backgroundImage: `url(/media/sky-${mood}.webp)`,
                opacity: cur.mood === mood ? 1 : 0,
                transform: `translateX(${shift}px)`,
                transition: "opacity 700ms cubic-bezier(0.4,0,0.2,1), transform 900ms cubic-bezier(0.16,1,0.3,1)",
              }}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-b from-night/35 via-night/5 to-night/55" />
        </div>

        <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
          <div className="ay-focus flex items-center justify-between gap-3">
            <h2 id="week" className="ay-glass inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[14px] font-medium">
              <Droplets size={15} aria-hidden />
              {t.week.forecast}
            </h2>
            <span className="text-[13px] text-white/85 [text-shadow:0_1px_12px_rgb(0_0_0/0.35)]">{t.week.title}</span>
          </div>

          <div className="ay-focus mt-5 min-h-[17rem] sm:min-h-[15rem]" style={focusIn(90)}>
            <div id="forecast-panel" role="tabpanel" aria-labelledby={`fc-tab-${i}`}>
              <motion.div key={plan.date} {...swap} transition={{ duration: 0.26, ease: EASE }}>
                <p className="text-[14px] text-white/90 [text-shadow:0_1px_12px_rgb(0_0_0/0.35)]">{dateLine}</p>
                <p className="mt-2 flex items-end gap-2 [text-shadow:0_2px_24px_rgb(0_0_0/0.28)]" dir="ltr">
                  <span className="tabular font-display text-[clamp(78px,23vw,132px)] leading-[0.86] font-light tracking-tight">{Math.round(plan.grossM3)}</span>
                  <span className="pb-[0.5em] text-[clamp(18px,5vw,26px)] leading-none font-light">m³</span>
                </p>
                <p className="mt-1 text-[15px] font-medium [text-shadow:0_1px_12px_rgb(0_0_0/0.35)]">{cur.water ? t.week.toWater : t.week.skip}</p>
                <h3 className={`${rtl ? "font-sans" : "font-display"} mt-3 max-w-[16ch] text-[clamp(28px,7.4vw,40px)] leading-[1.06] font-normal tracking-tight [text-shadow:0_2px_24px_rgb(0_0_0/0.3)]`}>{t.week.moods[cur.mood]}</h3>
                <p className="mt-2 max-w-[38ch] text-[15px] leading-snug text-white/92 [text-shadow:0_1px_12px_rgb(0_0_0/0.4)]">{fmt(t.today.reasons[plan.reason], { crop })}</p>
              </motion.div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {(steps.length > 0 || limit) && (
              <motion.div key={`plan-${plan.date}`} {...swap} transition={{ duration: 0.26, ease: EASE, delay: 0.03 }} className="ay-glass ay-focus col-span-2 rounded-[22px] p-4" style={focusIn(170)}>
                <p className="text-[13px] font-medium text-white/80">{t.week.planTitle}</p>
                {steps.length > 0 && (
                  <ul className="mt-2 grid gap-1.5 text-[14.5px] leading-snug">
                    {steps.map((s) => (
                      <li key={s.time + s.text}>
                        <span className="tabular font-semibold" dir="ltr">
                          {s.time}
                        </span>{" "}
                        {s.text}
                      </li>
                    ))}
                  </ul>
                )}
                {limit && <p className="mt-2.5 rounded-xl bg-white/15 px-3 py-2 text-[13.5px] leading-snug">{limit}</p>}
              </motion.div>
            )}

            <div className="ay-glass ay-focus rounded-[22px] p-4" style={focusIn(240)}>
              <p className="text-[13px] font-medium text-white/80">{t.week.reserveTitle}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="tabular font-display text-[30px] leading-none font-light" dir="ltr">
                  {cur.pct}%
                </span>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-[12px] font-semibold text-night">{t.week.feel[feel]}</span>
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/25" dir="ltr" role="img" aria-label={`${cur.pct}%`}>
                <motion.div
                  className={`h-full origin-left rounded-full ${feel === "stress" ? "bg-[#ffb4a0]" : feel === "dry" ? "bg-[#ffd98a]" : "bg-[#9fe8c4]"}`}
                  initial={false}
                  animate={{ scaleX: Math.max(0.02, cur.pct / 100) }}
                  transition={{ type: "spring", duration: 0.5, bounce: 0 }}
                />
              </div>
            </div>

            <div className="ay-glass ay-focus rounded-[22px] p-4" style={focusIn(300)}>
              <p className="text-[13px] font-medium text-white/80">{t.week.weatherTitle}</p>
              <ul className="tabular mt-2 grid gap-1.5 text-[14px]" dir="auto">
                {day && (
                  <li className="flex items-center gap-2">
                    <Thermometer size={15} aria-hidden className="shrink-0 text-white/80" />
                    {fmt(t.today.weather.max, { t: Math.round(day.tmax) })}
                  </li>
                )}
                {day && (
                  <li className="flex items-center gap-2">
                    <CloudRain size={15} aria-hidden className="shrink-0 text-white/80" />
                    {day.rain > 0.1 ? fmt(t.week.rain, { mm: day.rain.toFixed(1) }) : fmt(t.week.rain, { mm: "0" })}
                  </li>
                )}
                {day && (
                  <li className="flex items-center gap-2">
                    <Sprout size={15} aria-hidden className="shrink-0 text-white/80" />
                    {fmt(t.today.weather.et, { mm: day.et0.toFixed(1) })}
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* the week: weekday above, the wave through the days, the water to give below; tap or drag along it */}
        <div className="ay-focus px-2 pb-3 sm:px-4" style={focusIn(380)}>
          <div
            ref={strip}
            role="tablist"
            aria-label={t.week.pick}
            onKeyDown={onKey}
            onPointerDown={(e) => {
              dragging.current = true;
              pick(e.clientX);
            }}
            onPointerMove={(e) => {
              if (dragging.current) pick(e.clientX);
            }}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
            onPointerLeave={() => (dragging.current = false)}
            className="relative grid touch-pan-y select-none"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {w > 0 && (
              <svg aria-hidden width={w} height={WAVE_H} className="pointer-events-none absolute start-0" style={{ top: LABEL_H, overflow: "visible" }}>
                <defs>
                  <linearGradient id="fc-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
                    <stop offset="1" stopColor="#fff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={area} fill="url(#fc-area)" />
                <motion.path
                  d={path}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  style={{ filter: "drop-shadow(0 0 7px rgba(255,255,255,0.55))" }}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
                />
                {pts.map(([x, y], k) => (
                  <circle key={k} cx={x} cy={y} r={days[k].water ? 4.2 : 2.6} fill={days[k].water ? "#8fe3ff" : "#fff"} fillOpacity={days[k].water ? 1 : 0.8} stroke={days[k].water ? "#fff" : "none"} strokeWidth="1.5" />
                ))}
              </svg>
            )}
            {pts.map(([x, y], k) =>
              days[k].water ? (
                <span key={`m3-${k}`} aria-hidden className="tabular pointer-events-none absolute -translate-x-1/2 rounded-full bg-[#1f93b5]/85 px-2 py-0.5 text-[11px] font-semibold text-white" style={{ left: x, top: LABEL_H + y - 31 }}>
                  {Math.round(days[k].plan.grossM3)}
                </span>
              ) : null,
            )}
            {m && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute start-0 size-9"
                style={{ top: LABEL_H }}
                initial={false}
                animate={{ x: rtl ? m[0] - w + 18 : m[0] - 18, y: m[1] - 18 }}
                transition={{ type: "spring", stiffness: 420, damping: 38 }}
              >
                <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.8),rgba(255,255,255,0)_68%)]" />
                <span className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_14px_4px_rgba(255,255,255,0.85)]" />
              </motion.div>
            )}

            {days.map((d, k) => {
              const on = k === i;
              const label = k === 0 ? t.week.todayLabel : dayLabel(d.plan.date, locale, { weekday: "short" });
              return (
                <button
                  key={d.plan.date}
                  ref={(el) => {
                    tabs.current[k] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`fc-tab-${k}`}
                  aria-selected={on}
                  aria-controls="forecast-panel"
                  tabIndex={on ? 0 : -1}
                  aria-label={`${dayLabel(d.plan.date, locale, { weekday: "long", day: "numeric", month: "long" })}: ${d.water ? fmt(t.week.irrigate, { m3: Math.round(d.plan.grossM3) }) : t.week.skip}${d.day ? `, ${fmt(t.today.weather.max, { t: Math.round(d.day.tmax) })}` : ""}`}
                  onClick={() => choose(k)}
                  className="relative z-10 flex flex-col items-center justify-between rounded-2xl py-1 outline-offset-0"
                  style={{ height: LABEL_H + WAVE_H + VALUE_H }}
                >
                  <span className={`text-[13px] transition-colors duration-200 [text-shadow:0_1px_10px_rgb(0_0_0/0.4)] ${on ? "font-semibold text-white" : "text-white/70"}`}>{label}</span>
                  <span className={`tabular flex h-9 items-center text-[15px] transition-colors duration-200 [text-shadow:0_1px_10px_rgb(0_0_0/0.4)] ${on ? "font-semibold text-white" : "text-white/70"}`} aria-hidden>
                    {d.day ? `${Math.round(d.day.tmax)}°` : "–"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-3 px-1 text-[13px] text-ink-soft">{t.week.assumption}</p>
    </section>
  );
}
