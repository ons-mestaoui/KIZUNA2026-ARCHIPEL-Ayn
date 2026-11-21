"use client";

import { CloudRain, Droplets, Leaf, RefreshCw, Thermometer } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { LayerId } from "@/components/map/FarmMap";
import { dayLabel } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/useLang";

type Metric = "rain" | "soil" | "heat" | "ndvi";
interface Point {
  date: string;
  value: number | null;
  distKm: number | null;
}
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

const W = 240;
const H = 70;
const PAD = 8;
const BASE = H - 12;

/** Time always runs left to right, in every language. Gaps (clouds, orbit gaps) are drawn as hollow marks. */
function Spark({ data, metric, label }: { data: MetricData; metric: Metric; label: string }) {
  const { color, kind, digits, domain } = STYLE[metric];
  const pts = data.points;
  const nums = pts.map((p) => p.value).filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  const lo = domain ? domain[0] : kind === "bars" ? 0 : Math.min(...nums) - (Math.max(...nums) - Math.min(...nums) || 1) * 0.15;
  const hi = domain ? domain[1] : Math.max(kind === "bars" ? 2 : -Infinity, ...nums) + (kind === "line" ? (Math.max(...nums) - Math.min(...nums) || 1) * 0.15 : 0);
  const n = pts.length;
  const x = (i: number) => (kind === "bars" ? PAD + ((i + 0.5) * (W - 2 * PAD)) / n : n === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
  const y = (v: number) => BASE - ((v - lo) / (hi - lo || 1)) * (BASE - 14);

  // line segments, broken at gaps
  const segments: string[] = [];
  let run: string[] = [];
  pts.forEach((p, i) => {
    if (p.value === null) {
      if (run.length) segments.push(run.join(" "));
      run = [];
    } else run.push(`${x(i)},${y(p.value)}`);
  });
  if (run.length) segments.push(run.join(" "));

  const lastIdx = (() => {
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i].value !== null) return i;
    return -1;
  })();
  const barW = ((W - 2 * PAD) / n) * 0.56;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ direction: "ltr" }} className="mt-3 block w-full" role="img" aria-label={label}>
      <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} stroke="var(--ink-soft)" strokeWidth={0.6} />
      <line x1={PAD} x2={W - PAD} y1={14} y2={14} stroke="var(--line)" strokeWidth={0.5} />
      {kind === "line" &&
        segments.map((s) => (
          <polyline key={s} points={s} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
      {pts.map((p, i) =>
        p.value === null ? (
          <circle key={p.date} cx={x(i)} cy={BASE - 4} r={2.4} fill="none" stroke="var(--ink-soft)" strokeWidth={1} />
        ) : kind === "bars" ? (
          <rect
            key={p.date}
            x={x(i) - barW / 2}
            y={Math.min(y(p.value), BASE - 1)}
            width={barW}
            height={Math.max(1, BASE - y(p.value))}
            rx={1.6}
            fill={color}
            fillOpacity={i === lastIdx ? 1 : 0.55}
          />
        ) : (
          <circle key={p.date} cx={x(i)} cy={y(p.value)} r={i === lastIdx ? 3.4 : 2.4} fill={color} stroke="var(--paper)" strokeWidth={1.2} />
        ),
      )}
      {/* direct label on the latest value */}
      {lastIdx >= 0 && (
        <text
          x={Math.min(Math.max(x(lastIdx), 14), W - 14)}
          y={Math.max(9, y(pts[lastIdx].value!) - (kind === "bars" ? 4 : 7))}
          fontSize={8}
          fontWeight={600}
          textAnchor="middle"
          fill="var(--ink)"
        >
          {pts[lastIdx].value!.toFixed(digits)}
        </text>
      )}
      <text x={PAD} y={H - 1} fontSize={7} fill="var(--ink-soft)">
        {pts[0].date.slice(5)}
      </text>
      <text x={W - PAD} y={H - 1} fontSize={7} textAnchor="end" fill="var(--ink-soft)">
        {pts[n - 1].date.slice(5)}
      </text>
    </svg>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  const t = useT();
  const locale = useLocale();
  const m = t.satellite.metrics[metric];
  const style = STYLE[metric];
  const [data, setData] = useState<MetricData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/satellite?metric=${metric}`);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as MetricData);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [metric]);
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
              <Spark data={data} metric={metric} label={`${m.title}: ${data.points.map((p) => `${shortDate(p.date)} ${p.value === null ? t.satellite.missing : p.value.toFixed(style.digits)}`).join(", ")}`} />
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

export function SatelliteTab({ lat, lon }: { lat: number; lon: number }) {
  const t = useT();
  const [layer, setLayer] = useState<LayerId>("satellite");
  return (
    <section aria-labelledby="sat" className="px-4 py-4">
      <h2 id="sat" className="text-[22px] font-semibold tracking-tight">
        {t.satellite.title}
      </h2>
      <p className="mt-1 text-[14px] text-ink-soft">{t.satellite.intro}</p>

      <div className="relative mt-4 h-[32svh] min-h-[220px] overflow-hidden rounded-xl border border-line" dir="ltr" aria-label={t.satellite.mapTitle}>
        <FarmMap lat={lat} lon={lon} layer={layer} fly={null} onPick={() => {}} readOnly zoom={layer === "sentinel" ? 13 : 15} />
        <div className="absolute end-2 top-2 z-[1000] flex rounded-full bg-paper/95 p-1 text-[13px] shadow" dir="auto">
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ORDER.map((m) => (
          <MetricCard key={m} metric={m} />
        ))}
      </div>

      <p className="mt-5 text-[12px] leading-snug text-ink-soft">{t.satellite.credit}</p>
    </section>
  );
}
