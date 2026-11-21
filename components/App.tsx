"use client";

import { CalendarDays, Leaf, Satellite, Sun } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { DayRibbon } from "@/components/DayRibbon";
import { EnergyPanel } from "@/components/panels/EnergyPanel";
import { Decision, Savings, SoilSensor } from "@/components/panels/TodayPanel";
import { CROPS } from "@/lib/engine/crops";
import type { WeatherScenario } from "@/lib/engine/types";
import { type Tab, useApp, usePlan, useScenario } from "@/lib/store";

const Twin = dynamic(() => import("@/components/twin/Twin"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#dfe6ea]" aria-hidden />,
});

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "today", label: "Today", icon: <CalendarDays size={22} /> },
  { id: "energy", label: "Energy", icon: <Sun size={22} /> },
  { id: "leaf", label: "Leaf check", icon: <Leaf size={22} /> },
  { id: "satellite", label: "Satellite", icon: <Satellite size={22} /> },
];

function useLiveWeather() {
  const demoMode = useApp((s) => s.demoMode);
  const setLive = useApp((s) => s.setLiveScenario);
  useEffect(() => {
    if (demoMode) return;
    let alive = true;
    setLive(null, "loading");
    fetch("/api/weather")
      .then((r) => r.json() as Promise<{ scenario: WeatherScenario; stale: boolean }>)
      .then((j) => alive && setLive(j.scenario, j.stale ? "error" : "fresh"))
      .catch(() => alive && setLive(null, "error"));
    return () => {
      alive = false;
    };
  }, [demoMode, setLive]);
}

function Header() {
  const scenarioId = useApp((s) => s.scenarioId);
  const setScenario = useApp((s) => s.setScenario);
  const scenarios = useApp((s) => s.scenarios);
  const liveStatus = useApp((s) => s.liveStatus);
  const parcel = useApp((s) => s.parcel);
  const scenario = useScenario();
  const day = scenario.hourly.time.findIndex((t) => t.startsWith(scenario.focusDate));
  const tmax = Math.max(...scenario.hourly.temp.slice(day, day + 24));

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 lg:col-span-2">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-[22px] leading-none font-semibold tracking-tight">
          <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden>
            <path d="M9 1C9 1 1.5 10 1.5 14.2a7.5 7.5 0 0 0 15 0C16.5 10 9 1 9 1Z" fill="var(--sun)" />
          </svg>
          Goutte d&apos;Or
        </h1>
        <p className="mt-1 truncate text-[13px] text-ink-soft">
          {CROPS[parcel.crop].label} · {parcel.areaHa} ha · {scenario.location.name} ·{" "}
          <span className="tabular">{Math.round(tmax)}°C max</span>
        </p>
      </div>
      <div role="radiogroup" aria-label="Weather scenario" className="flex rounded-full border border-line bg-paper p-1 text-[14px]">
        {(["summer", "live"] as const).map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={scenarioId === id}
            onClick={() => setScenario(id)}
            className={`h-9 rounded-full px-3.5 ${scenarioId === id ? "bg-ink text-paper" : "text-ink"}`}
          >
            {id === "summer" ? "Heatwave 21 Jul" : liveStatus === "loading" ? "Today…" : "Today"}
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{scenarios[scenarioId].label}</p>
    </header>
  );
}

function Placeholder({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-[14px] text-ink-soft">{children}</p>
    </section>
  );
}

function TabBar({ className = "" }: { className?: string }) {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  return (
    <nav aria-label="Sections" className={className}>
      <ul className="grid grid-cols-4">
        {TABS.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
              className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[12px] lg:h-11 lg:flex-row lg:gap-2 lg:text-[14px] ${
                tab === t.id ? "font-semibold text-ink" : "text-ink-soft"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function App() {
  useLiveWeather();
  const plan = usePlan();
  const tab = useApp((s) => s.tab);
  const parcel = useApp((s) => s.parcel);

  return (
    <div className="mx-auto min-h-svh max-w-[1600px] lg:grid lg:h-svh lg:grid-cols-[minmax(0,1fr)_440px] lg:grid-rows-[auto_minmax(0,1fr)]">
      <Header />

      <div className="flex flex-col lg:min-h-0">
        <div className="relative h-[42svh] min-h-[280px] overflow-hidden bg-[#dfe6ea] lg:h-auto lg:flex-1 lg:rounded-tr-2xl">
          <div className="absolute inset-0">
            <Twin />
          </div>
        </div>
        <DayRibbon plan={plan} />
      </div>

      <aside className="bg-paper pb-24 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-line lg:pb-6">
        <TabBar className="sticky top-0 z-10 hidden border-b border-line bg-paper lg:block" />
        {tab === "today" && (
          <>
            <Decision plan={plan} />
            <Savings plan={plan} />
            <SoilSensor />
          </>
        )}
        {tab === "energy" && <EnergyPanel plan={plan} parcel={parcel} />}
        {tab === "leaf" && (
          <Placeholder title="Leaf check">Photograph a sick leaf to find out if it is thirst, a deficiency or a pest such as Tuta absoluta.</Placeholder>
        )}
        {tab === "satellite" && (
          <Placeholder title="Satellite view">Regional rainfall, soil moisture and land temperature from JAXA satellites, and crop vigour from Sentinel-2.</Placeholder>
        )}
      </aside>

      <TabBar className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur lg:hidden" />
    </div>
  );
}
