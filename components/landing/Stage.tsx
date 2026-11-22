"use client";

import { Play } from "lucide-react";
import Link from "next/link";
import { type MotionValue, motion, useMotionValue, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { type CSSProperties, type Ref, type RefObject, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLang, useT } from "@/lib/i18n/useLang";
import { Iris } from "./Iris";
import { MEDIA } from "./media";
import { ClipSources, PlayButton, useLoopVideo } from "./VideoLoop";

/** How many times the eye grows while the page scrolls (it ends far larger than the screen). */
const GROW = 14;

const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeReduce = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** "Reduce motion", read the way that cannot cause a hydration mismatch: the server (and the first client render) say no. */
function useReduced() {
  return useSyncExternalStore(subscribeReduce, () => window.matchMedia(REDUCE).matches, () => false);
}

/**
 * The hero and the page's one big moment, on one pinned stage: a golden drop in an eye made of contour rings;
 * as you scroll the eye opens until the real field fills the screen ("Your field, seen from space").
 * With "reduce motion" nothing is pinned: the eye stays a window onto a still frame, and the field follows as a plain block.
 */
export function Stage({ onWatch }: { onWatch: () => void }) {
  return useReduced() ? <StaticStage onWatch={onWatch} /> : <PinnedStage onWatch={onWatch} />;
}

// ── the eye's geometry ──────────────────────────────────────────────────────────────────────────────────────────
interface Geo {
  W: number;
  H: number;
  /** where the eye is centred (px from the stage's top-left) */
  ax: number;
  ay: number;
  /** its resting width */
  eye0: number;
  /** the footage's own frame: as large as the stage needs to be covered (its aspect is 16:9), centred on the stage */
  cw: number;
  ch: number;
  /** how far the footage is scaled down while the eye is shut, so the field and its kit fit inside the eye */
  rest: number;
}

function geoFor(W: number, H: number, rtl: boolean): Geo {
  const mobile = W < 768;
  const side = (x: number) => (rtl ? W - x : x); // the eye sits on the side away from the text
  const cw = Math.max(W, H * (16 / 9));
  const base = mobile ? { ax: W * 0.5, ay: H * 0.27, eye0: W * 0.94 } : { ax: side(W * 0.68), ay: H * 0.5, eye0: Math.min(W * 0.46, Math.min(W, H) * 0.74) };
  // shut, the eye shows the middle 60 % of the footage's width; it settles to full size as the eye opens
  return { W, H, ...base, cw, ch: (cw * 9) / 16, rest: Math.min(1, Math.max(0.3, base.eye0 / (cw * 0.6))) };
}

/** The stage's size, once the browser has laid it out (null on the server and during hydration). */
function useGeo(ref: RefObject<HTMLElement | null>): Geo | null {
  const [geo, setGeo] = useState<Geo | null>(null);
  const rtl = useLang((s) => s.lang) === "ar";
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setGeo(geoFor(window.innerWidth, window.innerHeight, rtl));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, rtl]);
  return geo;
}

