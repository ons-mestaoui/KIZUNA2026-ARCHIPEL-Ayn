"use client";

import { ArrowRight, MessageCircle, Satellite } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DayRibbon } from "@/components/DayRibbon";
import type { FieldData } from "@/components/field/useFieldData";
import { type HeroView, ViewSwitch } from "@/components/field/ViewSwitch";
import { ZoneCard } from "@/components/field/ZoneCard";
import { wetnessFromDepletion } from "@/components/twin/wetness";
import { parcelFromRow } from "@/lib/farm-parcel";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useLang";
import type { FarmStateDTO } from "@/lib/state-types";
import { DecisionCard } from "./Decision";
import { LogWater } from "./LogWater";
import { SqueezeTest } from "./SqueezeTest";

const TwinCanvas = dynamic(() => import("@/components/twin/Twin").then((m) => m.TwinCanvas), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#dfe6ea]" aria-hidden />,
});

const FieldPanel = dynamic(() => import("@/components/field/FieldPanel"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#dfe6ea]" aria-hidden />,
});

/**
 * Today: the field and the day on the left, and on the right only what a farmer acts on (how much, when, which zone
 * first, did you water). The reasons, the numbers and what the solar plan saves are one tap away in the assistant,
 * which is given all of them (see lib/server/aiContext.ts).
 */
export function TodayTab({
  state,
  refresh,
  fieldData,
  onAsk,
}: {
  state: FarmStateDTO;
  refresh: () => void;
  fieldData: FieldData;
  /** open the assistant with a question already written */
  onAsk: (question: string) => void;
}) {
  const t = useT();
  const { farm } = state;
  const hasOutline = (farm.polygon?.length ?? 0) >= 3;
  const [view, setView] = useState<HeroView>(hasOutline ? "field" : "model"); // the real field first, once there is one
  const parcel = useMemo(() => parcelFromRow(farm), [farm]);
  const plan = state.week[0].plan;
  const equipment = useMemo(() => ({ plan, basinCapacityM3: parcel.basinCapacityM3, kWp: parcel.pv.kWp }), [plan, parcel]);
  const cropName = t.crops[farm.crop as keyof typeof t.crops];
  const hasWateredToday = state.logsToday.length > 0;
  const question = hasWateredToday
    ? t.today.askWatered
    : plan.grossM3 > 0
      ? fmt(t.today.askWater, { m3: Math.round(plan.grossM3) })
      : t.today.askSkip;

  return (
    <div className="lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex flex-col lg:min-h-0">
        <div className="relative h-[42svh] min-h-[280px] overflow-hidden bg-[#dfe6ea] lg:h-auto lg:flex-1">
          <div className="absolute inset-0">
            {view === "field" && hasOutline ? (
              <FieldPanel data={fieldData} equipment={equipment}>
                <ViewSwitch view={view} onChange={setView} />
              </FieldPanel>
            ) : (
              <TwinCanvas plan={plan} parcel={parcel} lat={farm.lat} lon={farm.lon} tz={state.tz} wet={wetnessFromDepletion(state.depletionMm, plan.tawMm)} />
            )}
          </div>
          {hasOutline && view === "model" && (
            <div className="absolute start-3 top-3 z-10">
              <ViewSwitch view={view} onChange={setView} />
            </div>
          )}
          {!hasOutline && (
            <Link href="/onboarding" className="absolute start-3 bottom-3 z-10 inline-flex h-11 items-center gap-2 rounded-full bg-paper/92 px-4 text-[13px] font-medium shadow-sm">
              <Satellite size={16} aria-hidden />
              {t.field.noOutline.cta}
            </Link>
          )}
        </div>
        <DayRibbon plan={plan} />
      </div>

      <div className="bg-paper pb-28 lg:min-h-0 lg:overflow-y-auto lg:border-s lg:border-line lg:pb-6">
        <DecisionCard plan={plan} cropName={cropName} basinCapacityM3={parcel.basinCapacityM3} logsToday={state.logsToday} />
        {hasOutline && fieldData.field && <ZoneCard field={fieldData.field} decision={hasWateredToday ? "skip" : plan.grossM3 > 0 ? "irrigate" : "skip"} />}
        <LogWater plan={plan} logs={state.logsToday} onChange={refresh} />
        <SqueezeTest today={state.today} lastCheck={state.lastCheck} onChange={refresh} />
        <button
          type="button"
          onClick={() => onAsk(question)}
          className="mx-4 mt-3 flex min-h-12 w-[calc(100%-2rem)] items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 text-start text-[15px] font-medium transition-colors hover:bg-limewash"
        >
          <span className="flex items-center gap-2.5">
            <MessageCircle size={18} className="text-cobalt" aria-hidden />
            {t.today.ask}
          </span>
          <ArrowRight size={16} className="text-ink-soft rtl:rotate-180" aria-hidden />
        </button>
      </div>
    </div>
  );
}
