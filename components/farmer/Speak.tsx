"use client";

import { Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useLang";

// A silent, empty WAV. Playing it inside the tap "unlocks" the audio element on iOS/Android, so the
// real sentence can start a moment later, after the network round trip.
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
const BROWSER_LOCALE: Record<Lang, string> = { en: "en-GB", ar: "ar-TN", ja: "ja-JP" };

/** "Listen" button: server voice (Tunisian Arabic, Japanese, English); the browser's own voice if that fails. */
export function Speak({ text, lang, className = "" }: { text: string; lang: Lang; className?: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      audio.current?.pause();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    },
    [],
  );

  async function toggle() {
    if (state !== "idle") {
      audio.current?.pause();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      return setState("idle");
    }
    const a = (audio.current ??= new Audio());
    a.src = SILENCE;
    void a.play().catch(() => {}); // inside the tap: unlocks audio
    setState("loading");
    try {
      const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang }) });
      if (!res.ok) throw new Error(String(res.status));
      a.src = URL.createObjectURL(await res.blob());
      a.onended = () => setState("idle");
      a.onerror = () => setState("idle");
      await a.play();
      setState("playing");
    } catch {
      if (!("speechSynthesis" in window)) return setState("idle");
      const u = new SpeechSynthesisUtterance(text);
      u.lang = BROWSER_LOCALE[lang];
      u.onend = () => setState("idle");
      u.onerror = () => setState("idle");
      speechSynthesis.speak(u);
      setState("playing");
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state === "playing"}
      className={`inline-flex h-11 items-center gap-2 rounded-full border border-line bg-paper px-4 text-[15px] font-medium ${className}`}
    >
      {state === "playing" ? <Square size={16} aria-hidden /> : <Volume2 size={18} aria-hidden />}
      {state === "playing" ? t.leaf.stop : t.leaf.listen}
      {state === "loading" && <span className="size-3 animate-spin rounded-full border-2 border-ink-soft border-t-transparent" aria-hidden />}
    </button>
  );
}
