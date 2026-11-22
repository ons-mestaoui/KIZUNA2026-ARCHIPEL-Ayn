"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DemoTrigger } from "@/components/demo/DemoTrigger";
import { LangSwitch } from "@/components/LangSwitch";
import { Logo } from "@/components/Logo";
import { useT } from "@/lib/i18n/useLang";

const IDS = ["field", "day", "languages", "about"] as const;
type Id = (typeof IDS)[number];
/** Sections the reader can be in, including one with no link of its own (it clears the highlight). */
const SPY = [...IDS, "honest"] as const;

/** Which section the reader is in: the last one whose top has passed 45 % of the screen. */
function useSpy(): Id | null {
  const [active, setActive] = useState<Id | null>(null);
  useEffect(() => {
    let raf = 0;
    const calc = () => {
      raf = 0;
      const line = window.innerHeight * 0.45;
      let cur: string | null = null;
      for (const id of SPY) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) cur = id;
      }
      setActive(cur === "honest" ? null : (cur as Id | null));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(calc);
    };
    calc();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return active;
}

export function Nav() {
  const t = useT();
  const l = t.landing;
  const n = l.nav;
  const active = useSpy();
  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const labels: Record<Id, string> = { field: n.field, day: n.day, languages: n.languages, about: n.about };

  const close = useCallback(() => {
    setOpen(false);
    menuBtn.current?.focus();
  }, []);

  // modal behaviour for the phone menu: Esc closes, Tab stays inside, the page behind does not scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheet.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab" || !sheet.current) return;
      const items = [...sheet.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const go = (id: Id) => (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 60);
  };

  return (
    <>
      <a
        href="#main"
        className="fixed start-3 top-3 z-[60] -translate-y-24 rounded-full bg-sun px-5 py-3 text-[15px] font-semibold text-night focus:translate-y-0"
      >
        {l.skip}
      </a>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex w-full max-w-[1120px] items-center gap-2 rounded-full bg-paper/95 py-1.5 ps-5 pe-1.5 text-ink shadow-[0_10px_40px_-12px_rgb(13_23_49/0.5)] ring-1 ring-ink/10">
          <DemoTrigger>
            <Logo />
          </DemoTrigger>
          <nav aria-label={n.label} className="mx-auto hidden md:block">
            <LayoutGroup>
              <ul className="flex items-center gap-1">
                {IDS.map((id) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      aria-current={active === id ? "location" : undefined}
                      className="relative inline-flex h-11 items-center rounded-full px-4 text-[15px] font-medium text-ink/75 transition-colors hover:text-ink aria-[current=location]:text-ink"
                    >
                      {labels[id]}
                      {active === id && (
                        <motion.span layoutId="ay-nav-dot" transition={{ type: "spring", stiffness: 500, damping: 40 }} className="absolute inset-x-4 bottom-1.5 h-[3px] rounded-full bg-sun" />
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </LayoutGroup>
          </nav>
          <div className="ms-auto flex items-center gap-1.5 md:ms-0">
            <span className="hidden xl:inline-flex">
              <LangSwitch />
            </span>
            <Link href="/sign-in" className="hidden h-11 items-center rounded-full px-4 text-[15px] font-medium hover:bg-ink/5 sm:inline-flex">
              {t.common.signIn}
            </Link>
            <Link href="/sign-up" className="ay-btn hidden h-11 items-center rounded-full bg-ink px-5 text-[15px] font-semibold text-paper sm:inline-flex">
              {l.hero.cta}
            </Link>
            <button
              ref={menuBtn}
              type="button"
              aria-expanded={open}
              aria-controls="ay-sheet"
              aria-label={n.open}
              onClick={() => setOpen(true)}
              className="grid size-11 place-items-center rounded-full bg-ink text-paper md:hidden"
            >
              <Menu size={20} aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={sheet}
            id="ay-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={n.label}
            initial={{ clipPath: "circle(0px at calc(100% - 38px) 38px)" }}
            animate={{ clipPath: "circle(160vmax at calc(100% - 38px) 38px)" }}
            exit={{ clipPath: "circle(0px at calc(100% - 38px) 38px)" }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex flex-col bg-night px-6 pt-[max(20px,env(safe-area-inset-top))] pb-[max(28px,env(safe-area-inset-bottom))] text-paper"
          >
            <div className="flex items-center justify-between">
              <span className="text-[15px] text-paper/60">{n.label}</span>
              <button type="button" onClick={close} aria-label={n.close} className="grid size-11 place-items-center rounded-full bg-paper/10">
                <X size={20} aria-hidden />
              </button>
            </div>
            <ul className="mt-10 grid gap-1">
              {IDS.map((id, i) => (
                <motion.li key={id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 + i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                  <a href={`#${id}`} onClick={go(id)} className="font-display flex min-h-14 items-center text-[2rem] leading-none font-bold tracking-tight">
                    {labels[id]}
                  </a>
                </motion.li>
              ))}
            </ul>
            <div className="mt-auto grid gap-4">
              <LangSwitch className="justify-self-start !border-paper/20 !bg-paper/10 [&_button]:!text-paper [&_button[aria-checked=true]]:!bg-sun [&_button[aria-checked=true]]:!text-night" />
              <Link href="/sign-up" className="inline-flex h-14 items-center justify-center rounded-full bg-sun text-[17px] font-semibold text-night">
                {l.hero.cta}
              </Link>
              <Link href="/sign-in" className="inline-flex h-12 items-center justify-center rounded-full border border-paper/25 text-[16px] font-medium">
                {t.common.signIn}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