// The lids, as the logo draws them: M3 16 C11 5.5 37 5.5 45 16 (and the mirror image below), in a 42 × 15.75 box.
const bez = (t: number, a: number, b: number, c: number, d: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
const LID: [number, number][] = Array.from({ length: 33 }, (_, i) => {
  const t = i / 32;
  return [bez(t, 3, 11, 37, 45) - 24, bez(t, 16, 5.5, 5.5, 16) - 16]; // x from the middle, y from the middle (negative = up)
});

/** The eye as a clip-path polygon, `w` px wide and centred on (ax, ay). Cheap: no big mask layer, whatever the size. */
function almond(ax: number, ay: number, w: number): string {
  const s = w / 42;
  const top = LID.map(([x, y]) => `${(ax + x * s).toFixed(1)}px ${(ay + y * s).toFixed(1)}px`);
  const bottom = [...LID].reverse().map(([x, y]) => `${(ax + x * s).toFixed(1)}px ${(ay - y * s).toFixed(1)}px`);
  return `polygon(${[...top, ...bottom].join(",")})`;
}

type Scroll = MotionValue<number>;

/** The motion values that describe the eye: how wide it is, how far the footage is still shifted toward it. */
function useEye(p: Scroll, geo: Geo | null) {
  const s = useTransform(p, [0.03, 0.66], [0, 1], { clamp: true });
  const w = useTransform(s, (v) => (geo?.eye0 ?? 0) * Math.exp(Math.log(GROW) * v));
  const clip = useTransform(w, (v) => (geo ? almond(geo.ax, geo.ay, v) : "none"));
  // the footage settles to full size and centre early (by a third of the way), well before the eye has outgrown the screen
  const settle = useTransform(s, (v) => 1 - (1 - Math.min(1, v / 0.35)) ** 3);
  const panX = useTransform(settle, (v) => (geo ? (geo.ax - geo.W / 2) * (1 - v) : 0));
  const panY = useTransform(settle, (v) => (geo ? (geo.ay - geo.H / 2) * (1 - v) : 0));
  const scale = useTransform(settle, (v) => (geo ? geo.rest + (1 - geo.rest) * v : 1));
  // the rings are drawn once at a fixed size and only scaled (a GPU transform): resizing a big vector drawing every frame is what made scrolling heavy
  const k = useTransform(s, (v) => Math.exp(Math.log(GROW) * v));
  const dropW = useTransform(w, (v) => Math.max(22, v * 0.062));
  return { w, k, clip, panX, panY, scale, dropW };
}

// ── pieces ──────────────────────────────────────────────────────────────────────────────────────────────────────
function HeroText({ onWatch }: { onWatch: () => void }) {
  const t = useT().landing.hero;
  return (
    <div className="relative z-10 mx-auto flex h-full w-full max-w-[1280px] items-end px-5 pt-28 pb-14 md:items-center md:px-10 md:pb-0">
      <div className="max-w-[33rem]">
        <h1 className="ay-rise font-display text-[clamp(2.3rem,4.7vw,4.3rem)] leading-[1.03] font-bold tracking-tight text-paper" style={{ "--d": "80ms" } as CSSProperties}>
          {t.title}
        </h1>
        <p className="ay-rise mt-5 max-w-[30rem] text-[17px] leading-relaxed text-paper/80 md:text-[18px]" style={{ "--d": "220ms" } as CSSProperties}>
          {t.lead}
        </p>
        <div className="ay-rise mt-7 flex flex-wrap items-center gap-3" style={{ "--d": "360ms" } as CSSProperties}>
          <Link href="/sign-up" className="ay-btn inline-flex h-13 items-center rounded-full bg-sun px-7 text-[17px] font-semibold text-night">
            {t.cta}
          </Link>
          <button type="button" onClick={onWatch} className="ay-btn inline-flex h-13 items-center gap-2.5 rounded-full border border-paper/35 px-6 text-[17px] font-medium text-paper hover:bg-paper/10">
            <Play size={16} fill="currentColor" aria-hidden />
            {t.watch}
          </button>
        </div>
        <p className="ay-rise mt-6 flex items-start gap-2 text-[14px] leading-snug text-paper/65" style={{ "--d": "500ms" } as CSSProperties}>
          <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-sun" aria-hidden />
          {t.fact}
        </p>
      </div>
    </div>
  );
}

/** The rings, the window onto the field, the eye's outline and the drop. Drawn only once the stage has a size. */
function Eye({
  geo,
  eye,
  videoRef,
  rings,
  outline,
  drop,
}: {
  geo: Geo;
  eye: ReturnType<typeof useEye>;
  videoRef: Ref<HTMLVideoElement>;
  rings: MotionValue<number>;
  outline: MotionValue<number>;
  drop: MotionValue<number>;
}) {
  const t = useT().landing.video;
  const { ax, ay } = geo;
  return (
    <div className="ay-fade absolute inset-0">
      <motion.div
        style={{ opacity: rings, scale: eye.k, left: ax - geo.eye0 * 0.95, top: ay - geo.eye0 * 0.95, width: geo.eye0 * 1.9, height: geo.eye0 * 1.9 }}
        aria-hidden
        className="pointer-events-none absolute will-change-transform"
      >
        <div className="size-full">
          <Iris className="size-full" />
        </div>
      </motion.div>
      <motion.div style={{ clipPath: eye.clip }} className="absolute inset-0">
        <motion.div
          style={{ x: eye.panX, y: eye.panY, scale: eye.scale, width: geo.cw, height: geo.ch, left: (geo.W - geo.cw) / 2, top: (geo.H - geo.ch) / 2 }}
          className="absolute"
        >
          <video ref={videoRef} muted loop playsInline preload="metadata" poster={MEDIA.hero.poster} aria-label={t.hero} className="size-full object-cover">
            <ClipSources clip={MEDIA.hero} />
          </video>
        </motion.div>
      </motion.div>
      <motion.svg
        style={{ opacity: outline, left: ax, top: ay, width: eye.w, x: "-50%", y: "-50%" }}
        viewBox="3 8.125 42 15.75"
        fill="none"
        aria-hidden
        className="pointer-events-none absolute overflow-visible"
      >
        <path d="M3 16C11 5.5 37 5.5 45 16C37 26.5 11 26.5 3 16Z" stroke="var(--sun)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </motion.svg>
      <motion.div style={{ opacity: drop, left: ax, top: ay, width: eye.dropW, x: "-50%", y: "-52%" }} aria-hidden className="pointer-events-none absolute aspect-[18/22]">
        <span className="ay-ripple" />
        <span className="ay-ripple" style={{ animationDelay: "1.4s" }} />
        <svg viewBox="0 0 18 22" className="relative size-full drop-shadow-[0_0_18px_rgba(227,162,26,.55)]">
          <path d="M9 1C9 1 1.5 10 1.5 14.2a7.5 7.5 0 0 0 15 0C16.5 10 9 1 9 1Z" fill="var(--sun)" />
          <ellipse cx="11.6" cy="15.4" rx="1.3" ry="2.3" fill="#fff" opacity=".5" transform="rotate(18 11.6 15.4)" />
        </svg>
      </motion.div>
    </div>
  );
}

function PinnedStage({ onWatch }: { onWatch: () => void }) {
  const t = useT().landing;
  const stage = useRef<HTMLDivElement>(null);
  const geo = useGeo(stage);
  const [moving, setMoving] = useState(false);
  const { ref: videoRef, playing, toggle } = useLoopVideo({ watch: stage, hold: moving });
  const { scrollYProgress: p } = useScroll({ target: stage, offset: ["start start", "end end"] });
  const eye = useEye(p, geo);
  const heroOpacity = useTransform(p, [0, 0.12], [1, 0]);
  const heroY = useTransform(p, [0, 0.12], [0, -36]);
  const dropOpacity = useTransform(p, [0, 0.1], [1, 0]);
  const ringsOpacity = useTransform(p, [0.02, 0.3], [1, 0]);
  const outlineOpacity = useTransform(p, [0.4, 0.62], [1, 0]);
  const scrimOpacity = useTransform(p, [0.5, 0.72], [0, 1]);
  const fieldOpacity = useTransform(p, [0.58, 0.76], [0, 1]);
  const fieldY = useTransform(p, [0.58, 0.76], [28, 0]);
  const cueOpacity = useTransform(p, [0, 0.05], [1, 0]);
  const controlOpacity = useTransform(p, [0.6, 0.72], [0, 1]);
  const controlEvents = useTransform(p, (v) => (v > 0.62 ? "auto" : "none"));
  const [past, setPast] = useState(false);
  const settle = useRef(0);
  useMotionValueEvent(p, "change", (v) => {
    setPast(v > 0.1);
    // while the page is being scrolled the video holds still, then carries on 180 ms after the last movement
    setMoving(true);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => setMoving(false), 180);
  });

  return (
    <div ref={stage} id="top" className="relative bg-night text-paper" style={{ height: "300svh" }}>
      <span id="field" aria-hidden className="absolute start-0" style={{ top: "76%" }} />
      <div className="sticky top-0 h-svh overflow-hidden">
        <div className="ay-contours absolute inset-0" aria-hidden />
        {geo && <Eye geo={geo} eye={eye} videoRef={videoRef} rings={ringsOpacity} outline={outlineOpacity} drop={dropOpacity} />}

        <motion.div style={{ opacity: scrimOpacity }} aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night/90 via-night/35 to-night/10" />

        <motion.div style={{ opacity: heroOpacity, y: heroY }} className="absolute inset-0" aria-hidden={past} inert={past}>
          <HeroText onWatch={onWatch} />
        </motion.div>

        <motion.div style={{ opacity: cueOpacity }} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-5 hidden justify-center md:flex">
          <span className="ay-cue" />
        </motion.div>

        <motion.div style={{ opacity: fieldOpacity, y: fieldY }} className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
          <div className="mx-auto max-w-[1280px] px-5 pb-12 md:px-10 md:pb-16">
            <h2 className="font-display max-w-[16ch] text-[clamp(2rem,4.6vw,3.9rem)] leading-[1.05] font-bold tracking-tight text-paper">{t.field.title}</h2>
            <p className="mt-4 max-w-[34rem] text-[17px] leading-relaxed text-paper/85 md:text-[18px]">{t.field.text}</p>
          </div>
        </motion.div>
        <motion.div style={{ opacity: controlOpacity, pointerEvents: controlEvents }} className="absolute end-4 top-20 z-10 md:end-8">
          <PlayButton playing={playing} onClick={toggle} />
        </motion.div>
      </div>
    </div>
  );
}

