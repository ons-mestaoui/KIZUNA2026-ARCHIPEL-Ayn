"use client";

import { Box, Leaf, LogOut, MessageCircle, RotateCcw, Satellite } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DayRibbon } from "@/components/DayRibbon";
import { useDemoField } from "@/components/field/useDemoField";
import { useFieldUi } from "@/components/field/store";
import { type HeroView, ViewSwitch } from "@/components/field/ViewSwitch";
import { ZoneCard } from "@/components/field/ZoneCard";
import { LangSwitch } from "@/components/LangSwitch";
import { Logo } from "@/components/Logo";
import { TabMark, TabSwap } from "@/components/motion/Motion";
import { EnergyPanel } from "@/components/panels/EnergyPanel";
import { AskTab } from "@/components/farmer/AskTab";
import { DecisionCard, SavingsNote } from "@/components/farmer/Decision";
import { LeafTab } from "@/components/farmer/LeafTab";
import { SatelliteTab } from "@/components/farmer/SatelliteTab";
import type { FieldData } from "@/components/field/useFieldData";
import { signOut, useSession } from "@/lib/auth-client";
import { clearStateCache } from "@/lib/state-cache";
import { DEMO_EMAIL } from "@/lib/demo";
import { DEMO_CENTRE, DEMO_HEATWAVE_DAY, DEMO_POLYGON } from "@/lib/demo-field";
import type { ScenarioId, WeatherScenario } from "@/lib/engine/types";
import { selectFrames } from "@/lib/field/frames";
import { dayLabel } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/useLang";
import { useApp, usePlan } from "@/lib/store";
import { JoinCard } from "./JoinCard";
import { VirtualSensor } from "./VirtualSensor";

const DemoTwin = dynamic(() => import("@/components/twin/Twin"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#dfe6ea]" aria-hidden />,
});

const FieldHero = dynamic(() => import("@/components/field/FieldHero"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#dfe6ea]" aria-hidden />,
});

type TabId = "twin" | "leaf" | "ask" | "satellite";
const TABS: { id: TabId; icon: React.ReactNode }[] = [
  { id: "twin", icon: <Box size={22} /> },
  { id: "leaf", icon: <Leaf size={22} /> },
  { id: "ask", icon: <MessageCircle size={22} /> },
  { id: "satellite", icon: <Satellite size={22} /> },
];

/** Today's forecast for the "live" scenario (falls back to the bundled snapshot when offline). */
function useLiveWeather() {
  const setLive = useApp((s) => s.setLiveScenario);
  useEffect(() => {
    let alive = true;
    setLive(null, "loading");
    fetch("/api/weather")
      .then((r) => r.json() as Promise<{ scenario: WeatherScenario; stale: boolean }>)
      .then((j) => alive && setLive(j.scenario, j.stale ? "error" : "fresh"))
      .catch(() => alive && setLive(null, "error"));
    return () => {
      alive = false;
    };
  }, [setLive]);
}

function ScenarioToggle() {
  const t = useT();
  const scenarioId = useApp((s) => s.scenarioId);
  const setScenario = useApp((s) => s.setScenario);
  const ids: ScenarioId[] = ["summer", "live"];
  return (
    <div className="px-4 pt-4">
      <p className="mb-2 text-[13px] text-ink-soft">{t.demo.scenario.label}</p>
      <div role="radiogroup" aria-label={t.demo.scenario.label} className="flex rounded-full border border-line bg-limewash p-1 text-[14px]">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={scenarioId === id}
            onClick={() => setScenario(id)}
            className={`h-10 flex-1 rounded-full px-3 ${scenarioId === id ? "bg-ink text-paper" : "text-ink"}`}
          >
            {id === "summer" ? t.demo.scenario.heatwave : t.demo.scenario.live}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-ink-soft">{t.demo.scenario.note}</p>
    </div>
  );
}

/** The demo's soil sensor, drawn where it sits in the field: the healthiest zone, the one a farmer would put a probe in. */
function SensorPin({ pct }: { pct: number }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-paper shadow" title={fmt(t.demo.field.sensor, { pct: Math.round(pct) })}>
      <span className="size-2 rounded-full bg-sun" aria-hidden />
      <span dir="ltr">{Math.round(pct)} %</span>
    </span>
  );
}

