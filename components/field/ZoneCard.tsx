"use client";

import { CircleCheck, Droplets, Eye } from "lucide-react";
import { useMemo } from "react";
import { type Advice, adviseZones } from "@/lib/field/advice";
import { toCss, zoneColor } from "@/lib/field/ramps";
import type { FieldDTO } from "@/lib/field/types";
import { dayLabel } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/useLang";
import { frameIndex, scoresFor } from "./derive";
import { useFieldUi } from "./store";

/**
 * What the satellite view means for today, in one line a farmer can act on, with the zones as chips under it. It orders
 * where the water goes first; the watering plan above it still decides how much. The numbers behind it (greenness, leaf
 * water, the history of each zone, what 10 m pixels can and cannot tell) are the assistant's to explain.
 */
export function ZoneCard({ field, decision }: { field: FieldDTO; decision: "irrigate" | "skip" }) {
  const t = useT();
  const c = t.field.card;
  const locale = useLocale();
  const ui = useFieldUi();
  const idx = frameIndex(field, ui.frame);
  const latest = field.stats[idx] ?? null;
  const previous = idx > 0 ? field.stats[idx - 1] : null;
  const zones = field.zones?.list ?? [];
  const { advice, rows, trend, persistent } = useMemo(() => adviseZones({ latest, previous, decision }), [latest, previous, decision]);
  const scores = useMemo(() => scoresFor(field, idx), [field, idx]);
  if (!latest || latest.field.ndvi === null) return null;

  const date = (d: string) => dayLabel(d, locale, { day: "numeric", month: "short" });
  const letter = (i: number) => t.field.zoneLetters[i] ?? zones[i]?.id ?? "";
  const zone = ui.zone !== null && ui.zone < zones.length ? ui.zone : null;

  const headline = (a: Advice): { text: string; icon: React.ReactNode } => {
    switch (a.kind) {
      case "waterFirst":
        return { text: fmt(c.waterFirst, { zone: letter(a.zone) }), icon: <Droplets size={20} aria-hidden /> };
      case "check":
        return { text: fmt(a.why === "green" ? c.checkGreen : c.checkLeaves, { zone: letter(a.zone) }), icon: <Eye size={20} aria-hidden /> };
      case "even":
        return { text: c.even, icon: <CircleCheck size={20} aria-hidden /> };
      default:
        return { text: c.noZones, icon: <CircleCheck size={20} aria-hidden /> };
    }
  };
  const h = headline(advice);
  /** what is worth saying about a zone: only the differences from the field average, or that there are none */
  const notable = (r: (typeof rows)[number]) => {
    const parts = [r.tag !== "similar" ? c.tag[r.tag] : "", r.wet !== "similar" ? c.wet[r.wet] : ""].filter(Boolean);
    return parts.length ? parts : [c.average];
  };
  const picked = zone !== null ? rows.find((r) => r.zone === zone) : null;
  // one quiet line at most: that the zone already looked this way (it may not be thirst), or that it is slipping
  const note = persistent ? fmt(c.persistent, { date: date(persistent.since) }) : trend ? fmt(c.trend, { zone: letter(trend.zone), date: date(trend.since) }) : null;

  return (
    <section aria-labelledby="zone-card" className="ay-rise mx-4 my-3 rounded-2xl bg-limewash/70 p-4 ring-1 ring-line" style={{ "--d": "140ms" } as React.CSSProperties}>
      <p className="text-[13px] text-ink-soft">{c.title}</p>
      <h2 id="zone-card" className="mt-1 flex items-start gap-2 text-[20px] leading-tight font-semibold tracking-tight">
        <span className="mt-0.5 shrink-0 text-water-deep">{h.icon}</span>
        {h.text}
      </h2>

      {zones.length >= 2 && (
        <ul className="mt-3 flex flex-wrap gap-1">
          {rows.map((r) => (
            <li key={r.zone}>
              <button
                type="button"
                aria-pressed={zone === r.zone}
                aria-label={`${letter(r.zone)} · ${notable(r).join(" · ")}`}
                onClick={() => ui.selectZone(r.zone)}
                className="grid size-11 place-items-center rounded-full"
              >
                <span
                  className={`grid size-9 place-items-center rounded-full text-[14px] font-semibold transition-colors ${zone === r.zone ? "bg-ink text-paper" : "bg-paper text-ink"}`}
                  style={{ boxShadow: `inset 0 0 0 3px ${toCss(zoneColor(scores[r.zone] ?? 0))}` }}
                >
                  {letter(r.zone)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p aria-live="polite" className="mt-1 min-h-0 text-[14px] leading-snug text-ink-soft empty:hidden">
        {picked && (
          <>
            {notable(picked).join(" · ")} · <bdi dir="ltr">{(zones[picked.zone]?.areaHa ?? 0).toFixed(2)} ha</bdi>
          </>
        )}
      </p>
      {note && <p className="mt-2 text-[14px] leading-snug text-sun-deep">{note}</p>}
    </section>
  );
}
