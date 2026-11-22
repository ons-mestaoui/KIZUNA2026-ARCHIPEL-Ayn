"use client";

import { Calculator, Layers, Leaf } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Mark } from "@/components/Logo";
import { fmt } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/useLang";
import { MEDIA, SCREEN_NAMES, TEAM, screenSrc } from "./media";
import { VideoLoop } from "./VideoLoop";

const EASE = [0.16, 1, 0.3, 1] as const;

/** One day: the footage on the right, the three moments of the day on the left, the current one lit as the video plays. */
export function DayLoop() {
  const t = useT().landing;
  const [step, setStep] = useState(0);
  return (
    <section id="day" className="scroll-mt-4 bg-limewash py-24 md:flex md:min-h-svh md:items-center md:py-28">
      <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-5 md:grid-cols-[0.8fr_1.35fr] md:items-center md:gap-14 md:px-10">
        <div>
          <h2 className="font-display max-w-[14ch] text-[clamp(2rem,4.2vw,3.6rem)] leading-[1.05] font-bold tracking-tight">{t.day.title}</h2>
          <p className="mt-4 max-w-[30rem] text-[17px] leading-relaxed text-ink-soft">{t.day.text}</p>
          <ol className="mt-8 grid gap-1.5">
            {t.day.steps.map((s, i) => (
              <li
                key={s.when}
                aria-current={step === i ? "step" : undefined}
                className="border-s-[3px] border-line ps-4 py-2 transition-colors duration-500 aria-[current=step]:border-sun"
              >
                <p className={`font-display text-[19px] font-semibold transition-colors duration-500 ${step === i ? "text-ink" : "text-ink/45"}`}>{s.when}</p>
                <p className={`mt-0.5 text-[16px] leading-snug transition-colors duration-500 ${step === i ? "text-ink-soft" : "text-ink/40"}`}>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
        <VideoLoop
          clip={MEDIA.day}
          label={t.video.day}
          className="aspect-[8/5] rounded-[28px] bg-night shadow-[0_40px_80px_-40px_rgb(13_23_49/0.55)]"
          onProgress={(f) => setStep(f < 0.3 ? 0 : f < 0.62 ? 1 : 2)}
        />
      </div>
    </section>
  );
}

/** The app in a phone, in the farmer's language; the buttons swap the screen. */
export function Languages() {
  const t = useT().landing;
  const lang = useLang((s) => s.lang);
  const [screen, setScreen] = useState(0);
  return (
    <section id="languages" className="scroll-mt-4 bg-night-2 py-24 text-paper md:flex md:min-h-svh md:items-center md:py-28">
      <div className="mx-auto grid w-full max-w-[1280px] gap-12 px-5 md:grid-cols-[1.1fr_0.9fr] md:items-center md:gap-16 md:px-10">
        <div>
          <h2 className="font-display max-w-[14ch] text-[clamp(2rem,4.2vw,3.6rem)] leading-[1.05] font-bold tracking-tight">{t.languages.title}</h2>
          <p className="mt-4 max-w-[32rem] text-[17px] leading-relaxed text-paper/80">{t.languages.text}</p>
          <div role="group" aria-label={t.languages.title} className="mt-8 flex flex-wrap gap-2">
            {t.languages.screens.map((label, i) => (
              <button
                key={label}
                type="button"
                aria-pressed={screen === i}
                onClick={() => setScreen(i)}
                className="ay-btn h-12 rounded-full border border-paper/25 px-5 text-[16px] font-medium text-paper aria-pressed:border-sun aria-pressed:bg-sun aria-pressed:text-night"
              >
                {label}
              </button>
            ))}
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[16px] text-paper/60" aria-hidden>
            {["العربية", "Tounsi", "Français", "日本語", "English"].map((x) => (
              <li key={x} lang={x === "العربية" ? "ar" : x === "日本語" ? "ja" : "en"}>
                {x}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto w-[min(72vw,300px)] rounded-[44px] bg-[#05091a] p-[9px] shadow-[0_50px_90px_-30px_rgb(0_0_0/0.7)] ring-1 ring-paper/15">
          <div className="relative aspect-[390/844] overflow-hidden rounded-[36px] bg-limewash">
            <AnimatePresence initial={false}>
              <motion.img
                key={screen}
                src={screenSrc(SCREEN_NAMES[screen], lang)}
                alt={t.languages.screens[screen]}
                width={780}
                height={1688}
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="absolute inset-0 size-full object-cover object-top"
              />
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

const HONEST_ICONS = [Layers, Leaf, Calculator];

/** What it can and cannot tell you: three plain facts, from the README's honest limits. */
export function Honest() {
  const t = useT().landing;
  return (
    <section id="honest" className="bg-limewash py-24 md:flex md:min-h-[80svh] md:items-center md:py-28">
      <div className="mx-auto w-full max-w-[1280px] px-5 md:px-10">
        <h2 className="font-display max-w-[18ch] text-[clamp(2rem,4.2vw,3.6rem)] leading-[1.05] font-bold tracking-tight">{t.honest.title}</h2>
        <ul className="mt-12 grid gap-10 md:grid-cols-3 md:gap-12">
          {t.honest.items.map((it, i) => {
            const Icon = HONEST_ICONS[i];
            return (
              <li key={it.title} className="border-t-2 border-ink pt-6">
                <span className="grid size-12 place-items-center rounded-full bg-cobalt text-paper">
                  <Icon size={22} aria-hidden />
                </span>
                <h3 className="font-display mt-5 text-[22px] leading-tight font-semibold">{it.title}</h3>
                <p className="mt-2 text-[17px] leading-relaxed text-ink-soft">{it.text}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Who we are: the story in two lines, the meaning of the name, and the four of us. */
export function About() {
  const t = useT().landing;
  return (
    <section id="about" className="scroll-mt-4 bg-night py-24 text-paper md:py-32">
      <div className="mx-auto w-full max-w-[1280px] px-5 md:px-10">
        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-end md:gap-16">
          <h2 className="font-display text-[clamp(2.1rem,4.8vw,4.2rem)] leading-[1.04] font-bold tracking-tight">{t.about.title}</h2>
          <div>
            <p className="max-w-[32rem] text-[17px] leading-relaxed text-paper/80">{t.about.text}</p>
            <p className="mt-5 flex items-start gap-3 text-[16px] leading-snug text-paper/65">
              <Mark height={20} className="mt-0.5 shrink-0 text-paper" />
              {t.about.meaning}
            </p>
          </div>
        </div>

        <h3 className="font-display mt-20 text-[22px] font-semibold text-paper/90 md:mt-28">{t.about.teamTitle}</h3>
        <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {TEAM.map((p) => (
            <li key={p.slug}>
              <figure className="ay-duo">
                <div className="relative aspect-square overflow-hidden rounded-[26px] bg-night-2 md:rounded-[32px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt={fmt(t.about.portrait, { name: p.name })} width={640} height={640} loading="lazy" className="size-full object-cover" />
                  <span aria-hidden className="ay-duo-tint" />
                </div>
                <figcaption className="font-display mt-3 text-[17px] leading-snug font-semibold md:text-[19px]">
                  <span dir="ltr" translate="no">
                    {p.name}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FinalCta() {
  const t = useT().landing;
  return (
    <section className="bg-sun py-20 text-night md:py-28">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-5 md:flex-row md:items-end md:justify-between md:px-10">
        <div>
          <h2 className="font-display max-w-[14ch] text-[clamp(2.2rem,5vw,4.4rem)] leading-[1.02] font-bold tracking-tight">{t.final.title}</h2>
          <p className="mt-4 max-w-[28rem] text-[18px] leading-snug">{t.final.text}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/sign-up" className="ay-btn inline-flex h-14 items-center rounded-full bg-night px-8 text-[17px] font-semibold text-paper">
            {t.final.cta}
          </Link>
          <Link href="/sign-in" className="ay-btn inline-flex h-14 items-center rounded-full border-2 border-night px-7 text-[17px] font-semibold">
            {t.final.signIn}
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const t = useT().landing;
  return (
    <footer className="bg-night px-5 py-10 text-paper/65 md:px-10">
      <div className="mx-auto grid max-w-[1280px] gap-3 text-[13px] leading-relaxed">
        <p>{t.footer.credits}</p>
        <p className="text-paper/80">{t.footer.kizuna}</p>
      </div>
    </footer>
  );
}
