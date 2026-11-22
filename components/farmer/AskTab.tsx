"use client";

import { Camera, Mic, Pause, Play, RotateCcw, Send, Square, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/useLang";
import { prepareImage } from "@/lib/image";
import { detectSpeechLang, speakable } from "@/lib/speech";
import { Speak } from "./Speak";
import { useVoiceRecorder } from "./useVoiceRecorder";

interface Msg {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  /** a canned answer from the presenter's offline mode, not a live one */
  saved?: boolean;
  /** local audio playback URL if recorded in this session */
  audioUrl?: string;
}

const PHOTO_TAG = "📷 "; // the server marks messages that came with a photo
const VOICE_TAG = "🎙️ "; // marks a message that came with a voice recording

function formatSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function AskTab() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | number | null>(null);
  const [audioMap, setAudioMap] = useState<Record<string | number, string>>({});

  const bottom = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const sent = useRef(0);
  const audioPlayer = useRef<HTMLAudioElement | null>(null);

  const handleTranscript = useCallback((speechText: string) => {
    setText((curr) => (curr.trim() ? curr : speechText));
  }, []);

  const recorder = useVoiceRecorder({
    lang,
    onTranscript: handleTranscript,
  });

  useEffect(() => {
    fetch("/api/ask")
      .then((r) => (r.ok ? (r.json() as Promise<{ items: Msg[] }>) : { items: [] }))
      .then((j) => setMsgs(j.items))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy, recorder.state]);

  // Clean up audio player on unmount
  useEffect(() => {
    return () => {
      audioPlayer.current?.pause();
    };
  }, []);

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

  function playAudio(id: string | number, url: string) {
    if (playingId === id) {
      audioPlayer.current?.pause();
      setPlayingId(null);
      return;
    }
    const a = (audioPlayer.current ??= new Audio());
    a.src = url;
    a.onended = () => setPlayingId(null);
    a.onerror = () => setPlayingId(null);
    a.play().catch(() => setPlayingId(null));
    setPlayingId(id);
  }

  async function send(question?: string, audioDataUrl?: string, localAudioUrl?: string) {
    const defaultMsg =
      lang === "ar"
        ? "عاوني وشوفلي هذي الورقة المريضة"
        : lang === "ja"
        ? "この葉の状態を診断してください"
        : "Please diagnose this leaf and advise me";
    const attached = photo;
    const rawMessage = (question ?? text).trim();
    const hasAudio = !!audioDataUrl;
    const message = rawMessage || (attached ? defaultMsg : "");

    if (!message && !hasAudio && !attached) return;
    if (busy) return;

    const temp = `tmp${++sent.current}`; // temporary id until the server saves the message
    setError(null);
    setBusy(true);

    if (localAudioUrl) {
      setAudioMap((m) => ({ ...m, [temp]: localAudioUrl }));
    }

    const defaultVoiceLabel = lang === "ar" ? "رسالة صوتية" : lang === "ja" ? "ボイスメッセージ" : "Voice message";
    const userDisplayContent =
      (hasAudio ? VOICE_TAG : "") +
      (attached ? PHOTO_TAG : "") +
      (message || defaultVoiceLabel);

    setMsgs((m) => [
      ...m,
      {
        id: temp,
        role: "user",
        content: userDisplayContent,
        audioUrl: localAudioUrl,
      },
    ]);

    setText("");
    setPhoto(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message || undefined,
          image: attached ?? undefined,
          audio: audioDataUrl ?? undefined,
          lang,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // nothing was saved: restore so the farmer can retry
        setMsgs((m) => m.filter((x) => x.id !== temp));
        setText(rawMessage);
        setPhoto(attached);
        setError(res.status === 429 ? fmt(t.ask.errors.quota, { cap: j.cap ?? "" }) : res.status === 503 ? t.ask.errors.busy : t.ask.errors.generic);
      } else {
        if (localAudioUrl && j.id) {
          setAudioMap((m) => ({ ...m, [j.id]: localAudioUrl }));
        }
        setMsgs((m) => [
          ...m.map((msg) =>
            msg.id === temp ? { ...msg, id: j.id ?? temp, content: j.userContent ?? msg.content } : msg
          ),
          { id: j.id, role: "assistant", content: j.reply, saved: j.model === "saved" },
        ]);
      }
    } catch {
      setMsgs((m) => m.filter((x) => x.id !== temp));
      setText(rawMessage);
      setPhoto(attached);
      setError(t.ask.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (recorder.state === "recording") {
      const rec = await recorder.stop();
      if (rec) {
        recorder.clear();
        await send(undefined, rec.dataUrl, rec.url);
      }
      return;
    }
    if (recorder.state === "recorded" && recorder.recorded) {
      const rec = recorder.recorded;
      recorder.clear();
      await send(undefined, rec.dataUrl, rec.url);
      return;
    }
    await send();
  }

  async function reset() {
    await fetch("/api/ask", { method: "DELETE" }).catch(() => {});
    setMsgs([]);
    setError(null);
    recorder.clear();
  }

  const displayedError = error || (recorder.error === "mic_denied" ? t.ask.errors.mic : recorder.error);
  const hasVoicePending = recorder.state === "recorded" && !!recorder.recorded;
  const canSend = !busy && (text.trim().length > 0 || !!photo || hasVoicePending || recorder.state === "recording");

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
                onClick={() => {
                  recorder.clear();
                  void send(q);
                }}
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
          const isVoice = m.content.startsWith(VOICE_TAG) || !!m.audioUrl || !!audioMap[m.id];
          const audioSrc = m.audioUrl || audioMap[m.id];
          const displayContent = m.content.replace(/^🎙️\s*/, "");

          return (
            <li key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${
                  mine ? "rounded-ee-md bg-ink text-paper" : "rounded-es-md bg-paper ring-1 ring-line"
                }`}
              >
                {mine && isVoice && (
                  <div className="mb-2 flex items-center gap-2 border-b border-paper/20 pb-2 text-[13px] font-medium text-paper/90">
                    <Mic size={15} className="text-sun" aria-hidden />
                    <span>{t.ask.voiceMessage}</span>
                    {audioSrc && (
                      <button
                        type="button"
                        onClick={() => playAudio(m.id, audioSrc)}
                        aria-label={playingId === m.id ? t.ask.pauseVoice : t.ask.playVoice}
                        className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-paper/20 px-2.5 py-1 text-[12px] font-semibold text-paper transition hover:bg-paper/30"
                      >
                        {playingId === m.id ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
                        <span>{playingId === m.id ? t.ask.pauseVoice : t.ask.playVoice}</span>
                      </button>
                    )}
                  </div>
                )}
                <p dir="auto" className="whitespace-pre-wrap">
                  {displayContent}
                </p>
                {!mine && m.saved && <p className="mt-1.5 text-[12px] font-medium text-sun-deep">{t.demo.saved}</p>}
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

      {displayedError && (
        <p role="alert" className="mt-4 rounded-lg bg-alarm/10 px-3 py-2 text-[15px] text-alarm">
          {displayedError}
        </p>
      )}
      <div ref={bottom} />

      {/* the input bar sits just above the phone's tab bar; on desktop it sticks to the bottom of the panel */}
      <form
        onSubmit={handleFormSubmit}
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

        {hasVoicePending && recorder.recorded && (
          <div className="mb-2 flex items-center justify-between rounded-xl border border-line bg-limewash px-3 py-2 text-[14px]">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => playAudio("preview", recorder.recorded!.url)}
                aria-label={playingId === "preview" ? t.ask.pauseVoice : t.ask.playVoice}
                className="grid size-8 place-items-center rounded-full bg-ink text-paper"
              >
                {playingId === "preview" ? <Pause size={14} aria-hidden /> : <Play size={14} className="ms-0.5" aria-hidden />}
              </button>
              <div className="flex items-center gap-1.5 font-medium">
                <Mic size={15} className="text-soil-wet" aria-hidden />
                <span>{t.ask.voiceMessage}</span>
                <span className="tabular text-ink-soft">({formatSec(recorder.recorded.durationSec)})</span>
              </div>
            </div>
            <button
              type="button"
              onClick={recorder.clear}
              aria-label={t.ask.cancelRecording}
              title={t.ask.cancelRecording}
              className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-black/5 hover:text-alarm"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {recorder.state === "recording" ? (
            /* Recording active bar */
            <div className="flex min-h-12 flex-1 items-center justify-between gap-2 rounded-2xl border border-alarm/30 bg-alarm/5 px-3 py-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex size-3 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-alarm opacity-75" />
                  <span className="relative inline-flex size-3 rounded-full bg-alarm" />
                </span>
                <span className="tabular font-semibold text-[15px] text-alarm" dir="ltr">
                  {formatSec(recorder.duration)}
                </span>
                <span className="truncate text-[13px] text-ink-soft">
                  {recorder.transcript || t.ask.recording}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={recorder.cancel}
                  aria-label={t.ask.cancelRecording}
                  title={t.ask.cancelRecording}
                  className="grid size-10 place-items-center rounded-full text-ink-soft hover:text-alarm"
                >
                  <Trash2 size={18} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void recorder.stop()}
                  aria-label={t.ask.stopRecording}
                  title={t.ask.stopRecording}
                  className="grid size-10 place-items-center rounded-full bg-paper ring-1 ring-line text-ink"
                >
                  <Square size={16} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            /* Normal input controls */
            <>
              <button
                type="button"
                onClick={() => file.current?.click()}
                aria-label={t.ask.attach}
                className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-paper"
              >
                <Camera size={20} aria-hidden />
              </button>
              <input ref={file} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => attach(e.target.files?.[0])} />

              <button
                type="button"
                onClick={() => void recorder.start()}
                aria-label={t.ask.recordVoice}
                title={t.ask.recordVoice}
                className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-paper hover:bg-black/5"
              >
                <Mic size={20} aria-hidden />
              </button>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  // desktop: Enter sends, Shift+Enter adds a line. Phones keep Enter as a new line.
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                    e.preventDefault();
                    if (canSend) void handleFormSubmit(e);
                  }
                }}
                rows={1}
                maxLength={800}
                placeholder={t.ask.placeholder}
                aria-label={t.ask.placeholder}
                dir="auto"
                className="field-sizing-content max-h-32 min-h-12 min-w-0 flex-1 resize-none rounded-2xl border border-line bg-white px-3.5 py-3 text-[16px] leading-snug"
              />
            </>
          )}

          <button
            type="submit"
            disabled={!canSend}
            aria-label={recorder.state === "recording" || hasVoicePending ? t.ask.sendVoice : t.ask.send}
            title={recorder.state === "recording" || hasVoicePending ? t.ask.sendVoice : t.ask.send}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-ink text-paper disabled:opacity-40"
          >
            <Send size={20} className="rtl:-scale-x-100" aria-hidden />
          </button>
        </div>
      </form>
    </section>
  );
}