function StaticStage({ onWatch }: { onWatch: () => void }) {
  const t = useT().landing;
  const stage = useRef<HTMLDivElement>(null);
  const geo = useGeo(stage);
  const { ref: videoRef } = useLoopVideo({ watch: stage });
  const rest = useMotionValue(0);
  const eye = useEye(rest, geo);
  const one = useMotionValue(1);
  return (
    <>
      <div ref={stage} id="top" className="relative min-h-svh overflow-hidden bg-night text-paper">
        <div className="ay-contours absolute inset-0" aria-hidden />
        {geo && <Eye geo={geo} eye={eye} videoRef={videoRef} rings={one} outline={one} drop={one} />}
        <HeroText onWatch={onWatch} />
      </div>
      <section id="field" className="bg-night px-5 py-20 text-paper md:px-10">
        <div className="mx-auto grid max-w-[1280px] gap-8 md:grid-cols-[1fr_1.4fr] md:items-center">
          <div>
            <h2 className="font-display text-[clamp(2rem,4.6vw,3.6rem)] leading-[1.05] font-bold tracking-tight">{t.field.title}</h2>
            <p className="mt-4 max-w-[34rem] text-[17px] leading-relaxed text-paper/85">{t.field.text}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MEDIA.hero.poster} alt={t.video.hero} width={1280} height={800} className="w-full rounded-3xl" />
        </div>
      </section>
    </>
  );
}
