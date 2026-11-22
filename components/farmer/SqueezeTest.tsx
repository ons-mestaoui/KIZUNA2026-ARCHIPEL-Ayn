"use client";

import { Check, ChevronDown, Hand } from "lucide-react";
import { useState } from "react";
import type { SoilFeel } from "@/lib/engine/types";
import { useT } from "@/lib/i18n/useLang";

const FEELS: SoilFeel[] = ["dry", "moist", "wet"];

/**
 * The squeeze test: no sensor needed. The answer re-anchors the water-balance estimate. It is an optional extra, so it
 * stays one closed row until the farmer wants it.
 */
export function SqueezeTest({
  today,
  lastCheck,
  onChange,
}: {
  today: string;
  lastCheck: { date: string; feel: SoilFeel } | null;
  onChange: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<SoilFeel | null>(null);
  const [thanks, setThanks] = useState(false);
  const doneToday = lastCheck?.date === today ? lastCheck.feel : null;

  async function send(feel: SoilFeel) {
    setBusy(feel);
    try {
      await fetch("/api/soil-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feel }) });
      setThanks(true);
      onChange();
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="group mx-4 my-1 border-t border-line">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
        <span id="squeeze" className="flex items-center gap-2">
          <Hand size={18} className="text-ink-soft" aria-hidden />
          {t.today.squeeze.title}
        </span>
        <span className="flex items-center gap-2 text-[13px] font-normal text-ink-soft">
          {doneToday && (
            <span className="flex items-center gap-1 text-leaf">
              <Check size={14} aria-hidden />
              {t.today.squeeze.done}
            </span>
          )}
          <ChevronDown size={18} className="transition-transform duration-200 group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <div className="pb-3">
        <p className="text-[14px] text-ink-soft">{t.today.squeeze.text}</p>
        <div role="radiogroup" aria-labelledby="squeeze" className="mt-3 grid gap-2">
          {FEELS.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={doneToday === f}
              disabled={busy !== null}
              onClick={() => send(f)}
              className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3.5 text-start text-[15px] ${
                doneToday === f ? "border-ink bg-paper ring-2 ring-ink" : "border-line bg-paper"
              }`}
            >
              <span>{t.today.squeeze[f]}</span>
              {doneToday === f && <Check size={18} aria-hidden />}
            </button>
          ))}
        </div>
        {thanks && (
          <p role="status" className="mt-2 text-[14px] text-leaf">
            {t.today.squeeze.thanks}
          </p>
        )}
      </div>
    </details>
  );
}
