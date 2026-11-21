"use client";

import { Leaf, Satellite } from "lucide-react";
import type { FieldDTO } from "@/lib/field/types";
import { dayLabel } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/useLang";
import { type Point, Spark, type SparkStyle } from "@/components/farmer/Spark";

const GREEN: SparkStyle = { color: "var(--leaf)", kind: "line", digits: 2 };
const WATER: SparkStyle = { color: "var(--mark-water)", kind: "line", digits: 2 };

/** The field's own greenness and leaf water on every clear pass, from the field outline (10 m Sentinel-2 pixels). */
export function FieldTrendCard({ field }: { field: FieldDTO }) {
  const t = useT().field.series;
  const locale = useLocale();
  if (field.series.length < 2) return null;
  const short = (d: string) => dayLabel(d, locale, { day: "numeric", month: "short" });
  const track = (key: "ndvi" | "ndmi"): Point[] => field.series.map((s) => ({ date: s.date, value: s[key], distKm: null }));
  const latest = (key: "ndvi" | "ndmi") => [...field.series].reverse().find((s) => s[key] !== null);
  const blocks = [
    { key: "ndvi" as const, title: t.green, style: GREEN, icon: <Leaf size={16} aria-hidden /> },
    { key: "ndmi" as const, title: t.water, style: WATER, icon: <Satellite size={16} aria-hidden /> },
  ];

  return (
    <article className="mt-4 rounded-2xl bg-paper p-4 ring-1 ring-line">
      <header className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-limewash text-leaf">
          <Satellite size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-[16px] leading-tight font-semibold">{t.title}</h3>
          <p className="text-[12px] text-ink-soft" dir="ltr">
            {t.sat}
          </p>
        </div>
      </header>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {blocks.map((b) => {
          const l = latest(b.key);
          return (
            <div key={b.key}>
              <p className="flex items-baseline justify-between gap-2 text-[14px]">
                <span className="flex items-center gap-1.5 font-medium" style={{ color: b.style.color }}>
                  {b.icon}
                  <span className="text-ink">{b.title}</span>
                </span>
                {l && (
                  <span className="tabular text-ink-soft" dir="ltr">
                    <span className="text-[20px] font-semibold text-ink">{l[b.key]!.toFixed(2)}</span> · {short(l.date)}
                  </span>
                )}
              </p>
              <Spark points={track(b.key)} style={b.style} label={`${b.title}: ${field.series.map((s) => `${short(s.date)} ${s[b.key] === null ? "–" : s[b.key]!.toFixed(2)}`).join(", ")}`} />
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[13px] leading-snug text-ink-soft">{t.meaning}</p>
    </article>
  );
}
