"use client";
/* eslint-disable react-hooks/immutability -- the ground texture is a three.js object that is redrawn and flagged for upload */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GREENNESS, LEAF_WATER, toCss, toHex, zoneColor, type Ramp } from "@/lib/field/ramps";
import type { FieldDTO, LonLat } from "@/lib/field/types";
import { dayLabel, whenLabel } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/useLang";
import { decodeField, frameIndex, scoresFor } from "./derive";
import { relief } from "./geometry";
import { drawGround, hillshadeCanvas } from "./ground";
import { loadPhoto } from "./photo";
import { type FieldLayer, useFieldUi } from "./store";
import { useHeights } from "./useHeights";

const FieldScene = dynamic(() => import("./FieldScene"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#dfe6ea]" aria-hidden />,
});

const CREDIT = "Sentinel-2 © ESA / Copernicus · Photo © Esri, Maxar";

function createGround(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return { canvas, texture };
}

const gradient = (r: Ramp) => `linear-gradient(to right, ${r.stops.map((c, i) => `${toHex(c)} ${Math.round((i / (r.stops.length - 1)) * 100)}%`).join(", ")})`;

/** What the colours mean: a gradient for the two continuous layers, three swatches for the zones. */
function Legend({ layer }: { layer: FieldLayer }) {
  const t = useT().field.legend;
  if (layer === "photo") return null;
  return (
    <div dir="ltr" className="rounded-xl bg-paper/90 px-2.5 py-1.5 text-[11px] leading-tight text-ink shadow-sm">
      {layer === "zones" ? (
        <div className="flex items-center gap-2">
          {([[-0.8, t.zonesLow], [0, t.zonesMid], [0.8, t.zonesHigh]] as const).map(([s, label]) => (
            <span key={label} className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm ring-1 ring-ink/15" style={{ background: toCss(zoneColor(s)) }} />
              {label}
            </span>
          ))}
        </div>
      ) : (
        <>
          <div className="h-2 w-28 rounded-full ring-1 ring-ink/15" style={{ background: gradient(layer === "water" ? LEAF_WATER : GREENNESS) }} />
          <div className="mt-0.5 flex justify-between">
            <span>{layer === "water" ? t.waterLow : t.greenLow}</span>
            <span>{layer === "water" ? t.waterHigh : t.greenHigh}</span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The real field in 3D: photo, boundary wall, satellite layers and lettered zones, with the controls laid over it.
 * Fills its parent. Whatever the parent wants at the top-start corner (the Field | Model switch) goes in `children`.
 */
export default function FieldHero({
  field,
  savedAt = null,
  pins,
  passNote,
  children,
}: {
  field: FieldDTO;
  savedAt?: number | null;
  /** extra places to mark on the ground (the demo's soil sensor) */
  pins?: { at: LonLat; content: React.ReactNode }[];
  /** a short note under the pass chips (the demo marks the heatwave) */
  passNote?: string;
  children?: React.ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const ui = useFieldUi();
  const grids = useMemo(() => decodeField(field), [field]);
  const frameIdx = frameIndex(field, ui.frame);
  const zones = field.zones?.list ?? [];
  const hasZones = zones.length >= 2;
  const layer: FieldLayer = ui.layer === "zones" && !hasZones ? "green" : ui.layer;
  const zone = ui.zone !== null && ui.zone < zones.length ? ui.zone : null;
  const scores = useMemo(() => scoresFor(field, frameIdx), [field, frameIdx]);
  const chips = useRef<(HTMLElement | null)[]>([]);
  const [photo, setPhoto] = useState<CanvasImageSource | null>(null);
  const [exag, setExag] = useState(1);

  const reduceMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []); // the fly-in is the only animation, and it is optional
  const ground = useMemo(() => createGround(field.sideM <= 700 ? 1536 : 2048), [field.sideM]);
  useEffect(() => () => ground.texture.dispose(), [ground]);

  // the photo: the bundled one (demo) paints at once; the live Esri tiles replace it when they arrive
  useEffect(() => {
    let alive = true;
    const ctl = new AbortController();
    if (field.photoUrl) {
      const img = new Image();
      img.onload = () => alive && setPhoto((p) => p ?? img);
      img.src = field.photoUrl;
    }
    loadPhoto(field.box, { signal: ctl.signal }).then((p) => {
      if (alive && p) setPhoto(p.canvas);
    });
    return () => {
      alive = false;
      ctl.abort();
    };
  }, [field]);

  // relief: heights bundled with the demo or read from open terrain tiles; shaded into the photo when there is any
  const heights = useHeights(field);
  const rel = useMemo(() => (heights ? relief(heights.data, field.sideM) : null), [heights, field.sideM]);
  const shade = useMemo(() => (heights && rel && rel.rangeM > 0.5 ? hillshadeCanvas(heights, field.sideM / (heights.w - 1), ground.canvas.width, Math.max(2, rel.exaggeration)) : null), [heights, rel, field.sideM, ground]);
  const pinAt = useMemo(() => pins?.map((p) => p.at) ?? [], [pins]);
  useEffect(() => {
    drawGround(ground.canvas, { field, grids, frame: frameIdx, layer, zone, scores, photo, shade });
    ground.texture.needsUpdate = true;
  }, [ground, field, grids, frameIdx, layer, zone, scores, photo, shade]);

  const layers: FieldLayer[] = hasZones ? ["zones", "green", "water", "photo"] : ["green", "water", "photo"];
  const short = (d: string) => dayLabel(d, locale, { day: "numeric", month: "short" });
  const chip = "pointer-events-auto rounded-full text-[13px] font-medium shadow-sm";

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "linear-gradient(#c9d9e3, #eef2ee)" }}>
      <div className="absolute inset-0">
        <FieldScene field={field} texture={ground.texture} heights={heights} chips={chips} pins={pinAt} intro={!reduceMotion} label={t.field.aria} onRelief={setExag} />
      </div>

      {/* zone chips: positioned every frame by the scene, so they follow the zones as the farmer turns the view */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {zones.map((z, i) => (
          <button
            key={z.id}
            type="button"
            ref={(el) => void (chips.current[i] = el)}
            aria-pressed={zone === i}
            aria-label={fmt(t.field.zoneName, { id: t.field.zoneLetters[i] ?? z.id })}
            onClick={() => ui.selectZone(i)}
            className="pointer-events-auto absolute top-0 left-0 grid size-11 place-items-center"
            style={{ opacity: 0 }}
          >
            <span
              className={`grid size-8 place-items-center rounded-full text-[14px] font-semibold ${zone === i ? "bg-ink text-paper" : "bg-paper/95 text-ink"}`}
              style={{ boxShadow: `inset 0 0 0 3px ${toCss(zoneColor(scores[i] ?? 0))}, 0 1px 3px rgb(23 38 74 / 0.35)` }}
            >
              {t.field.zoneLetters[i] ?? z.id}
            </span>
          </button>
        ))}
        {pins?.map((p, i) => (
          <div key={i} ref={(el) => void (chips.current[zones.length + i] = el)} className="pointer-events-none absolute top-0 left-0" style={{ opacity: 0 }}>
            {p.content}
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto min-h-9">{children}</div>
        {(field.frames.length > 1 || passNote) && (
          <div className="flex flex-col items-end gap-1">
        {field.frames.length > 1 && (
          <div role="group" aria-label={t.field.passes.label} className="pointer-events-auto flex rounded-full bg-paper/92 p-1 shadow-sm">
            {field.frames.map((f, i) => (
              <button
                key={f.date}
                type="button"
                aria-pressed={frameIdx === i}
                aria-label={`${t.field.passes.label} ${short(f.date)}`}
                onClick={() => ui.setFrame(i)}
                className={`tabular h-8 rounded-full px-3 text-[13px] ${frameIdx === i ? "bg-ink font-semibold text-paper" : "text-ink"}`}
              >
                {short(f.date)}
              </button>
            ))}
          </div>
        )}
        {passNote && <p className="rounded-full bg-paper/80 px-2.5 py-0.5 text-[11px] leading-tight text-ink-soft">{passNote}</p>}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute start-3 top-14">
        <Legend layer={layer} />
      </div>

      {(savedAt || field.partial || field.frames.length === 0) && (
        <div className="pointer-events-none absolute inset-x-3 top-[5.25rem] flex justify-center">
          <p role="status" className="max-w-[34rem] rounded-xl bg-sun/90 px-3 py-1.5 text-center text-[13px] leading-snug text-ink shadow-sm">
            {field.frames.length === 0
              ? field.lastClear
                ? fmt(t.field.noPass, { days: 75, date: short(field.lastClear) })
                : t.field.noPassEver
              : savedAt
                ? fmt(t.field.offlineSaved, { when: whenLabel(savedAt, locale) })
                : fmt(t.field.partial, { date: short(field.frames[frameIdx]?.date ?? field.frames.at(-1)!.date) })}
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3 pt-0">
        <div role="group" aria-label={t.field.layersLabel} className="pointer-events-auto flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-full bg-paper/92 p-1 shadow-sm">
          {layers.map((l) => (
            <button key={l} type="button" aria-pressed={layer === l} onClick={() => ui.setLayer(l)} className={`${chip} h-9 shrink-0 px-3.5 shadow-none ${layer === l ? "bg-ink text-paper" : "text-ink"}`}>
              {t.field.layers[l]}
            </button>
          ))}
        </div>
        <p className="w-fit max-w-full truncate rounded-full bg-paper/75 px-2 py-0.5 text-[10px] leading-tight text-ink-soft" dir="ltr">
          {CREDIT}
          {exag > 1 && <> · {fmt(t.field.relief, { n: exag.toFixed(1) })}</>}
        </p>
      </div>
    </div>
  );
}
