"use client";

import { CloudRain, Droplets, Sprout, Thermometer } from "lucide-react";
import { motion } from "motion/react";
import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { dayLabel } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useLang, useLocale, useT } from "@/lib/i18n/useLang";
import { limitText, planSteps } from "@/lib/plan-text";
import type { FarmStateDTO } from "@/lib/state-types";
import { MOODS, type Mood, columnAt, feelFor, moodFor, reservePct, smoothPath, wavePoints } from "./forecast";

// The Week tab, as a forecast card: a sky that follows the weather of the chosen day, the amount of water to give in big
// light type, frosted-glass panels for the plan, the soil and the weather, and a wave through the week (the water left in
// the root zone, day by day) that you can tap or drag along. On a phone it is a tall card; on a desktop it spreads across the
// page (text and sun on the left, the glass panels on the right, the week along the bottom) with landscape skies.
// Motion (design-motion-principles, Jakub first, Emil for the frequent part): the first show settles in with a soft focus;
// picking a day moves the marker on a spring and swaps the text in 260 ms; the sky cross-fades slowly; the cloud bank drifts
// a few percent over a minute and a half; reduced motion removes the movement and keeps the changes.

const WAVE_H = 96; // phone
const WAVE_H_WIDE = 128; // desktop
const LABEL_H = 36;
const VALUE_H = 48;
const EASE = [0.16, 1, 0.3, 1] as const;

