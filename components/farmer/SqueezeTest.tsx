"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import type { SoilFeel } from "@/lib/engine/types";
import { useT } from "@/lib/i18n/useLang";

const FEELS: SoilFeel[] = ["dry", "moist", "wet"];

/** The squeeze test: no sensor needed. The answer re-anchors the water-balance estimate. */
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
    <section aria-labelledby="squeeze" className="mx-4 my-3 border-t border-line pt-3">
      <h3 id="squeeze" className="font-semibold">
        {t.today.squeeze.title}
      </h3>
      <p className="mt-1 text-[14px] text-ink-soft">{t.today.squeeze.text}</p>
      <div role="radiogroup" aria-label={t.today.squeeze.title} className="mt-3 grid gap-2">
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
    </section>
  );
}