function TwinTab({ fieldData }: { fieldData: FieldData }) {
  const t = useT();
  const locale = useLocale();
  const plan = usePlan();
  const parcel = useApp((s) => s.parcel);
  const scenarioId = useApp((s) => s.scenarioId);
  const soilPct = useApp((s) => s.soilPct);
  const [view, setView] = useState<HeroView>("field"); // the real field first; the diagram is one tap away

  // the heatwave scenario shows the passes either side of 21 July; "live" shows the latest clear ones
  const shown = useMemo(() => (fieldData.field ? selectFrames(fieldData.field, fieldData.field.sets?.[scenarioId === "summer" ? "heatwave" : "live"] ?? []) : null), [fieldData.field, scenarioId]);
  useEffect(() => useFieldUi.getState().setFrame(null), [scenarioId]); // a new scenario opens on its newest pass

  // the sensor sits in the healthiest zone: one probe sees one spot, the satellite sees every zone
  const sensorAt = useMemo(() => {
    const st = shown?.stats.at(-1);
    if (!shown?.zones || !st) return null;
    let best = 0;
    st.zones.forEach((z, i) => (z.ndvi ?? -1) > (st.zones[best].ndvi ?? -1) && (best = i));
    return shown.zones.list[best]?.centroid ?? null;
  }, [shown]);
  const equipment = useMemo(() => ({ plan, basinCapacityM3: parcel.basinCapacityM3, kWp: parcel.pv.kWp }), [plan, parcel]);
  const pins = useMemo(() => (sensorAt ? [{ at: sensorAt, content: <SensorPin pct={soilPct} /> }] : undefined), [sensorAt, soilPct]);
  const heatwave = scenarioId === "summer" ? fmt(t.demo.field.heatwave, { date: dayLabel(DEMO_HEATWAVE_DAY, locale, { day: "numeric", month: "short" }) }) : undefined;

  return (
    <div className="lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex flex-col lg:min-h-0">
        <div className="relative h-[42svh] min-h-[280px] overflow-hidden bg-[#dfe6ea] lg:h-auto lg:flex-1">
          <div className="absolute inset-0">
            {view === "field" && shown ? (
              <FieldHero field={shown} pins={pins} passNote={heatwave} equipment={equipment}>
                <ViewSwitch view={view} onChange={setView} />
              </FieldHero>
            ) : (
              <DemoTwin />
            )}
          </div>
          {(view === "model" || !shown) && (
            <div className="absolute start-3 top-3 z-10">
              <ViewSwitch view={view} onChange={setView} />
            </div>
          )}
        </div>
        <DayRibbon plan={plan} />
      </div>

      <div className="bg-paper pb-28 lg:min-h-0 lg:overflow-y-auto lg:border-s lg:border-line lg:pb-6">
        <div className="flex justify-end px-4 pt-3 sm:hidden">
          <LangSwitch />
        </div>
        <ScenarioToggle />
        <DecisionCard plan={plan} cropName={t.crops[parcel.crop]} basinCapacityM3={parcel.basinCapacityM3} />
        {shown && (
          <>
            <ZoneCard field={shown} decision={plan.grossM3 > 0 ? "irrigate" : "skip"} />
            <p className="mx-4 text-[13px] leading-snug text-ink-soft">{t.demo.field.sensorNote}</p>
          </>
        )}
        <VirtualSensor />
        <SavingsNote plan={plan} />
        <EnergyPanel plan={plan} parcel={parcel} />
        <JoinCard />
      </div>
    </div>
  );
}

export default function DemoApp() {
  const t = useT();
  const router = useRouter();
  const { data, isPending } = useSession();
  const resetDemo = useApp((s) => s.resetDemo);
  const [tab, setTab] = useState<TabId>("twin");
  const [epoch, setEpoch] = useState(0); // bumping it remounts the tabs, clearing their local history
  useLiveWeather();
  const fieldData = useDemoField();

  // the demo is for the demo account only
  useEffect(() => {
    if (!isPending && data && data.user.email !== DEMO_EMAIL) router.replace("/app");
  }, [isPending, data, router]);

  // the screen resets at once; the server is told in the background (on a slow network the button must not feel dead)
  function reset() {
    resetDemo();
    setEpoch((n) => n + 1);
    void fetch("/api/demo/reset", { method: "POST" }).catch(() => {});
  }

  const tabButton = (id: TabId, icon: React.ReactNode, className: string, bar: "desktop" | "phone") => (
    <button
      key={id}
      type="button"
      aria-current={tab === id ? "page" : undefined}
      onClick={() => setTab(id)}
      className={`relative ${className} ${tab === id ? "font-semibold text-ink" : "text-ink-soft"}`}
    >
      {tab === id && <TabMark layoutId={`demo-${bar}`} edge={bar === "desktop" ? "bottom" : "top"} />}
      {icon}
      {t.demo.tabs[id]}
    </button>
  );

  return (
    <div className="mx-auto flex min-h-svh max-w-[1600px] flex-col lg:h-svh">
      <header className="flex items-center justify-between gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <Logo href="/demo" />
          <span className="rounded-full bg-sun/25 px-2.5 py-0.5 text-[12px] font-semibold text-sun-deep">{t.demo.badge}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <LangSwitch />
          </div>
          <button type="button" onClick={reset} aria-label={t.demo.reset} title={t.demo.reset} className="grid size-11 place-items-center rounded-full border border-line bg-paper">
            <RotateCcw size={18} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t.demo.leave}
            title={t.demo.leave}
            onClick={async () => {
              clearStateCache();
              await signOut();
              router.push("/");
              router.refresh();
            }}
            className="grid size-11 place-items-center rounded-full border border-line bg-paper"
          >
            <LogOut size={18} aria-hidden />
          </button>
        </div>
      </header>

      <nav aria-label={t.demo.badge} className="hidden border-y border-line bg-paper lg:block">
        <ul className="mx-auto flex max-w-[1600px] gap-2 px-4">
          {TABS.map((x) => (
            <li key={x.id}>{tabButton(x.id, x.icon, "flex h-11 items-center gap-2 px-3 text-[14px]", "desktop")}</li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 lg:min-h-0 lg:overflow-hidden" key={epoch}>
        <TabSwap id={tab} className="lg:h-full">
        {tab === "twin" && <TwinTab fieldData={fieldData} />}
        {tab !== "twin" && (
          <div className="mx-auto max-w-[720px] pb-28 lg:h-full lg:overflow-y-auto lg:pb-8">
            {tab === "leaf" && <LeafTab />}
            {tab === "ask" && <AskTab />}
            {tab === "satellite" && <SatelliteTab lat={DEMO_CENTRE[1]} lon={DEMO_CENTRE[0]} polygon={DEMO_POLYGON} fieldData={fieldData} />}
          </div>
        )}
        </TabSwap>
      </main>

      <nav aria-label={t.demo.badge} className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur lg:hidden">
        <ul className="grid grid-cols-4">
          {TABS.map((x) => (
            <li key={x.id}>{tabButton(x.id, x.icon, "flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px]", "phone")}</li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
