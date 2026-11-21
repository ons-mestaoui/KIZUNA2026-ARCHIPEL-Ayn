"use client";

import { create } from "zustand";
import { type Dict, LANGS, type Lang, dictionaries, isLang } from "@/lib/i18n";

const KEY = "gd-lang";

function apply(lang: Lang) {
  const l = LANGS.find((x) => x.id === lang)!;
  document.documentElement.lang = l.id;
  document.documentElement.dir = l.dir;
}

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Called once on mount: saved choice → browser language → English. */
  init: () => void;
}

export const useLang = create<LangState>((set) => ({
  lang: "en",
  setLang: (lang) => {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* private mode: the choice just won't persist */
    }
    apply(lang);
    set({ lang });
  },
  init: () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    const nav = navigator.language?.slice(0, 2);
    const lang: Lang = isLang(saved) ? saved : isLang(nav) ? nav : "en";
    apply(lang);
    set({ lang });
  },
}));

export function useT(): Dict {
  return dictionaries[useLang((s) => s.lang)];
}

export function useLocale(): string {
  const lang = useLang((s) => s.lang); // one hook call, always — never inside a callback
  return LANGS.find((l) => l.id === lang)!.locale;
}
