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

const num = (v: number | null, digits = 2) => (v === null ? "–" : v.toFixed(digits));

/**
 * What the satellite view means for today, in words a farmer can act on, with the zones listed under it. It orders
 * where the water goes first; the watering plan above it still decides how much.
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
  const totalHa = zones.reduce((sum, z) => sum + z.areaHa, 0);

  const date = (d: string) => dayLabel(d, locale, { day: "numeric", month: "short" });
  const letter = (i: number) => t.field.zoneLetters[i] ?? zones[i]?.id ?? "";
  const zone = ui.zone !== null && ui.zone < zones.length ? ui.zone : null;

  const headline = (a: Advice): { text: string; why: string; icon: React.ReactNode } => {
    switch (a.kind) {
      case "waterFirst":
        return { text: fmt(c.waterFirst, { zone: letter(a.zone) }), why: c.waterFirstWhy, icon: <Droplets size={20} aria-hidden /> };
      case "check":
        return {
          text: fmt(a.why === "green" ? c.checkGreen : a.why === "both" ? c.checkBoth : c.checkLeaves, { zone: letter(a.zone) }),
          why: a.why === "green" ? c.checkGreenWhy : a.why === "both" ? c.checkBothWhy : c.checkLeavesWhy,
          icon: <Eye size={20} aria-hidden />,
        };
      case "even":
        return { text: c.even, why: c.evenWhy, icon: <CircleCheck size={20} aria-hidden /> };
      default:
        return { text: c.noZones, why: "", icon: <CircleCheck size={20} aria-hidden /> };
    }
  };
  const h = headline(advice);
  /** what is worth saying about a zone: only the differences from the field average, or that there are none */
  const notable = (r: (typeof rows)[number]) => {
    const parts = [r.tag !== "similar" ? c.tag[r.tag] : "", r.wet !== "similar" ? c.wet[r.wet] : ""].filter(Boolean);
    return parts.length ? parts : [c.average];
  };
  const frameDate = field.frames[idx]?.date ?? latest.date;

  return (
    <section aria-labelledby="zone-card" className="ay-rise mx-4 my-3 rounded-2xl bg-paper p-4 ring-1 ring-line" style={{ "--d": "140ms" } as React.CSSProperties}>
      <p className="text-[13px] text-ink-soft">
        {c.title} · {fmt(c.pass, { date: date(frameDate) })}
      </p>
      <h2 id="zone-card" className="mt-1 flex items-start gap-2 text-[20px] leading-tight font-semibold tracking-tight">
        <span className="mt-0.5 shrink-0 text-water-deep">{h.icon}</span>
        {h.text}
      </h2>
      {h.why && <p className="mt-1.5 text-[15px] leading-snug text-ink-soft">{h.why}</p>}
      {persistent && <p className="mt-1.5 text-[14px] leading-snug text-sun-deep">{fmt(c.persistent, { date: date(persistent.since) })}</p>}

      {zones.length >= 2 && (
        <ul className="mt-3 grid gap-1">
          {rows.map((r) => (
            <li key={r.zone}>
              <button
                type="button"
                aria-pressed={zone === r.zone}
                onClick={() => ui.selectZone(r.zone)}
                className={`block w-full rounded-xl px-2 py-1.5 text-start ${zone === r.zone ? "bg-limewash ring-1 ring-ink/25" : ""}`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-paper text-[13px] font-semibold"
                    style={{ boxShadow: `inset 0 0 0 3px ${toCss(zoneColor(scores[r.zone] ?? 0))}` }}
                  >
                    {letter(r.zone)}
                  </span>
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-line" dir="ltr">
                    <span className="block h-full rounded-full" style={{ width: `${Math.round(Math.min(1, Math.max(0, r.ndvi ?? 0)) * 100)}%`, background: toCss(zoneColor(scores[r.zone] ?? 0)) }} />
                  </span>
                  <span className="tabular w-10 shrink-0 text-end text-[14px] font-medium" dir="ltr">
                    {num(r.ndvi)}
                  </span>
                </span>
                <span className="mt-0.5 block ps-[38px] text-[13px] text-ink-soft">
                  {r.ndvi === null ? (
                    "–"
                  ) : (
                    <>
                      {notable(r).join(" · ")} · <bdi dir="ltr">{num(zones[r.zone]?.areaHa ?? null, 2)} ha</bdi>
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {trend && <p className="mt-2 text-[14px] leading-snug text-sun-deep">{fmt(c.trend, { zone: letter(trend.zone), date: date(trend.since) })}</p>}

      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-2.5 text-[14px] font-medium underline underline-offset-4">{c.numbers}</summary>
        <table className="tabular w-full text-[13px]">
          <thead>
            <tr className="text-start text-ink-soft">
              <th className="py-1 text-start font-normal">{c.columns.zone}</th>
              <th className="py-1 text-end font-normal">{c.columns.area}</th>
              <th className="py-1 text-end font-normal">{c.columns.green}</th>
              <th className="py-1 text-end font-normal">{c.columns.water}</th>
            </tr>
          </thead>
          <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-1">
            {zones.map((z, i) => (
              <tr key={z.id}>
                <td>{fmt(t.field.zoneName, { id: letter(i) })}</td>
                <td className="text-end" dir="ltr">
                  {z.areaHa.toFixed(2)} ha
                </td>
                <td className="text-end" dir="ltr">
                  {num(latest.zones[i]?.ndvi ?? null)}
                </td>
                <td className="text-end" dir="ltr">
                  {num(latest.zones[i]?.ndmi ?? null)}
                </td>
              </tr>
            ))}
            <tr className="font-medium">
              <td>{c.fieldReading}</td>
              <td className="text-end" dir="ltr">
                {totalHa.toFixed(2)} ha
              </td>
              <td className="text-end" dir="ltr">
                {num(latest.field.ndvi)}
              </td>
              <td className="text-end" dir="ltr">
                {num(latest.field.ndmi)}
              </td>
            </tr>
          </tbody>
        </table>
      </details>

      <p className="mt-2 text-[12px] leading-snug text-ink-soft">{c.limits}</p>
    </section>
  );
}
