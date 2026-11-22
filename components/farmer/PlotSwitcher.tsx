"use client";

import { Check, ChevronDown, MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FarmDTO } from "@/lib/farm-types";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useLang";

export function PlotSwitcher({
  current,
  farms,
  onSwitch,
}: {
  current: FarmDTO;
  farms: FarmDTO[];
  onSwitch: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function handleSelect(farmId: string) {
    if (farmId === current.id) {
      setOpen(false);
      return;
    }
    setSwitching(farmId);
    try {
      const res = await fetch("/api/farm/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmId }),
      });
      if (res.ok) {
        onSwitch();
      }
    } finally {
      setSwitching(null);
      setOpen(false);
    }
  }

  const list = farms.length ? farms : [current];

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.farm.switchPlot}
        className="flex h-10 items-center gap-1.5 rounded-full border border-line bg-paper px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-paper/80"
      >
        <MapPin size={15} className="shrink-0 text-water-deep" aria-hidden />
        <span className="max-w-[110px] truncate sm:max-w-[180px] md:max-w-[220px]" dir="auto">
          {current.name}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t.farm.plots}
          className="absolute start-0 top-full z-50 mt-1.5 w-[280px] sm:w-[320px] rounded-2xl border border-line bg-paper p-1.5 shadow-xl"
        >
          <div className="px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-ink-soft">
            {t.farm.plots} ({list.length})
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {list.map((f) => {
              const active = f.id === current.id;
              const cropLabel = t.crops[f.crop as keyof typeof t.crops] ?? f.crop;
              const areaLabel = fmt(t.farm.hectares, { n: f.areaHa });
              const isBusy = switching === f.id;

              return (
                <button
                  key={f.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={isBusy}
                  onClick={() => handleSelect(f.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-start transition ${
                    active ? "bg-ink/5 font-semibold text-ink" : "text-ink hover:bg-black/5"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="truncate text-[14px]" dir="auto">
                      {f.name}
                    </p>
                    <p className="text-[12px] text-ink-soft" dir="auto">
                      {cropLabel} · {areaLabel}
                    </p>
                  </div>
                  {active && <Check size={16} className="shrink-0 text-water-deep" aria-hidden />}
                  {isBusy && <span className="text-[12px] text-ink-soft animate-pulse">…</span>}
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 border-t border-line pt-1.5">
            <Link
              href="/onboarding?new=1"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-ink hover:bg-black/5"
            >
              <Plus size={16} className="shrink-0 text-ink-soft" aria-hidden />
              <span>{t.farm.addPlot}</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
