"use client";

import { useEffect } from "react";
import { LANGS } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/useLang";

/** Mounted once in the root layout: applies the saved / browser language on first load. */
export function LangBoot() {
  useEffect(() => {
    useLang.getState().init();
  }, []);
  return null;
}

export function LangSwitch({ className = "" }: { className?: string }) {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t.common.language}
      dir="ltr"
      className={`inline-flex rounded-full border border-line bg-paper p-1 text-[14px] ${className}`}
    >
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={lang === l.id}
          lang={l.id}
          onClick={() => setLang(l.id)}
          className={`h-9 rounded-full px-3 ${lang === l.id ? "bg-ink text-paper" : "text-ink"}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
