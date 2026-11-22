"use client";
/* eslint-disable @next/next/no-img-element -- these are the farmer's own photos as data: URLs; next/image cannot optimise them */

import { Bug, Camera, CircleHelp, Droplets, ImagePlus, Leaf, MessageCircle, Microscope, Sprout } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Category, DiagnosisItem } from "@/lib/diagnosis-schema";
import { whenLabel } from "@/lib/format";
import { prepareImage } from "@/lib/image";
import { fmt } from "@/lib/i18n";
import { useLang, useLocale, useT } from "@/lib/i18n/useLang";
import { Speak } from "./Speak";

const ICON: Record<Category, React.ReactNode> = {
  water_stress: <Droplets size={18} aria-hidden />,
  nutrient_deficiency: <Sprout size={18} aria-hidden />,
  pest: <Bug size={18} aria-hidden />,
  disease: <Microscope size={18} aria-hidden />,
  healthy: <Leaf size={18} aria-hidden />,
  unclear: <CircleHelp size={18} aria-hidden />,
};
// the category is always written out too, so colour never carries the meaning alone
const TONE: Record<Category, string> = {
  water_stress: "bg-water/15 text-water-deep",
  nutrient_deficiency: "bg-sun/20 text-sun-deep",
  pest: "bg-alarm/10 text-alarm",
  disease: "bg-alarm/10 text-alarm",
  healthy: "bg-leaf/10 text-leaf",
  unclear: "bg-line text-ink",
};

type Phase = "idle" | "analyzing";

