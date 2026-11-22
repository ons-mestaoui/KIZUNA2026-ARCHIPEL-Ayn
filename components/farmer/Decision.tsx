"use client";

import { AlertTriangle, CloudRain, Droplets, Sprout, Sun } from "lucide-react";
import type { DailyPlan } from "@/lib/engine/types";
import { dayLabel } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useLang, useLocale, useT } from "@/lib/i18n/useLang";
import { limitText, neededButBlocked, planSteps } from "@/lib/plan-text";

/** The one thing a farmer needs each morning: water today or not, how much, and when. */
export function DecisionCard({ plan, cropName, basinCapacityM3 }: { plan: DailyPlan; cropName: string; basinCapacityM3: number }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const locale = useLocale();
  const irrigate = plan.grossM3 > 0;
  const blocked = neededButBlocked(plan);
  const steps = planSteps(plan, t);
  const limit = limitText(plan, t, basinCapacityM3);
  const reason = fmt(t.today.reasons[plan.reason], { crop: cropName.toLocaleLowerCase(lang) });
  const date = dayLabel(plan.date, locale, { weekday: "long", day: "numeric", month: "long" });

  return (
    <section aria-labelledby="decision" className="ay-rise px-4 pt-4 pb-2">
      <p className="text-sm text-ink-soft">
        {t.today.planFor} · {date}
      </p>
      <h2 id="decision" className="mt-1 flex flex-wrap items-baseline gap-x-3">
        {irrigate ? (
          <>
            <span className="tabular text-[44px] leading-none font-semibold tracking-tight" dir="ltr">
              {Math.round(plan.grossM3)} m³
            </span>
            <span className="text-xl font-medium">{t.today.toIrrigate}</span>
          </>
        ) : (
          <span className="text-[32px] leading-tight font-semibold tracking-tight">{blocked ? t.today.needed : t.today.none}</span>
        )}
      </h2>

      <p className="mt-2 flex items-start gap-2 text-[15px] leading-snug">
        {plan.reason === "rain_expected" ? (
          <CloudRain size={18} className="mt-0.5 shrink-0 text-water-deep" aria-hidden />
        ) : plan.decision === "irrigate" ? (
          <Droplets size={18} className="mt-0.5 shrink-0 text-water-deep" aria-hidden />
        ) : (
          <Sprout size={18} className="mt-0.5 shrink-0 text-leaf" aria-hidden />
        )}
        {reason}
      </p>

      {plan.stress !== "none" && (
        <p className="mt-2 flex items-center gap-2 text-[15px] font-medium text-alarm">
          <AlertTriangle size={18} aria-hidden />
          {t.today.stress[plan.stress]}
        </p>
      )}

      {steps.length > 0 && (
        <ol className="mt-4 grid gap-2.5 text-[15px]">
          {steps.map((s) => (
            <li key={s.time + s.text} className="flex items-start gap-3">
              <span
                className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-paper ${s.tone === "sun" ? "bg-mark-sun" : "bg-mark-water"}`}
                aria-hidden
              >
                {s.tone === "sun" ? <Sun size={16} /> : <Droplets size={16} />}
              </span>
              <span>
                <span className="tabular font-semibold" dir="ltr">
                  {s.time}
                </span>
                <span className="block text-ink-soft">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {limit && (
        <p role="note" className="mt-4 rounded-lg bg-sun/15 px-3 py-2 text-[14px] leading-snug">
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
