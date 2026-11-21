"use client";

import { Camera, RotateCcw, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/useLang";
import { prepareImage } from "@/lib/image";
import { detectSpeechLang, speakable } from "@/lib/speech";
import { Speak } from "./Speak";

interface Msg {
  id: number | string;
  role: "user" | "assistant";
  content: string;
}
const PHOTO_TAG = "📷 "; // the server marks messages that came with a photo

export function AskTab() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/ask")
      .then((r) => (r.ok ? (r.json() as Promise<{ items: Msg[] }>) : { items: [] }))
      .then((j) => setMsgs(j.items))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  async function attach(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      setPhoto((await prepareImage(f)).image);
    } catch {
      setError(t.ask.errors.photo);
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  async function send(question?: string) {
    const message = (question ?? text).trim();
    if (!message || busy) return;
    const attached = photo;
    const temp = `tmp${Date.now()}`;
    setError(null);
    setBusy(true);
    setMsgs((m) => [...m, { id: temp, role: "user", content: (attached ? PHOTO_TAG : "") + message }]);
    setText("");
    setPhoto(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, image: attached ?? undefined, lang }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // nothing was saved: take the question back so the farmer can resend it
        setMsgs((m) => m.filter((x) => x.id !== temp));
        setText(message);
        setPhoto(attached);
        setError(res.status === 429 ? fmt(t.ask.errors.quota, { cap: j.cap ?? "" }) : res.status === 503 ? t.ask.errors.busy : t.ask.errors.generic);
      } else {
        setMsgs((m) => [...m, { id: j.id, role: "assistant", content: j.reply }]);
      }
    } catch {
      setMsgs((m) => m.filter((x) => x.id !== temp));
      setText(message);
      setPhoto(attached);
      setError(t.ask.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    await fetch("/api/ask", { method: "DELETE" }).catch(() => {});
    setMsgs([]);
    setError(null);
  }

  return (
    <section aria-labelledby="ask" className="px-4 pt-4 pb-40 lg:pb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="ask" className="text-[22px] font-semibold tracking-tight">
            {t.ask.title}
          </h2>
          <p className="mt-1 text-[14px] text-ink-soft">{t.ask.intro}</p>
        </div>
        {msgs.length > 0 && (
          <button
            type="button"
            onClick={reset}
            aria-label={t.ask.newChat}
            title={t.ask.newChat}
            className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-paper"
          >
            <RotateCcw size={18} aria-hidden />
          </button>
        )}
      </div>

      {loaded && msgs.length === 0 && !busy && (
        <ul className="mt-5 grid gap-2">
          {t.ask.suggestions.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => send(q)}
                className="w-full rounded-xl border border-line bg-paper px-3.5 py-3 text-start text-[15px]"
                dir="auto"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ol className="mt-5 grid gap-3" aria-live="polite">
        {msgs.map((m) => {
          const mine = m.role === "user";
          return (
            <li key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${
                  mine ? "rounded-ee-md bg-ink text-paper" : "rounded-es-md bg-paper ring-1 ring-line"
                }`}
              >
                <p dir="auto" className="whitespace-pre-wrap">
                  {m.content}
                </p>
                {!mine && <Speak text={speakable(m.content)} lang={detectSpeechLang(m.content, lang)} className="mt-2 h-10 px-3 text-[14px]" />}
              </div>
            </li>
          );
        })}
        {busy && (
          <li className="flex justify-start" role="status">
            <div className="flex items-center gap-2 rounded-2xl rounded-es-md bg-paper px-3.5 py-3 text-[14px] text-ink-soft ring-1 ring-line">
              <span className="size-3 animate-spin rounded-full border-2 border-ink-soft border-t-transparent" aria-hidden />
              {t.ask.thinking}
            </div>
          </li>
        )}
      </ol>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-alarm/10 px-3 py-2 text-[15px] text-alarm">
          {error}
        </p>
      )}
      <div ref={bottom} />

      {/* the input bar sits just above the phone's tab bar; on desktop it sticks to the bottom of the panel */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="fixed inset-x-0 bottom-[calc(57px+max(12px,env(safe-area-inset-bottom)))] z-10 border-t border-line bg-paper px-4 py-2.5 lg:sticky lg:inset-x-auto lg:bottom-0"
      >
        {photo && (
          <div className="mb-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="size-12 rounded-lg object-cover" />
            <button type="button" onClick={() => setPhoto(null)} aria-label={t.ask.removePhoto} className="grid size-9 place-items-center rounded-full border border-line">
              <X size={16} aria-hidden />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => file.current?.click()}
            aria-label={t.ask.attach}
            className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-paper"
          >
            <Camera size={20} aria-hidden />
          </button>
          <input ref={file} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => attach(e.target.files?.[0])} />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // desktop: Enter sends, Shift+Enter adds a line. Phones keep Enter as a new line.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={800}
            placeholder={t.ask.placeholder}
            aria-label={t.ask.placeholder}
            dir="auto"
            className="field-sizing-content max-h-32 min-h-12 min-w-0 flex-1 resize-none rounded-2xl border border-line bg-white px-3.5 py-3 text-[16px] leading-snug"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label={t.ask.send}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-ink text-paper disabled:opacity-40"
          >
            <Send size={20} className="rtl:-scale-x-100" aria-hidden />
          </button>
        </div>
      </form>
    </section>
  );
}
