"use client";

import { useT } from "@/lib/i18n/useLang";

export type HeroView = "field" | "model";

/** Field (the real parcel from space) | Model (the soil, water and solar diagram). */
export function ViewSwitch({ view, onChange }: { view: HeroView; onChange: (v: HeroView) => void }) {
  const t = useT().field;
  return (
    <div role="group" aria-label={t.viewsLabel} className="pointer-events-auto flex rounded-full bg-paper/92 p-1 shadow-sm">
      {(["field", "model"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={`h-8 rounded-full px-3.5 text-[13px] font-medium ${view === v ? "bg-ink text-paper" : "text-ink"}`}
        >
          {t.views[v]}
        </button>
      ))}
    </div>
  );
}
