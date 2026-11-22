"use client";

import { CloudRain, Droplets, Leaf, RefreshCw, Thermometer } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { FieldTrendCard } from "@/components/field/FieldTrendCard";
import type { FieldData } from "@/components/field/useFieldData";
import type { LayerId } from "@/components/map/FarmMap";
import type { LonLat } from "@/lib/field/types";
import { type Point, Spark } from "./Spark";
import { dayLabel } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/useLang";

type Metric = "rain" | "soil" | "heat" | "ndvi";
interface MetricData {
  metric: Metric;
  unit: string;
  points: Point[];
  latest: Point | null;
  pixelKm: number | null;
}

const FarmMap = dynamic(() => import("@/components/map/FarmMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#dfe6ea]" aria-hidden />,
});

// One hue per metric (not a rainbow): water, soil, heat, vegetation.
const STYLE: Record<Metric, { color: string; icon: React.ReactNode; kind: "bars" | "line"; digits: number; domain?: [number, number] }> = {
  rain: { color: "var(--mark-water)", icon: <CloudRain size={18} aria-hidden />, kind: "bars", digits: 1 },
  soil: { color: "var(--soil-wet)", icon: <Droplets size={18} aria-hidden />, kind: "line", digits: 1 },
  heat: { color: "var(--sun-deep)", icon: <Thermometer size={18} aria-hidden />, kind: "line", digits: 1 },
  ndvi: { color: "var(--leaf)", icon: <Leaf size={18} aria-hidden />, kind: "line", digits: 2, domain: [0, 1] },
};
const ORDER: Metric[] = ["rain", "soil", "heat", "ndvi"];

function MetricCard({ metric, farmId }: { metric: Metric; farmId?: string }) {
  const t = useT();
  const locale = useLocale();
  const m = t.satellite.metrics[metric];
  const style = STYLE[metric];
  const [data, setData] = useState<MetricData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const url = farmId ? `/api/satellite?metric=${metric}&farmId=${encodeURIComponent(farmId)}` : `/api/satellite?metric=${metric}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as MetricData);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [metric, farmId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount: the card shows its loading state first
    load();
  }, [load]);

  const latest = data?.latest;
  const total = data && metric === "rain" ? data.points.reduce((s, p) => s + (p.value ?? 0), 0) : null;
  const shortDate = (d: string) => dayLabel(d, locale, { day: "numeric", month: "short" });

  return (
    <article className="rounded-2xl bg-paper p-4 ring-1 ring-line" aria-busy={state === "loading"}>
      <header className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-limewash" style={{ color: style.color }}>
          {style.icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-[16px] leading-tight font-semibold">{m.title}</h3>
          <p className="text-[12px] text-ink-soft" dir="ltr">
            {m.sat}
          </p>
        </div>
      </header>

      {state === "loading" && (
        <div role="status" className="mt-4">
          <div className="h-9 w-32 animate-pulse rounded-lg bg-line" />
          <div className="mt-3 h-16 animate-pulse rounded-lg bg-line/70" />
          <span className="sr-only">{t.satellite.loading}</span>
        </div>
      )}

      {state === "error" && (
        <div className="mt-4">
          <p className="text-[14px] text-alarm">{t.satellite.error}</p>
          <button type="button" onClick={load} className="mt-2 inline-flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-[14px] font-medium">
            <RefreshCw size={14} aria-hidden />
            {t.satellite.retry}
          </button>
        </div>
      )}

      {state === "ready" && data && (
        <>
          {latest && latest.value !== null ? (
            <>
              <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
                <span className="tabular text-[32px] leading-none font-semibold tracking-tight" dir="ltr">
                  {latest.value.toFixed(style.digits)}
                  {data.unit && <span className="ms-1 text-[16px] font-medium">{data.unit}</span>}
                </span>
                <span className="text-[13px] text-ink-soft">{shortDate(latest.date)}</span>
              </p>
              <p className="mt-1 text-[13px] text-ink-soft">
                {latest.distKm !== null && latest.distKm >= 1 && <>{fmt(t.satellite.away, { km: Math.round(latest.distKm) })} · </>}
                {data.pixelKm !== null && fmt(t.satellite.pixel, { km: data.pixelKm.toFixed(1) })}
                {total !== null && <> · {fmt(t.satellite.total, { mm: total.toFixed(1), n: data.points.length })}</>}
              </p>
              <Spark points={data.points} style={style} label={`${m.title}: ${data.points.map((p) => `${shortDate(p.date)} ${p.value === null ? t.satellite.missing : p.value.toFixed(style.digits)}`).join(", ")}`} />
            </>
          ) : (
            <p className="mt-3 text-[14px] text-ink-soft">{t.satellite.noReading}</p>
          )}

          <p className="mt-3 text-[13px] leading-snug text-ink-soft">{m.meaning}</p>

          {data.points.length > 0 && (
            <details className="mt-3">
              <summary className="min-h-11 cursor-pointer py-2 text-[13px] font-medium underline underline-offset-4">{t.satellite.numbers}</summary>
              <table className="tabular w-full text-[13px]">
                <thead>
                  <tr className="text-start text-ink-soft">
                    <th className="py-1 text-start font-normal">{t.satellite.date}</th>
                    <th className="py-1 text-end font-normal">{t.satellite.value}</th>
                  </tr>
                </thead>
                <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-1">
                  {[...data.points].reverse().map((p) => (
                    <tr key={p.date}>
                      <td>{shortDate(p.date)}</td>
                      <td className="text-end" dir="ltr">
                        {p.value === null ? t.satellite.missing : `${p.value.toFixed(style.digits)} ${data.unit}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </article>
  );
}

export function SatelliteTab({
  lat,
  lon,
  polygon,
  fieldData,
  farmId,
}: {
  lat: number;
  lon: number;
  polygon?: LonLat[] | null;
  fieldData?: FieldData;
  farmId?: string;
}) {
  const t = useT();
  const [layer, setLayer] = useState<LayerId>("satellite");
  const mapKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;

  return (
    <section aria-labelledby="sat" className="px-4 py-4">
      <h2 id="sat" className="text-[22px] font-semibold tracking-tight">
        {t.satellite.title}
      </h2>
      <p className="mt-1 text-[14px] text-ink-soft">{t.satellite.intro}</p>

      <div className="relative mt-4 h-[32svh] min-h-[220px] overflow-hidden rounded-xl border border-line" dir="ltr" aria-label={t.satellite.mapTitle}>
        <FarmMap
          key={mapKey}
          lat={lat}
          lon={lon}
          layer={layer}
          fly={null}
          onPick={() => {}}
          readOnly
          zoom={layer === "sentinel" ? 13 : 15}
          outline={polygon && polygon.length >= 3 ? { corners: polygon, editing: false } : undefined}
          fitOutline={layer === "satellite"}
        />
        <div className="absolute right-2 top-2 z-[1000] flex rounded-full bg-paper/95 p-1 text-[13px] shadow" dir="auto">
          {(["satellite", "sentinel"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={layer === id}
              onClick={() => setLayer(id)}
              className={`h-8 rounded-full px-3 ${layer === id ? "bg-ink text-paper" : "text-ink"}`}
            >
              {t.satellite.layers[id]}
            </button>
          ))}
        </div>
      </div>

      {fieldData?.field && <FieldTrendCard key={fieldData.field.sideM} field={fieldData.field} />}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ORDER.map((m) => (
          <MetricCard key={`${farmId ?? mapKey}-${m}`} metric={m} farmId={farmId} />
        ))}
      </div>

      <p className="mt-5 text-[12px] leading-snug text-ink-soft">{t.satellite.credit}</p>
    </section>
  );
}
