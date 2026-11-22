"use client";

import { Satellite } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DayRibbon } from "@/components/DayRibbon";
import type { FieldData } from "@/components/field/useFieldData";
import { type HeroView, ViewSwitch } from "@/components/field/ViewSwitch";
import { ZoneCard } from "@/components/field/ZoneCard";
import { EnergyPanel } from "@/components/panels/EnergyPanel";
import { wetnessFromDepletion } from "@/components/twin/wetness";
import { parcelFromRow } from "@/lib/farm-parcel";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useLang";
import type { FarmStateDTO } from "@/lib/state-types";
import { DecisionCard, SavingsNote } from "./Decision";
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

export function TodayTab({ state, refresh, fieldData }: { state: FarmStateDTO; refresh: () => void; fieldData: FieldData }) {
  const t = useT();
  const { farm } = state;
  const hasOutline = (farm.polygon?.length ?? 0) >= 3;
  const [view, setView] = useState<HeroView>(hasOutline ? "field" : "model"); // the real field first, once there is one
  const parcel = useMemo(() => parcelFromRow(farm), [farm]);
  const plan = state.week[0].plan;
  const solar = plan.source === "solar_basin" || plan.source === "solar_direct";
  const equipment = useMemo(() => ({ plan, basinCapacityM3: parcel.basinCapacityM3, kWp: parcel.pv.kWp }), [plan, parcel]);
  const day = state.daily.find((d) => d.date === state.today);
  const cropName = t.crops[farm.crop as keyof typeof t.crops];

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
        <DecisionCard plan={plan} cropName={cropName} basinCapacityM3={parcel.basinCapacityM3} />
        {hasOutline && fieldData.field && <ZoneCard field={fieldData.field} decision={plan.grossM3 > 0 ? "irrigate" : "skip"} />}
        <LogWater plan={plan} logs={state.logsToday} onChange={refresh} />
        <SavingsNote plan={plan} />
        {day && (
          <p className="tabular mx-4 my-3 border-t border-line pt-3 text-[14px] text-ink-soft" dir="auto">
            {fmt(t.today.weather.max, { t: Math.round(day.tmax) })} · {fmt(t.today.weather.et, { mm: day.et0.toFixed(1) })} ·{" "}
            {fmt(t.today.weather.rain, { mm: day.rain.toFixed(1) })}
          </p>
        )}
        <SqueezeTest today={state.today} lastCheck={state.lastCheck} onChange={refresh} />
        {solar && <EnergyPanel plan={plan} parcel={parcel} />}
      </div>
    </div>
  );
}