/** Where the sun is and how it looks in each weather (on a phone, and on a wide card). The stormy sky has none. */
const SUNS: Record<Mood, { x: number; y: number; size: number; xl: number; yl: number; sl: number; core: string; mid: string } | null> = {
  calm: { x: 77, y: 15, size: 340, xl: 55, yl: 24, sl: 520, core: "#fffdf0", mid: "255,238,170" },
  warm: { x: 78, y: 27, size: 420, xl: 57, yl: 38, sl: 640, core: "#fff1cc", mid: "255,196,110" },
  hot: { x: 70, y: 38, size: 520, xl: 58, yl: 46, sl: 760, core: "#ffdf9c", mid: "255,150,45" },
  storm: null,
};
const focusIn = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const slide = "transform 900ms cubic-bezier(0.16,1,0.3,1)";

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
  const waveH = w >= 720 ? WAVE_H_WIDE : WAVE_H;

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
  const pts = useMemo(() => wavePoints(days.map((d) => d.pct), w, waveH, 18, rtl), [days, w, waveH, rtl]);
  const path = useMemo(() => smoothPath(pts), [pts]);
  const area = useMemo(() => {
    if (pts.length === 0) return "";
    const last = pts[pts.length - 1];
    const [a, b] = rtl ? [w + 40, -40] : [-40, w + 40];
    return `M${a} ${pts[0][1].toFixed(1)} L${path.slice(1)} L${b} ${last[1].toFixed(1)} L${b} ${waveH + 14} L${a} ${waveH + 14} Z`;
  }, [pts, path, rtl, w, waveH]);

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
    <section aria-labelledby="week" className="px-4 py-4 lg:px-8 lg:py-6">
      <div className="relative isolate flex flex-col overflow-hidden rounded-[28px] text-white shadow-[0_30px_70px_-34px_rgb(13_23_49/0.7)] lg:min-h-[calc(100svh-14.5rem)] lg:rounded-[36px]">
        {/* the sky: for each mood a painted sky, a sun, and a bank of cloud in front that drifts very slowly (a tall set for phones, a
            landscape set for a desktop). Only the right mood is shown; they cross-fade (a state-driven transition, so a quick pick never
            jams) and slide a little as the day changes */}
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden bg-night">
          {MOODS.map((mood) => {
            const on = cur.mood === mood;
            const sun = SUNS[mood];
            return (
              <div key={mood} className="absolute inset-0" style={{ opacity: on ? 1 : 0, transition: "opacity 800ms cubic-bezier(0.4,0,0.2,1)" }}>
                <div className="absolute inset-0 lg:hidden">
                  <div className="absolute inset-y-0 -inset-x-8 bg-cover bg-top" style={{ backgroundImage: `url(/media/sky-${mood}.webp)`, transform: `translateX(${shift}px)`, transition: slide }} />
                </div>
                <div className="absolute inset-0 hidden lg:block">
                  <div className="absolute inset-y-0 -inset-x-12 bg-cover bg-top" style={{ backgroundImage: `url(/media/sky-${mood}-wide.webp)`, transform: `translateX(${shift}px)`, transition: slide }} />
                </div>
                {sun && (
                  <div
                    className="ay-sun absolute"
                    style={
                      {
                        "--sx": `${sun.x}%`,
                        "--sy": `${sun.y}%`,
                        "--ss": `${sun.size}px`,
                        "--sx-lg": `${sun.xl}%`,
                        "--sy-lg": `${sun.yl}%`,
                        "--ss-lg": `${sun.sl}px`,
                        "--sun-core": sun.core,
                        "--sun-mid": sun.mid,
                        transform: `translate(-50%, -50%) translateX(${shift * 0.6}px)`,
                        transition: slide,
                      } as CSSProperties
                    }
                  />
                )}
                <div className="absolute inset-x-0 bottom-[43%] lg:hidden" style={{ transform: `translateX(${shift * 1.5}px)`, transition: slide }}>
                  <div
                    className="ay-drift relative -inset-x-[20%] w-[140%] bg-contain bg-bottom bg-no-repeat sm:-inset-x-[8%] sm:w-[116%]"
                    style={{ backgroundImage: `url(/media/cloud-${mood}.webp)`, aspectRatio: "1400 / 640" }}
                  />
                </div>
                <div className="absolute inset-x-0 bottom-[10%] hidden lg:block [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.35)_26%,#000_52%)] rtl:[mask-image:linear-gradient(to_left,transparent_0%,rgba(0,0,0,0.35)_26%,#000_52%)]" style={{ transform: `translateX(${shift * 1.5}px)`, transition: slide }}>
                  <div
                    className="ay-drift relative -inset-x-[6%] w-[112%] bg-contain bg-bottom bg-no-repeat"
                    style={{ backgroundImage: `url(/media/cloud-${mood}-wide.webp)`, aspectRatio: "2400 / 560" }}
                  />
                </div>
              </div>
            );
          })}
          <div className="absolute inset-0 bg-gradient-to-b from-night/30 via-transparent to-night/30" />
          <div className="absolute inset-0 hidden bg-gradient-to-r from-night/35 via-night/10 to-transparent lg:block rtl:bg-gradient-to-l" />
        </div>

        <div className="flex-1 px-4 pt-4 pb-3 sm:px-6 sm:pt-5 lg:px-10 lg:pt-8 lg:pb-6">
          <div className="ay-focus flex items-center justify-between gap-3">
            <h2 id="week" className="ay-glass inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[14px] font-medium lg:h-11 lg:px-5 lg:text-[16px]">
              <Droplets size={15} aria-hidden />
              {t.week.forecast}
            </h2>
            <span className="text-[13px] text-white/85 [text-shadow:0_1px_12px_rgb(0_0_0/0.35)] lg:text-[15px]">{t.week.title}</span>
          </div>

          <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start lg:gap-12">
            <div className="ay-focus mt-5 min-h-[21rem] sm:min-h-[18rem] lg:mt-0 lg:min-h-[21rem]" style={focusIn(90)}>
              <div id="forecast-panel" role="tabpanel" aria-labelledby={`fc-tab-${i}`}>
                <motion.div key={plan.date} {...swap} transition={{ duration: 0.26, ease: EASE }}>
                  <p className="text-[14px] text-white/90 [text-shadow:0_1px_12px_rgb(0_0_0/0.35)] lg:text-[17px]">{dateLine}</p>
                  <p className="mt-2 flex items-end gap-2 [text-shadow:0_2px_24px_rgb(0_0_0/0.28)] lg:mt-3 lg:gap-3" dir="ltr">
                    <span className="tabular font-display text-[clamp(78px,23vw,132px)] leading-[0.86] font-light tracking-tight lg:text-[clamp(130px,11vw,210px)]">{Math.round(plan.grossM3)}</span>
                    <span className="pb-[0.5em] text-[clamp(18px,5vw,26px)] leading-none font-light lg:text-[clamp(28px,2.4vw,42px)]">m³</span>
                  </p>
                  <p className="mt-1 text-[15px] font-medium [text-shadow:0_1px_12px_rgb(0_0_0/0.35)] lg:mt-2 lg:text-[18px]">{cur.water ? t.week.toWater : t.week.skip}</p>
                  <h3
                    className={`${rtl ? "font-sans" : "font-display"} mt-3 max-w-[16ch] text-[clamp(28px,7.4vw,40px)] leading-[1.06] font-normal tracking-tight [text-shadow:0_2px_24px_rgb(0_0_0/0.3)] lg:mt-6 lg:max-w-[14ch] lg:text-[clamp(46px,4.2vw,74px)]`}
                  >
                    {t.week.moods[cur.mood]}
                  </h3>
                  <p className="mt-2 max-w-[38ch] text-[15px] leading-snug text-white/92 [text-shadow:0_1px_12px_rgb(0_0_0/0.4)] lg:mt-4 lg:max-w-[42ch] lg:text-[18px]">
                    {fmt(t.today.reasons[plan.reason], { crop })}
                  </p>
                </motion.div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:mt-0 lg:gap-4">
              {(steps.length > 0 || limit) && (
                <motion.div key={`plan-${plan.date}`} {...swap} transition={{ duration: 0.26, ease: EASE, delay: 0.03 }} className="ay-glass ay-focus col-span-2 rounded-[22px] p-4 lg:rounded-[26px] lg:p-6" style={focusIn(170)}>
                  <p className="text-[13px] font-medium text-white/80 lg:text-[14px]">{t.week.planTitle}</p>
                  {steps.length > 0 && (
                    <ul className="mt-2 grid gap-1.5 text-[14.5px] leading-snug lg:mt-3 lg:gap-2.5 lg:text-[16.5px]">
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
                  {limit && <p className="mt-2.5 rounded-xl bg-white/15 px-3 py-2 text-[13.5px] leading-snug lg:text-[15px]">{limit}</p>}
                </motion.div>
              )}

              <div className="ay-glass ay-focus rounded-[22px] p-4 lg:rounded-[26px] lg:p-6" style={focusIn(240)}>
                <p className="text-[13px] font-medium text-white/80 lg:text-[14px]">{t.week.reserveTitle}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 lg:mt-3">
                  <span className="tabular font-display text-[30px] leading-none font-light lg:text-[44px]" dir="ltr">
                    {cur.pct}%
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[12px] font-semibold text-night lg:text-[13.5px]">{t.week.feel[feel]}</span>
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/25 lg:mt-5 lg:h-2" dir="ltr" role="img" aria-label={`${cur.pct}%`}>
                  <motion.div
                    className={`h-full origin-left rounded-full ${feel === "stress" ? "bg-[#ffb4a0]" : feel === "dry" ? "bg-[#ffd98a]" : "bg-[#9fe8c4]"}`}
                    initial={false}
                    animate={{ scaleX: Math.max(0.02, cur.pct / 100) }}
                    transition={{ type: "spring", duration: 0.5, bounce: 0 }}
                  />
                </div>
              </div>

              <div className="ay-glass ay-focus rounded-[22px] p-4 lg:rounded-[26px] lg:p-6" style={focusIn(300)}>
                <p className="text-[13px] font-medium text-white/80 lg:text-[14px]">{t.week.weatherTitle}</p>
                <ul className="tabular mt-2 grid gap-1.5 text-[14px] lg:mt-3 lg:gap-2.5 lg:text-[16px]" dir="auto">
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
        </div>

        {/* the week: weekday above, the wave through the days, the high below; tap or drag along it */}
        <div className="ay-glass ay-focus mx-3 mb-3 rounded-[24px] px-1 pb-1 sm:mx-4 lg:mx-8 lg:mb-8 lg:rounded-[30px] lg:px-3 lg:pb-2" style={focusIn(380)}>
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
              <svg aria-hidden width={w} height={waveH} className="pointer-events-none absolute start-0" style={{ top: LABEL_H, overflow: "visible" }}>
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
                <span key={`m3-${k}`} aria-hidden className="tabular pointer-events-none absolute -translate-x-1/2 rounded-full bg-[#1f93b5]/85 px-2 py-0.5 text-[11px] font-semibold text-white lg:text-[13px]" style={{ left: x, top: LABEL_H + y - 31 }}>
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
                  style={{ height: LABEL_H + waveH + VALUE_H }}
                >
                  <span className={`text-[13px] transition-colors duration-200 [text-shadow:0_1px_10px_rgb(0_0_0/0.4)] lg:text-[15.5px] ${on ? "font-semibold text-white" : "text-white/70"}`}>{label}</span>
                  <span className={`tabular flex h-9 items-center text-[15px] transition-colors duration-200 [text-shadow:0_1px_10px_rgb(0_0_0/0.4)] lg:text-[18px] ${on ? "font-semibold text-white" : "text-white/70"}`} aria-hidden>
                    {d.day ? `${Math.round(d.day.tmax)}°` : "–"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-3 px-1 text-[13px] text-ink-soft lg:mt-4">{t.week.assumption}</p>
    </section>
  );
}
