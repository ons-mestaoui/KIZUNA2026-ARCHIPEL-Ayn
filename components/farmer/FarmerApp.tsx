"use client";

import { CalendarDays, CalendarRange, Leaf, MessageCircle, RefreshCw, Satellite, Settings, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFieldData } from "@/components/field/useFieldData";
import { LangSwitch } from "@/components/LangSwitch";
import { Logo } from "@/components/Logo";
import { TabMark, TabSwap } from "@/components/motion/Motion";
import { useSession } from "@/lib/auth-client";
import { DEMO_EMAIL } from "@/lib/demo";
import { fmt } from "@/lib/i18n";
import { whenLabel } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/useLang";
import { AskTab } from "./AskTab";
import { FarmTab } from "./FarmTab";
import { LeafTab } from "./LeafTab";
import { PlotSwitcher } from "./PlotSwitcher";
import { SatelliteTab } from "./SatelliteTab";
import { TodayTab } from "./TodayTab";
import { useFarmState } from "./useFarmState";
import { WeekTab } from "./WeekTab";

type TabId = "today" | "week" | "leaf" | "ask" | "satellite" | "farm";
const TABS: { id: Exclude<TabId, "farm">; icon: React.ReactNode }[] = [
  { id: "today", icon: <CalendarDays size={22} /> },
  { id: "week", icon: <CalendarRange size={22} /> },
  { id: "leaf", icon: <Leaf size={22} /> },
  { id: "ask", icon: <MessageCircle size={22} /> },
  { id: "satellite", icon: <Satellite size={22} /> },
];

export function FarmerApp() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { data: session } = useSession();
  const { state, status, savedAt, refresh } = useFarmState();
  const [tab, setTab] = useState<TabId>("today");
  // one satellite view of the farmer's own field, shared by the Today tab and the Satellite tab
  const fieldData = useFieldData((state?.farm.polygon?.length ?? 0) >= 3, state?.farm.id);

  // the demo account belongs in the demo, not in the farmer app
  useEffect(() => {
    if (session?.user.email === DEMO_EMAIL) router.replace("/demo");
  }, [session, router]);

  const tabButton = (id: Exclude<TabId, "farm">, icon: React.ReactNode, className: string, bar: "desktop" | "phone") => (
    <button
      key={id}
      type="button"
      aria-current={tab === id ? "page" : undefined}
      onClick={() => setTab(id)}
      className={`relative ${className} ${tab === id ? "font-semibold text-ink" : "text-ink-soft"}`}
    >
      {tab === id && <TabMark layoutId={`farmer-${bar}`} edge={bar === "desktop" ? "bottom" : "top"} />}
      {icon}
      {t.shell.tabs[id]}
    </button>
  );

  return (
    <div className="mx-auto flex min-h-svh max-w-[1600px] flex-col lg:h-svh">
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo href="/app" />
          {state && <PlotSwitcher current={state.farm} farms={state.farms ?? [state.farm]} onSwitch={refresh} />}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* on a phone the language lives in the Farm tab; the header has no room for it */}
          <div className="hidden sm:block">
            <LangSwitch />
          </div>
          <button
            type="button"
            onClick={() => setTab("farm")}
            aria-label={t.farm.title}
            aria-current={tab === "farm" ? "page" : undefined}
            className={`grid size-11 place-items-center rounded-full border border-line bg-paper ${tab === "farm" ? "ring-2 ring-ink" : ""}`}
          >
            <Settings size={20} aria-hidden />
          </button>
        </div>
      </header>

      {/* desktop: tabs under the header */}
      <nav aria-label={t.farm.title} className="hidden border-y border-line bg-paper lg:block">
        <ul className="mx-auto flex max-w-[1600px] gap-2 px-4">
          {TABS.map((x) => (
            <li key={x.id}>{tabButton(x.id, x.icon, "flex h-11 items-center gap-2 px-3 text-[14px]", "desktop")}</li>
          ))}
        </ul>
      </nav>

      {status === "offline" && savedAt && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 bg-sun/20 px-4 py-2 text-[14px]">
          <span className="inline-flex items-center gap-2">
            <WifiOff size={16} aria-hidden />
            {fmt(t.offline.banner, { when: whenLabel(savedAt, locale) })}
          </span>
          <button type="button" onClick={refresh} className="inline-flex h-9 items-center gap-1.5 font-medium underline underline-offset-4">
            <RefreshCw size={14} aria-hidden />
            {t.offline.retry}
          </button>
        </div>
      )}

      <main className="flex-1 lg:min-h-0 lg:overflow-hidden">
        {!state && status === "loading" && <p className="px-4 py-10 text-ink-soft">{t.offline.loading}</p>}
        {!state && status === "error" && (
          <div className="px-4 py-10">
            <p className="text-[16px]">{t.offline.error}</p>
            <button type="button" onClick={refresh} className="mt-4 h-12 ay-btn rounded-xl bg-ink px-5 font-medium text-paper">
              {t.offline.retry}
            </button>
          </div>
        )}
        {state && (
          <TabSwap id={tab} className="lg:h-full">
            {tab === "today" && <TodayTab key={state.farm.id} state={state} refresh={refresh} fieldData={fieldData} />}
            {tab !== "today" && (
              <div className="mx-auto max-w-[720px] pb-28 lg:h-full lg:overflow-y-auto lg:pb-8">
                {tab === "week" && <WeekTab key={state.farm.id} state={state} />}
                {tab === "farm" && <FarmTab key={state.farm.id} state={state} onSwitch={refresh} />}
                {tab === "leaf" && <LeafTab key={state.farm.id} onAskInChat={() => setTab("ask")} />}
                {tab === "ask" && <AskTab key={state.farm.id} />}
                {tab === "satellite" && (
                  <SatelliteTab
                    key={state.farm.id}
                    farmId={state.farm.id}
                    lat={state.farm.lat}
                    lon={state.farm.lon}
                    polygon={state.farm.polygon}
                    fieldData={fieldData}
                  />
                )}
              </div>
            )}
          </TabSwap>
        )}
      </main>

      {/* phone: bottom tab bar */}
      <nav aria-label={t.farm.title} className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {TABS.map((x) => (
            <li key={x.id}>{tabButton(x.id, x.icon, "flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px]", "phone")}</li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
