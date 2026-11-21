"use client";

import { Box, Leaf, LogOut, MessageCircle, RotateCcw, Satellite } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DayRibbon } from "@/components/DayRibbon";
import { LangSwitch } from "@/components/LangSwitch";
import { Logo } from "@/components/Logo";
import { EnergyPanel } from "@/components/panels/EnergyPanel";
import { AskTab } from "@/components/farmer/AskTab";
import { DecisionCard, SavingsNote } from "@/components/farmer/Decision";
import { LeafTab } from "@/components/farmer/LeafTab";
import { SatelliteTab } from "@/components/farmer/SatelliteTab";
import { signOut, useSession } from "@/lib/auth-client";
import { DEMO_EMAIL } from "@/lib/demo";
import { DEMO_LOCATION } from "@/lib/engine/parcel";
import type { ScenarioId, WeatherScenario } from "@/lib/engine/types";
import { useT } from "@/lib/i18n/useLang";
import { useApp, usePlan } from "@/lib/store";
import { JoinCard } from "./JoinCard";
import { VirtualSensor } from "./VirtualSensor";

const DemoTwin = dynamic(() => import("@/components/twin/Twin"), {
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

function TwinTab() {
  const t = useT();
  const plan = usePlan();
  const parcel = useApp((s) => s.parcel);
  return (
    <div className="lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="flex flex-col lg:min-h-0">
        <div className="relative h-[42svh] min-h-[280px] overflow-hidden bg-[#dfe6ea] lg:h-auto lg:flex-1">
          <div className="absolute inset-0">
            <DemoTwin />
          </div>
        </div>
        <DayRibbon plan={plan} />
      </div>

      <div className="bg-paper pb-28 lg:min-h-0 lg:overflow-y-auto lg:border-s lg:border-line lg:pb-6">
        <div className="flex justify-end px-4 pt-3 sm:hidden">
          <LangSwitch />
        </div>
        <ScenarioToggle />
        <DecisionCard plan={plan} cropName={t.crops[parcel.crop]} basinCapacityM3={parcel.basinCapacityM3} />
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

  // the demo is for the demo account only
  useEffect(() => {
    if (!isPending && data && data.user.email !== DEMO_EMAIL) router.replace("/app");
  }, [isPending, data, router]);

  async function reset() {
    await fetch("/api/demo/reset", { method: "POST" }).catch(() => {});
    resetDemo();
    setEpoch((n) => n + 1);
  }

  const tabButton = (id: TabId, icon: React.ReactNode, className: string) => (
    <button
      key={id}
      type="button"
      aria-current={tab === id ? "page" : undefined}
      onClick={() => setTab(id)}
      className={`${className} ${tab === id ? "font-semibold text-ink" : "text-ink-soft"}`}
    >
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
            <li key={x.id}>{tabButton(x.id, x.icon, "flex h-11 items-center gap-2 px-3 text-[14px]")}</li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 lg:min-h-0 lg:overflow-hidden" key={epoch}>
        {tab === "twin" && <TwinTab />}
        {tab !== "twin" && (
          <div className="mx-auto max-w-[720px] pb-28 lg:h-full lg:overflow-y-auto lg:pb-8">
            {tab === "leaf" && <LeafTab />}
            {tab === "ask" && <AskTab />}
            {tab === "satellite" && <SatelliteTab lat={DEMO_LOCATION.lat} lon={DEMO_LOCATION.lon} />}
          </div>
        )}
      </main>

      <nav aria-label={t.demo.badge} className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur lg:hidden">
        <ul className="grid grid-cols-4">
          {TABS.map((x) => (
            <li key={x.id}>{tabButton(x.id, x.icon, "flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px]")}</li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
