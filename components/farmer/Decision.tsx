"use client";

import { AlertTriangle, CloudRain, Droplets, Sprout, Sun } from "lucide-react";
import type { DailyPlan } from "@/lib/engine/types";
import { dayLabel } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useLang, useLocale, useT } from "@/lib/i18n/useLang";
import { limitText, neededButBlocked, planSteps } from "@/lib/plan-text";

/** The one thing a farmer needs each morning: water today or not, how much, and when. */
export function DecisionCard({
  plan,
  cropName,
  basinCapacityM3,
  logsToday = [],
}: {
  plan: DailyPlan;
  cropName: string;
  basinCapacityM3: number;
  logsToday?: { id: number; m3: number }[];
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const locale = useLocale();
  const totalWatered = logsToday.reduce((s, l) => s + l.m3, 0);
  const isWatered = totalWatered > 0;
  const irrigate = plan.grossM3 > 0;
  const blocked = neededButBlocked(plan);
  const steps = planSteps(plan, t);
  const limit = limitText(plan, t, basinCapacityM3);
  const reason = fmt(t.today.reasons[plan.reason], { crop: cropName.toLocaleLowerCase(lang) });
  const date = dayLabel(plan.date, locale, { weekday: "long", day: "numeric", month: "long" });

  if (isWatered) {
    return (
      <section aria-labelledby="decision" className="ay-rise px-4 pt-4 pb-2">
        <p className="text-[13px] text-ink-soft">{date}</p>
        <div className="mt-3 flex items-center gap-3.5">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-leaf/15 text-leaf">
            <Droplets size={24} strokeWidth={2.2} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="decision" className="font-display text-[32px] leading-tight font-medium tracking-tight text-ink">
              {t.today.done.headline}
            </h2>
            <p className="text-[14px] text-ink-soft">
              {fmt(t.today.done.appliedSummary, { m3: Math.round(totalWatered) })}
            </p>
          </div>
        </div>

        <p className="mt-4 flex items-center gap-2 rounded-xl bg-leaf/10 px-3.5 py-2.5 text-[14px] leading-snug font-medium text-leaf">
          <Droplets size={16} className="shrink-0 text-leaf" aria-hidden />
          <span>{t.today.done.statusNote}</span>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="decision" className="ay-rise px-4 pt-4 pb-1">
      <p className="text-[13px] text-ink-soft">{date}</p>
      <h2 id="decision" className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {irrigate ? (
          <>
            <span className="tabular font-display text-[68px] leading-[0.9] font-light tracking-tight" dir="ltr">
              {Math.round(plan.grossM3)}
              <span className="text-[28px] tracking-normal">{" m³"}</span>
            </span>
            <span className="text-[19px] font-medium">{t.today.toIrrigate}</span>
          </>
        ) : (
          <span className="font-display text-[32px] leading-tight font-normal tracking-tight">{blocked ? t.today.needed : t.today.none}</span>
        )}
      </h2>

      {/* one line: the plants' state when they are stressed, otherwise why today's plan is what it is */}
      {plan.stress !== "none" ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-alarm/10 px-3.5 py-1.5 text-[14px] leading-snug font-medium text-alarm">
          <AlertTriangle size={16} className="shrink-0" aria-hidden />
          {t.today.stress[plan.stress]}
        </p>
      ) : (
        <p className="mt-4 flex items-start gap-2 text-[15px] leading-snug text-ink-soft">
          {plan.reason === "rain_expected" ? (
            <CloudRain size={18} className="mt-0.5 shrink-0 text-water-deep" aria-hidden />
          ) : plan.decision === "irrigate" ? (
            <Droplets size={18} className="mt-0.5 shrink-0 text-water-deep" aria-hidden />
          ) : (
            <Sprout size={18} className="mt-0.5 shrink-0 text-leaf" aria-hidden />
          )}
          {reason}
        </p>
      )}

      {steps.length > 0 && (
        <ol className="mt-5 divide-y divide-line/70 border-y border-line/70 text-[15px]">
          {steps.map((s) => (
            <li key={s.time + s.text} className="flex items-center gap-3 py-2.5">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full text-paper ${s.tone === "sun" ? "bg-mark-sun" : "bg-mark-water"}`} aria-hidden>
                {s.tone === "sun" ? <Sun size={16} /> : <Droplets size={16} />}
              </span>
              <span className="tabular w-[7.2rem] shrink-0 font-semibold" dir="ltr">
                {s.time}
              </span>
              <span className="min-w-0 leading-snug text-ink-soft">{s.text}</span>
            </li>
          ))}
        </ol>
      )}

      {limit && (
        <p role="note" className="mt-4 rounded-xl bg-sun/15 px-3.5 py-2.5 text-[14px] leading-snug">
          {limit}
        </p>
      )}
    </section>
  );
}

/** Solar farms only: what the plan saves against pumping every sunny hour. */
export function SavingsNote({ plan }: { plan: DailyPlan }) {
  const t = useT();
  const solar = plan.source === "solar_basin" || plan.source === "solar_direct";
  if (!solar) return null;
  // Nothing to water: say the pump can rest instead of boasting about a hypothetical wasteful day.
  if (plan.decision === "skip") {
    return (
      <section aria-label={t.energy.title} className="mx-4 my-3 border-t border-line pt-3">
        <p className="text-[15px] leading-snug">{t.today.pumpRests}</p>
      </section>
    );
  }
  if (plan.baseline.pumpedM3 <= 0 || plan.savings.waterM3 <= 0) return null;
  return (
    <section aria-label={t.energy.title} className="mx-4 my-3 border-t border-line pt-3">
      <p className="text-[15px] leading-snug">
        {fmt(t.today.saves, {
          m3: Math.round(plan.savings.waterM3),
          pct: Math.round(plan.savings.waterPct),
          hours: Math.round(plan.savings.pumpHoursPct),
        })}
      </p>
    </section>
  );
}
