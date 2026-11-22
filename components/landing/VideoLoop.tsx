"use client";

import { Pause, Play } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/useLang";
import type { Clip } from "./media";

const saveData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

/**
 * A silent looping video that behaves: it plays only while it is on screen, never autoplays under "reduce motion" or
 * "data saver", and has a pause/play control (anything that moves for more than 5 s must be stoppable).
 *
 * `hold` pauses it for a moment (the hero holds it while the eye is being scrolled open, so the browser is not decoding video
 * and redrawing the clip at the same time). A dialog that opens over the page also pauses it (the "ay-modal" event).
 *
 * `ref` is a callback ref on purpose: the hero draws its video only after the page has measured itself, so the element can
 * appear after the first render. `watch` is the element whose visibility counts (the hero watches its tall stage, not the
 * clipped video inside it).
 */
export function useLoopVideo({ onProgress, watch, hold = false }: { onProgress?: (fraction: number) => void; watch?: RefObject<Element | null>; hold?: boolean } = {}) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const progress = useRef(onProgress);
  useEffect(() => {
    progress.current = onProgress;
  });
  const reduced = useReducedMotion();
  const [inView, setInView] = useState(false);
  const [manual, setManual] = useState<boolean | null>(null); // the viewer's own choice, once made
  const [playing, setPlaying] = useState(false);
  const [save, setSave] = useState(false);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    const on = (e: Event) => setModal((e as CustomEvent<boolean>).detail);
    window.addEventListener("ay-modal", on);
    return () => window.removeEventListener("ay-modal", on);
  }, []);

  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.05 });
    io.observe(watch?.current ?? el);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => el.duration && progress.current?.(el.currentTime / el.duration);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTime);
    queueMicrotask(() => setSave(saveData()));
    return () => {
      io.disconnect();
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("timeupdate", onTime);
    };
  }, [el, watch]);

  const auto = !reduced && !save;
  const shouldPlay = inView && !hold && !modal && (manual ?? auto);
  useEffect(() => {
    if (!el) return;
    if (shouldPlay) el.play().catch(() => {});
    else el.pause();
  }, [el, shouldPlay]);

  return { ref: setEl, playing, toggle: () => setManual(!playing) };
}

export function PlayButton({ playing, onClick, className = "" }: { playing: boolean; onClick: () => void; className?: string }) {
  const t = useT().landing.video;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={playing ? t.pause : t.play}
      className={`grid size-11 place-items-center rounded-full bg-night/80 text-paper transition-colors hover:bg-night ${className}`}
    >
      {playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
    </button>
  );
}

export function ClipSources({ clip }: { clip: Clip }) {
  return (
    <>
      <source src={clip.webm} type="video/webm" />
      <source src={clip.mp4} type="video/mp4" />
    </>
  );
}

export function VideoLoop({
  clip,
  label,
  className = "",
  onProgress,
}: {
  clip: Clip;
  label: string;
  className?: string;
  onProgress?: (fraction: number) => void;
}) {
  const { ref, playing, toggle } = useLoopVideo({ onProgress });
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <video ref={ref} muted loop playsInline preload="metadata" poster={clip.poster} aria-label={label} className="size-full object-cover">
        <ClipSources clip={clip} />
      </video>
      <PlayButton playing={playing} onClick={toggle} className="absolute end-3 bottom-3" />
    </div>
  );
}
