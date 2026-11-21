"use client";

import { CalendarDays, Leaf, MessageCircle, Satellite } from "lucide-react";
import Link from "next/link";
import { LangSwitch } from "@/components/LangSwitch";
import { Logo } from "@/components/Logo";
import { useT } from "@/lib/i18n/useLang";

const ICONS = [CalendarDays, Leaf, MessageCircle, Satellite];

export function Landing() {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[880px] flex-col px-4 pt-[max(16px,env(safe-area-inset-top))] pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3 py-2">
        <Logo />
        <div className="flex items-center gap-3">
          <LangSwitch />
          <Link href="/sign-in" className="hidden h-11 items-center rounded-full px-4 font-medium sm:inline-flex">
            {t.common.signIn}
          </Link>
        </div>
      </header>

      <section className="py-12 sm:py-20">
        <h1 className="max-w-[18ch] text-[40px] leading-[1.08] font-semibold tracking-tight sm:text-[56px]">{t.landing.title}</h1>
        <p className="mt-5 max-w-[56ch] text-[18px] leading-relaxed text-ink-soft">{t.landing.lead}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/sign-up" className="inline-flex h-13 items-center rounded-xl bg-ink px-6 text-[17px] font-medium text-paper">
            {t.landing.cta}
          </Link>
          <Link href="/sign-in" className="inline-flex h-13 items-center rounded-xl border border-line bg-paper px-6 text-[17px] font-medium">
            {t.landing.haveAccount}
          </Link>
        </div>
      </section>

      <ul className="grid gap-x-10 gap-y-6 border-t border-line pt-8 sm:grid-cols-2">
        {t.landing.features.map((f, i) => {
          const Icon = ICONS[i];
          return (
            <li key={f.title} className="flex items-start gap-4">
              <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-paper text-water-deep ring-1 ring-line">
                <Icon size={20} aria-hidden />
              </span>
              <div>
                <h2 className="text-[18px] font-semibold">{f.title}</h2>
                <p className="mt-1 text-[16px] leading-snug text-ink-soft">{f.text}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="mt-auto pt-12 text-[14px] text-ink-soft">{t.landing.kizuna}</footer>
    </main>
  );
}
