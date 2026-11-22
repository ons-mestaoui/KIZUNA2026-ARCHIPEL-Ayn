"use client";

import { Check, MapPin, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LangSwitch } from "@/components/LangSwitch";
import { signOut } from "@/lib/auth-client";
import { fmt } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/useLang";
import { whenLabel } from "@/lib/format";
import { clearStateCache } from "@/lib/state-cache";
import type { FarmStateDTO } from "@/lib/state-types";

export function FarmTab({ state, onSwitch }: { state: FarmStateDTO; onSwitch?: () => void }) {
  const t = useT();
  const router = useRouter();
  const locale = useLocale();
  const { farm } = state;
  const farms = state.farms && state.farms.length ? state.farms : [farm];
  const [switching, setSwitching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const rows: [string, string][] = [
    [t.farm.location, farm.placeName ? `${farm.placeName} (${farm.lat.toFixed(3)}, ${farm.lon.toFixed(3)})` : `${farm.lat.toFixed(3)}, ${farm.lon.toFixed(3)}`],
    [t.farm.crop, t.crops[farm.crop as keyof typeof t.crops]],
    [t.farm.area, fmt(t.farm.hectares, { n: farm.areaHa })],
    [t.farm.water, t.sources[farm.waterSource as keyof typeof t.sources].title],
    [t.farm.method, t.methods[farm.irrigationMethod as keyof typeof t.methods]],
    [t.farm.soil, t.soils[farm.soilTexture as keyof typeof t.soils].title],
  ];

  async function handleSwitch(farmId: string) {
    if (farmId === farm.id) return;
    setSwitching(farmId);
    try {
      const res = await fetch("/api/farm/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmId }),
      });
      if (res.ok) {
        onSwitch?.();
      }
    } finally {
      setSwitching(null);
    }
  }

  async function handleDelete(farmId: string) {
    if (farms.length <= 1) return;
    if (!window.confirm(t.farm.deletePlotConfirm)) return;
    setDeleting(farmId);
    try {
      const res = await fetch(`/api/farm?id=${farmId}`, { method: "DELETE" });
      if (res.ok) {
        onSwitch?.();
      }
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section aria-labelledby="farm" className="px-4 py-4 space-y-6">
      {/* Current Plot Details */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="farm" className="text-[22px] font-semibold tracking-tight" dir="auto">
            {farm.name}
          </h2>
          <span className="rounded-full bg-water-deep/10 px-3 py-1 text-[12px] font-semibold text-water-deep">
            {t.farm.activePlot}
          </span>
        </div>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5">
              <dt className="text-[14px] text-ink-soft">{k}</dt>
              <dd className="text-[15px] font-medium" dir="auto">
                {v}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[13px] text-ink-soft">{fmt(t.farm.updated, { when: whenLabel(Date.parse(state.weather.fetchedAt), locale) })}</p>
        <div className="mt-4">
          <Link
            href={`/onboarding?id=${farm.id}`}
            className="inline-flex h-11 w-full items-center justify-center ay-btn rounded-xl bg-ink px-5 font-medium text-paper"
          >
            {t.farm.edit}
          </Link>
        </div>
      </div>

      {/* All Plots Management */}
      <div className="border-t border-line pt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[18px] font-semibold tracking-tight">{t.farm.plots}</h3>
          <Link
            href="/onboarding?new=1"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-[13px] font-medium text-ink hover:bg-black/5"
          >
            <Plus size={14} aria-hidden />
            <span>{t.farm.addPlot}</span>
          </Link>
        </div>

        <div className="space-y-2">
          {farms.map((f) => {
            const isActive = f.id === farm.id;
            const cropName = t.crops[f.crop as keyof typeof t.crops] ?? f.crop;
            const areaStr = fmt(t.farm.hectares, { n: f.areaHa });

            return (
              <div
                key={f.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3.5 transition ${
                  isActive ? "border-ink bg-paper shadow-sm ring-1 ring-ink" : "border-line bg-paper"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="shrink-0 text-water-deep" aria-hidden />
                    <p className="font-semibold text-[15px] truncate" dir="auto">
                      {f.name}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-soft" dir="auto">
                    {cropName} · {areaStr} {f.placeName ? `· ${f.placeName}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-water-deep">
                      <Check size={16} aria-hidden />
                      {t.farm.activePlot}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={switching === f.id}
                      onClick={() => handleSwitch(f.id)}
                      className="h-9 rounded-xl border border-line bg-paper px-3 text-[13px] font-medium hover:bg-black/5 disabled:opacity-50"
                    >
                      {switching === f.id ? "…" : t.farm.switchPlot}
                    </button>
                  )}

                  {farms.length > 1 && (
                    <button
                      type="button"
                      disabled={deleting === f.id}
                      onClick={() => handleDelete(f.id)}
                      title={t.farm.deletePlot}
                      aria-label={`${t.farm.deletePlot}: ${f.name}`}
                      className="grid size-9 place-items-center rounded-xl border border-line bg-paper text-ink-soft hover:text-alarm disabled:opacity-50"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Settings / Sign out */}
      <div className="border-t border-line pt-6 grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-medium">{t.common.language}</span>
          <LangSwitch />
        </div>
        <button
          type="button"
          onClick={async () => {
            clearStateCache(); // don't leave this farmer's plan on a shared phone
            await signOut();
            router.push("/");
            router.refresh();
          }}
          className="h-12 rounded-xl border border-line bg-paper px-5 font-medium"
        >
          {t.common.signOut}
        </button>
      </div>
    </section>
  );
}
