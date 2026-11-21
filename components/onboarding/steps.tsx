"use client";

import { Check, Droplets, Eraser, Fuel, LocateFixed, Pencil, Search, Square, Sun, SunMedium, Trash2, Undo2, Waves, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { FlyTarget, LayerId } from "@/components/map/FarmMap";
import { CROPS, CROP_IDS } from "@/lib/engine/crops";
import { SOIL_TEXTURES } from "@/lib/engine/soils";
import type { IrrigationMethod, LastIrrigated, WaterSource } from "@/lib/engine/types";
import { checkOutline, polygonAreaHa, polygonCentroid, squareFromArea } from "@/lib/field/geo";
import type { LonLat } from "@/lib/field/types";
import { fmt } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/useLang";
import { type Form, estimates } from "./form";

const FarmMap = dynamic(() => import("@/components/map/FarmMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#dfe6ea]" aria-hidden />,
});

export interface StepProps {
  form: Form;
  set: (patch: Partial<Form>) => void;
}

const field = "h-12 w-full rounded-xl border border-line bg-white px-3.5 text-[16px] text-ink placeholder:text-ink-soft/60";
const label = "grid gap-1.5 text-[15px] font-medium";

function OptionCard({
  selected,
  onClick,
  title,
  text,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  text?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-start ${
        selected ? "border-ink bg-paper ring-2 ring-ink" : "border-line bg-paper"
      }`}
    >
      {icon && <span className="mt-0.5 shrink-0 text-water-deep">{icon}</span>}
      <span>
        <span className="block text-[16px] font-semibold">{title}</span>
        {text && <span className="mt-0.5 block text-[14px] leading-snug text-ink-soft">{text}</span>}
      </span>
    </button>
  );
}

function Pills<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`h-11 rounded-full border px-4 text-[15px] ${value === o.id ? "border-ink bg-ink text-paper" : "border-line bg-paper"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────────── Step 1: where ───────────────────────────── */

interface Place {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export function LocationStep({ form, set }: StepProps) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [layer, setLayer] = useState<LayerId>("satellite");
  const [fly, setFly] = useState<FlyTarget | null>(null);
  const [geo, setGeo] = useState<"idle" | "busy" | "denied">("idle");
  const [drawing, setDrawing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [squareHa, setSquareHa] = useState(() => (Number(form.areaHa) > 0 ? form.areaHa : "1")); // the farmer's own figure, typed here
  const o = t.onboarding.location.outline;
  const status = checkOutline(form.polygon);
  const finished = status === "ok";
  const hectares = form.polygon && form.polygon.length >= 3 ? polygonAreaHa(form.polygon).toFixed(2) : "0";

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the list when the search box is emptied
      setResults(null);
      return;
    }
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=6&language=${lang}&format=json`,
          { signal: ctl.signal },
        );
        const j = (await r.json()) as { results?: Place[] };
        setResults(j.results ?? []);
      } catch {
        /* aborted or offline: keep what we had */
      }
    }, 350);
    return () => {
      clearTimeout(id);
      ctl.abort();
    };
  }, [q, lang]);

  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  const flights = useRef(0); // a new number per request, so the same place can be flown to twice
  const pick = (lat: number, lon: number, placeName?: string | null, zoom?: number) => {
    set({ lat: round(lat), lon: round(lon), ...(placeName !== undefined ? { placeName } : {}) });
    if (zoom) setFly({ lat, lon, zoom, nonce: ++flights.current });
  };

  const locate = () => {
    if (!navigator.geolocation) return setGeo("denied");
    setGeo("busy");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        pick(p.coords.latitude, p.coords.longitude, null, 16);
        setGeo("idle");
      },
      () => setGeo("denied"),
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  };

  /** The corners changed. A finished, valid outline also decides where the farm is and how big (the server does the same). */
  const setCorners = (next: LonLat[]) => {
    setNote(null);
    if (checkOutline(next) === "ok") {
      const c = polygonCentroid(next);
      set({ polygon: next, lat: round(c[1]), lon: round(c[0]), areaHa: String(Math.round(polygonAreaHa(next) * 100) / 100) });
    } else set({ polygon: next });
  };

  const startOutline = () => {
    if (form.lat === null || form.lon === null) return setNote(o.needPin);
    setNote(null);
    setDrawing(true);
    if (!form.polygon?.length) setFly({ lat: form.lat, lon: form.lon, zoom: 17, nonce: ++flights.current }); // close enough to see the field's edges
  };

  const finishOutline = () => {
    if (status === "crosses" || status === "size") return; // the problem is on screen: fix it first
    if (status !== "ok") set({ polygon: null }); // one or two stray corners are not an outline
    setDrawing(false);
  };

  const makeSquare = () => {
    const centre: LonLat | null = form.polygon && form.polygon.length >= 3 ? polygonCentroid(form.polygon) : form.lat !== null && form.lon !== null ? [form.lon, form.lat] : null;
    if (!centre) return setNote(o.needPin);
    const ha = Number(squareHa.replace(",", "."));
    setCorners(squareFromArea(centre, Number.isFinite(ha) && ha > 0 ? ha : 1));
  };

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.onboarding.location.search}
          aria-label={t.onboarding.location.search}
          className={`${field} ps-10`}
        />
        {results && (
          <ul className="absolute inset-x-0 top-full z-[1100] mt-1 overflow-hidden rounded-xl border border-line bg-paper shadow-lg">
            {results.length === 0 && <li className="px-3.5 py-3 text-[15px] text-ink-soft">{t.onboarding.location.noResults}</li>}
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="block w-full px-3.5 py-3 text-start text-[15px] hover:bg-limewash"
                  onClick={() => {
                    pick(p.latitude, p.longitude, [p.name, p.admin1].filter(Boolean).join(", "), 13);
                    setQ("");
                    setResults(null);
                  }}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-ink-soft"> · {[p.admin1, p.country].filter(Boolean).join(", ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={locate}
        disabled={geo === "busy"}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-paper font-medium disabled:opacity-60"
      >
        <LocateFixed size={18} aria-hidden />
        {geo === "busy" ? t.onboarding.location.locating : t.onboarding.location.useMyLocation}
      </button>
      {geo === "denied" && (
        <p role="alert" className="text-[14px] text-alarm">
          {t.onboarding.location.geoDenied}
        </p>
      )}

      <div className="relative h-[40svh] min-h-[260px] overflow-hidden rounded-xl border border-line" dir="ltr">
        <FarmMap
          lat={form.lat}
          lon={form.lon}
          layer={layer}
          fly={fly}
          onPick={(la, lo) => pick(la, lo)}
          outline={{ corners: form.polygon ?? [], editing: drawing, onChange: setCorners }}
        />
        <div className="absolute right-2 top-2 z-[1000] flex rounded-full bg-paper/95 p-1 text-[13px] shadow" dir="auto">
          {(["streets", "satellite", "sentinel"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={layer === id}
              onClick={() => setLayer(id)}
              className={`h-8 rounded-full px-2.5 ${layer === id ? "bg-ink text-paper" : "text-ink"}`}
            >
              {t.onboarding.location.layers[id]}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[14px] text-ink-soft" dir="auto">
        {finished && !drawing
          ? fmt(o.saved, { ha: hectares })
          : form.lat !== null && form.lon !== null
            ? fmt(t.onboarding.location.coordinates, { lat: form.lat.toFixed(4), lon: form.lon.toFixed(4) })
            : t.onboarding.location.hint}
      </p>

      <section aria-labelledby="outline-title" className="rounded-xl border border-line bg-paper p-3.5">
        <h3 id="outline-title" className="text-[15px] font-semibold">
          {o.title}
        </h3>
        {!drawing ? (
          <>
            <p className="mt-1 text-[14px] leading-snug text-ink-soft">{finished ? fmt(o.saved, { ha: hectares }) : o.intro}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={startOutline} className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-ink bg-paper px-4 font-medium">
                <Pencil size={18} aria-hidden />
                {finished ? o.edit : o.start}
              </button>
              {finished && (
                <button
                  type="button"
                  onClick={() => {
                    setNote(null);
                    set({ polygon: null });
                  }}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-paper px-4 font-medium text-ink-soft"
                >
                  <Trash2 size={18} aria-hidden />
                  {o.remove}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-[14px] leading-snug text-ink-soft">{o.help}</p>
            <p className="tabular mt-2 text-[15px] font-medium" dir="auto" aria-live="polite">
              {fmt(o.summary, { n: form.polygon?.length ?? 0, ha: hectares })}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={!form.polygon?.length} onClick={() => setCorners((form.polygon ?? []).slice(0, -1))} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-paper px-2 text-[14px] font-medium disabled:opacity-45">
                <Undo2 size={16} className="rtl:-scale-x-100" aria-hidden />
                {o.undo}
              </button>
              <button type="button" disabled={!form.polygon?.length} onClick={() => setCorners([])} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-paper px-2 text-[14px] font-medium disabled:opacity-45">
                <Eraser size={16} aria-hidden />
                {o.clear}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-[14px]">
              <label htmlFor="square-ha" className="text-ink-soft">
                {o.squareText}
              </label>
              <input
                id="square-ha"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={squareHa}
                onChange={(e) => setSquareHa(e.target.value)}
                className="h-11 w-20 rounded-xl border border-line bg-white px-3 text-[16px] text-ink"
                dir="ltr"
              />
              <span className="text-ink-soft">{o.ha}</span>
              <button type="button" onClick={makeSquare} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-paper px-3 font-medium">
                <Square size={16} className="shrink-0" aria-hidden />
                {o.squareGo}
              </button>
            </div>
            <button type="button" onClick={finishOutline} className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink font-medium text-paper">
              <Check size={18} aria-hidden />
              {o.done}
            </button>
          </>
        )}
        {(status === "crosses" || status === "size") && drawing && (
          <p role="alert" className="mt-2 text-[14px] text-alarm">
            {status === "crosses" ? t.onboarding.errors.outlineCrosses : t.onboarding.errors.outlineSize}
          </p>
        )}
        {note && (
          <p role="alert" className="mt-2 text-[14px] text-alarm">
            {note}
          </p>
        )}
      </section>

      <label className={label}>
        {t.onboarding.location.farmName}
        <input
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={form.placeName ?? t.onboarding.location.farmNameDefault}
          maxLength={80}
          className={field}
        />
      </label>
    </div>
  );
}

/* ───────────────────────────── Step 2: crop ───────────────────────────── */

export function CropStep({ form, set }: StepProps) {
  const t = useT();
  const annual = CROPS[form.crop].annual;
  const fromOutline = checkOutline(form.polygon) === "ok"; // a drawn outline decides the area
  return (
    <div className="grid gap-5">
      <div>
        <p className="mb-2 text-[15px] font-medium">{t.onboarding.crop.crop}</p>
        <div role="radiogroup" aria-label={t.onboarding.crop.crop} className="grid grid-cols-2 gap-2">
          {CROP_IDS.map((id) => (
            <OptionCard key={id} selected={form.crop === id} onClick={() => set({ crop: id })} title={t.crops[id]} />
          ))}
        </div>
      </div>
      <label className={label}>
        {t.onboarding.crop.area}
        <input
          inputMode="decimal"
          value={form.areaHa}
          readOnly={fromOutline}
          onChange={(e) => set({ areaHa: e.target.value })}
          className={`${field} text-start ${fromOutline ? "bg-limewash text-ink-soft" : ""}`}
          dir="ltr"
        />
        <span className="text-[13px] font-normal text-ink-soft">{fromOutline ? t.onboarding.crop.areaFromOutline : t.onboarding.crop.areaHint}</span>
      </label>
      {annual && (
        <label className={label}>
          {t.onboarding.crop.planted}
          <input type="date" value={form.plantingDate} onChange={(e) => set({ plantingDate: e.target.value })} className={field} dir="ltr" />
          <span className="text-[13px] font-normal text-ink-soft">{t.onboarding.crop.plantedHint}</span>
        </label>
      )}
    </div>
  );
}

/* ───────────────────────────── Step 3: water ───────────────────────────── */

const SOURCE_ICONS: Record<WaterSource, React.ReactNode> = {
  solar_basin: <Sun size={22} aria-hidden />,
  solar_direct: <SunMedium size={22} aria-hidden />,
  grid: <Zap size={22} aria-hidden />,
  diesel: <Fuel size={22} aria-hidden />,
  network: <Waves size={22} aria-hidden />,
};
const SOURCES: WaterSource[] = ["solar_basin", "solar_direct", "grid", "diesel", "network"];

export function WaterStep({ form, set }: StepProps) {
  const t = useT();
  const d = estimates(form);
  const solar = form.waterSource === "solar_basin" || form.waterSource === "solar_direct";
  const methods: IrrigationMethod[] = ["drip", "sprinkler", "surface"];

  return (
    <div className="grid gap-5">
      <div>
        <p className="mb-2 text-[15px] font-medium">{t.onboarding.water.source}</p>
        <div role="radiogroup" aria-label={t.onboarding.water.source} className="grid gap-2">
          {SOURCES.map((id) => (
            <OptionCard
              key={id}
              selected={form.waterSource === id}
              onClick={() => set({ waterSource: id })}
              title={t.sources[id].title}
              text={t.sources[id].text}
              icon={SOURCE_ICONS[id]}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[15px] font-medium">{t.onboarding.water.method}</p>
        <Pills
          name={t.onboarding.water.method}
          value={form.irrigationMethod}
          onChange={(v) => set({ irrigationMethod: v })}
          options={methods.map((m) => ({ id: m, label: t.methods[m] }))}
        />
      </div>

      {form.waterSource === "solar_basin" && (
        <label className={label}>
          {t.onboarding.water.basin}
          <input
            inputMode="decimal"
            value={form.basinM3}
            onChange={(e) => set({ basinM3: e.target.value })}
            placeholder={String(d.basinM3)}
            className={`${field} text-start`}
            dir="ltr"
          />
          <span className="text-[13px] font-normal text-ink-soft">{t.onboarding.water.estimated}</span>
        </label>
      )}
      {solar && (
        <label className={label}>
          {t.onboarding.water.pv}
          <input
            inputMode="decimal"
            value={form.pvKWp}
            onChange={(e) => set({ pvKWp: e.target.value })}
            placeholder={String(d.pvKWp)}
            className={`${field} text-start`}
            dir="ltr"
          />
          <span className="text-[13px] font-normal text-ink-soft">{t.onboarding.water.estimated}</span>
        </label>
      )}

      <details className="rounded-xl border border-line bg-paper px-3.5 py-2">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px] font-medium">
          <Droplets size={18} aria-hidden /> {t.onboarding.water.more}
        </summary>
        <div className="grid gap-4 pt-2 pb-2">
          <label className={label}>
            {t.onboarding.water.head}
            <input
              inputMode="decimal"
              value={form.pumpHeadM}
              onChange={(e) => set({ pumpHeadM: e.target.value })}
              placeholder={String(d.pumpHeadM)}
              className={`${field} text-start`}
              dir="ltr"
            />
          </label>
          <label className={label}>
            {t.onboarding.water.well}
            <input
              inputMode="decimal"
              value={form.wellSafeYieldM3h}
              onChange={(e) => set({ wellSafeYieldM3h: e.target.value })}
              placeholder={String(d.wellSafeYieldM3h)}
              className={`${field} text-start`}
              dir="ltr"
            />
            <span className="text-[13px] font-normal text-ink-soft">{t.onboarding.water.wellHint}</span>
          </label>
        </div>
      </details>
    </div>
  );
}

/* ───────────────────────────── Step 4: soil + last watering ───────────────────────────── */

const LAST: LastIrrigated[] = ["today", "1-2d", "3-5d", "week+", "unknown"];

export function SoilStep({ form, set }: StepProps) {
  const t = useT();
  return (
    <div className="grid gap-5">
      <div>
        <p className="mb-2 text-[15px] font-medium">{t.onboarding.soil.texture}</p>
        <div role="radiogroup" aria-label={t.onboarding.soil.texture} className="grid gap-2">
          {SOIL_TEXTURES.map((id) => (
            <OptionCard
              key={id}
              selected={form.soilTexture === id}
              onClick={() => set({ soilTexture: id })}
              title={t.soils[id].title}
              text={t.soils[id].feel}
            />
          ))}
          <OptionCard
            selected={form.soilTexture === "unknown"}
            onClick={() => set({ soilTexture: "unknown" })}
            title={t.onboarding.soil.unknown}
          />
        </div>
      </div>
      <div>
        <p className="mb-2 text-[15px] font-medium">{t.onboarding.soil.last}</p>
        <Pills
          name={t.onboarding.soil.last}
          value={form.lastIrrigated}
          onChange={(v) => set({ lastIrrigated: v })}
          options={LAST.map((id) => ({ id, label: t.lastIrrigated[id] }))}
        />
      </div>
    </div>
  );
}