export function LeafTab({ onAskInChat }: { onAskInChat?: (diagnosisName: string) => void } = {}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const locale = useLocale();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [current, setCurrent] = useState<DiagnosisItem | null>(null);
  const [history, setHistory] = useState<DiagnosisItem[]>([]);

  useEffect(() => {
    fetch("/api/diagnose")
      .then((r) => (r.ok ? (r.json() as Promise<{ items: DiagnosisItem[] }>) : { items: [] }))
      .then((j) => setHistory(j.items))
      .catch(() => {});
  }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setCurrent(null);
    let prepared;
    try {
      prepared = await prepareImage(file);
    } catch (e) {
      return setError(e instanceof Error && e.message === "too_big" ? t.leaf.errors.tooBig : t.leaf.errors.notImage);
    }
    setPreview(prepared.image);
    setPhase("analyzing");
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: prepared.image, thumb: prepared.thumb, lang }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 429) setError(fmt(t.leaf.errors.quota, { cap: j.cap ?? "" }));
      else if (res.status === 503) setError(t.leaf.errors.busy);
      else if (!res.ok) setError(t.leaf.errors.generic);
      else {
        const item: DiagnosisItem = { id: j.id, createdAt: j.createdAt, thumb: j.thumb, result: j.result, cached: j.cached };
        setCurrent(item);
        setHistory((h) => [item, ...h]);
      }
    } catch {
      setError(t.leaf.errors.generic);
    } finally {
      setPhase("idle");
      if (camera.current) camera.current.value = "";
      if (gallery.current) gallery.current.value = "";
    }
  }

  const r = current?.result;
  return (
    <section aria-labelledby="leaf" className="px-4 py-4">
      <h2 id="leaf" className="text-[22px] font-semibold tracking-tight">
        {t.leaf.title}
      </h2>
      <p className="mt-1 text-[14px] text-ink-soft">{t.leaf.intro}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={phase === "analyzing"}
          onClick={() => camera.current?.click()}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-ink px-3 font-medium text-paper disabled:opacity-60"
        >
          <Camera size={20} aria-hidden />
          {t.leaf.take}
        </button>
        <button
          type="button"
          disabled={phase === "analyzing"}
          onClick={() => gallery.current?.click()}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-line bg-paper px-3 font-medium disabled:opacity-60"
        >
          <ImagePlus size={20} aria-hidden />
          {t.leaf.pick}
        </button>
        {/* capture="environment" opens the phone's back camera directly */}
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <input ref={gallery} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>

      {phase === "analyzing" && (
        <div role="status" className="mt-5 flex items-center gap-3 rounded-xl bg-paper px-3.5 py-3 ring-1 ring-line">
          {preview && <img src={preview} alt="" className="size-16 rounded-lg object-cover" />}
          <span className="flex items-center gap-2 text-[15px]">
            <span className="size-4 animate-spin rounded-full border-2 border-ink-soft border-t-transparent" aria-hidden />
            {t.leaf.analyzing}
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-alarm/10 px-3 py-2 text-[15px] text-alarm">
          {error}
        </p>
      )}

      {r && current && phase === "idle" && (
        <article className="mt-5 rounded-2xl bg-paper p-4 ring-1 ring-line" aria-live="polite">
          <div className="flex items-start gap-3">
            {preview && <img src={preview} alt="" className="size-20 shrink-0 rounded-xl object-cover" />}
            <div className="min-w-0">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium ${TONE[r.category]}`}>
                {ICON[r.category]}
                {t.leaf.categories[r.category]}
              </span>
              <h3 className="mt-1.5 text-[18px] leading-snug font-semibold" dir="auto">
                {r.name}
              </h3>
              <p className="text-[13px] text-ink-soft">{t.leaf.confidence[r.confidence]}</p>
            </div>
          </div>

          <p className="mt-3 text-[15px] leading-relaxed" dir="auto">
            {r.summary}
          </p>

          {r.evidence.length > 0 && (
            <>
              <h4 className="mt-4 text-[14px] font-semibold">{t.leaf.seen}</h4>
              <ul className="mt-1 list-disc ps-5 text-[14px] leading-snug text-ink-soft" dir="auto">
                {r.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          )}

          {r.actions.length > 0 && (
            <>
              <h4 className="mt-4 text-[14px] font-semibold">{t.leaf.todo}</h4>
              <ol className="mt-1 list-decimal ps-5 text-[15px] leading-snug" dir="auto">
                {r.actions.map((a) => (
                  <li key={a} className="mt-1">
                    {a}
                  </li>
                ))}
              </ol>
            </>
          )}

          {r.waterAdvice && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-water/10 px-3 py-2 text-[14px] leading-snug" dir="auto">
              <Droplets size={16} className="mt-0.5 shrink-0 text-water-deep" aria-hidden />
              <span>
                <span className="font-semibold">{t.leaf.water}: </span>
                {r.waterAdvice}
              </span>
            </p>
          )}

          {r.needsExpert && (
            <p role="note" className="mt-3 rounded-lg bg-sun/15 px-3 py-2 text-[14px]">
              {t.leaf.expert}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Speak text={r.voice} lang={lang} />
            {onAskInChat && (
              <button
                type="button"
                onClick={() => onAskInChat(r.name)}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-paper px-4 text-[14px] font-medium transition hover:bg-black/5"
              >
                <MessageCircle size={16} aria-hidden />
                {t.leaf.askInChat || "Discuss in Chat"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setCurrent(null);
                setPreview(null);
              }}
              className="h-11 rounded-full px-4 text-[15px] font-medium underline underline-offset-4"
            >
              {t.leaf.another}
            </button>
          </div>
          <p className="mt-3 text-[12px] text-ink-soft">{t.leaf.disclaimer}</p>
          {current.cached && <p className="mt-1 text-[12px] font-medium text-sun-deep">{t.demo.saved}</p>}
        </article>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[15px] font-semibold">{t.leaf.history}</h3>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrent(h);
                    setPreview(h.thumb);
                    setError(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="flex min-h-16 w-full items-center gap-3 py-2 text-start"
                >
                  {h.thumb ? (
                    <img src={h.thumb} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className={`grid size-12 shrink-0 place-items-center rounded-lg ${TONE[h.result.category]}`}>{ICON[h.result.category]}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium" dir="auto">
                      {h.result.name}
                    </span>
                    <span className="block text-[13px] text-ink-soft">
                      {t.leaf.categories[h.result.category]} · {whenLabel(Date.parse(h.createdAt), locale)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
