"use client";

import { ChevronDown, CloudRain, Droplets, Sprout } from "lucide-react";
import { dayLabel } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useLang, useLocale, useT } from "@/lib/i18n/useLang";
import { limitText, planSteps } from "@/lib/plan-text";
import type { FarmStateDTO } from "@/lib/state-types";

/** The next seven days, one row each. Every day assumes the farmer followed the plan before it. */
export function WeekTab({ state }: { state: FarmStateDTO }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const locale = useLocale();
  const crop = t.crops[state.farm.crop as keyof typeof t.crops].toLocaleLowerCase(lang);

  if (state.week.length === 0) return <p className="px-4 py-6 text-ink-soft">{t.week.empty}</p>;

  return (
    <section aria-labelledby="week" className="px-4 py-4">
      <h2 id="week" className="text-[22px] font-semibold tracking-tight">
        {t.week.title}
      </h2>
      <p className="mt-1 text-[14px] text-ink-soft">{t.week.assumption}</p>

      <ul className="mt-4 divide-y divide-line border-y border-line">
        {state.week.map(({ plan }, i) => {
          const day = state.daily.find((d) => d.date === plan.date);
          const water = plan.grossM3 > 0;
          const rainSkip = !water && plan.reason === "rain_expected";
          const steps = planSteps(plan, t);
          const limit = limitText(plan, t, state.farm.basinM3);
          return (
            <li key={plan.date}>
              <details className="group">
                <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-2.5 [&::-webkit-details-marker]:hidden">
                  <span className="w-[4.5rem] shrink-0">
                    <span className="block text-[15px] font-semibold">
                      {i === 0 ? t.week.todayLabel : dayLabel(plan.date, locale, { weekday: "short" })}
                    </span>
                    <span className="block text-[13px] text-ink-soft">{dayLabel(plan.date, locale, { day: "numeric", month: "short" })}</span>
                  </span>
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-full ${water ? "bg-mark-water text-paper" : rainSkip ? "bg-water/15 text-water-deep" : "bg-leaf/10 text-leaf"}`}
                    aria-hidden
                  >
                    {water ? <Droplets size={18} /> : rainSkip ? <CloudRain size={18} /> : <Sprout size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="tabular block text-[16px] font-medium">
                      {water ? fmt(t.week.irrigate, { m3: Math.round(plan.grossM3) }) : t.week.skip}
                    </span>
                    {day && (
                      <span className="tabular block truncate text-[13px] text-ink-soft" dir="auto">
                        {Math.round(day.tmax)}°C{day.rain > 0.1 ? ` · ${fmt(t.week.rain, { mm: day.rain.toFixed(1) })}` : ""}
                      </span>
                    )}
                  </span>
                  <ChevronDown size={18} className="shrink-0 text-ink-soft transition-transform group-open:rotate-180" aria-hidden />
                </summary>

                <div className="pb-4 ps-[calc(4.5rem+0.75rem)] text-[14px]">
                  <p className="text-ink-soft">{fmt(t.today.reasons[plan.reason], { crop })}</p>
                  {steps.length > 0 && (
                    <ul className="mt-2 grid gap-1.5">
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
                  {limit && <p className="mt-2 rounded-lg bg-sun/15 px-3 py-2">{limit}</p>}
                  {day && (
                    <p className="tabular mt-2 text-ink-soft" dir="auto">
                      {fmt(t.today.weather.et, { mm: day.et0.toFixed(1) })}
                    </p>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
