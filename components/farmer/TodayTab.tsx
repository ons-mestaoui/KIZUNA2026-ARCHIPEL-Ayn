"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { DayRibbon } from "@/components/DayRibbon";
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

export function TodayTab({ state, refresh }: { state: FarmStateDTO; refresh: () => void }) {
  const t = useT();
  const { farm } = state;
  const parcel = useMemo(() => parcelFromRow(farm), [farm]);
  const plan = state.week[0].plan;
  const solar = plan.source === "solar_basin" || plan.source === "solar_direct";
  const day = state.daily.find((d) => d.date === state.today);
  const cropName = t.crops[farm.crop as keyof typeof t.crops];

  return (
    <div className="lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex flex-col lg:min-h-0">
        <div className="relative h-[42svh] min-h-[280px] overflow-hidden bg-[#dfe6ea] lg:h-auto lg:flex-1">
          <div className="absolute inset-0">
            <TwinCanvas plan={plan} parcel={parcel} lat={farm.lat} lon={farm.lon} tz={state.tz} wet={wetnessFromDepletion(state.depletionMm, plan.tawMm)} />
          </div>
        </div>
        <DayRibbon plan={plan} />
      </div>

      <div className="bg-paper pb-28 lg:min-h-0 lg:overflow-y-auto lg:border-s lg:border-line lg:pb-6">
        <DecisionCard plan={plan} cropName={cropName} basinCapacityM3={parcel.basinCapacityM3} />
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
