"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";

export type RecorderState = "idle" | "recording" | "recorded";

export interface RecordedAudio {
  blob: Blob;
  url: string;
  dataUrl: string;
  durationSec: number;
  transcript: string;
}

const SPEECH_LANG_MAP: Record<Lang, string> = {
  ar: "ar-TN",
  ja: "ja-JP",
  en: "en-US",
};

function getSupportedMimeType(): string {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/wav",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // ignore
    }
  }
  return "";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read blob"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useVoiceRecorder({
  lang,
  onTranscript,
}: {
  lang: Lang;
  onTranscript?: (t: string) => void;
}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [recorded, setRecorded] = useState<RecordedAudio | null>(null);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const durationRef = useRef(0);
  const recordedUrlRef = useRef<string | null>(null);
  const stopResolverRef = useRef<((rec: RecordedAudio | null) => void) | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    try {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    } catch {
      // ignore
    }
    if (recordedUrlRef.current) {
      try {
        URL.revokeObjectURL(recordedUrlRef.current);
      } catch {
        // ignore
      }
      recordedUrlRef.current = null;
    }
    setState("idle");
    setDuration(0);
    durationRef.current = 0;
    setRecorded(null);
    setTranscript("");
    setError(null);
    chunksRef.current = [];
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (recordedUrlRef.current) {
        try {
          URL.revokeObjectURL(recordedUrlRef.current);
        } catch {
          // ignore
        }
      }
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  const cancel = useCallback(() => {
    clear();
  }, [clear]);

  const stop = useCallback((): Promise<RecordedAudio | null> => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    if (
      !mediaRecorderRef.current ||
      mediaRecorderRef.current.state === "inactive"
    ) {
      return Promise.resolve(recorded);
    }

    return new Promise((resolve) => {
      stopResolverRef.current = resolve;
      mediaRecorderRef.current?.stop();
    });
  }, [recorded]);

  const start = useCallback(async () => {
    clear();
    setError(null);

    // 1. Browsers strictly require a Secure Context (HTTPS or localhost) for microphone access
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setError("mic_insecure");
      return;
    }

    // 2. Resolve getUserMedia across modern and legacy APIs
    const getStream = async (): Promise<MediaStream> => {
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        return navigator.mediaDevices.getUserMedia({ audio: true });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
      const legacy = nav?.getUserMedia || nav?.webkitGetUserMedia || nav?.mozGetUserMedia || nav?.msGetUserMedia;
      if (legacy) {
        return new Promise<MediaStream>((resolve, reject) => {
          legacy.call(navigator, { audio: true }, resolve, reject);
        });
      }
      throw new Error("NOT_SUPPORTED");
    };

    try {
      const stream = await getStream();
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        recordedUrlRef.current = url;
        try {
          const dataUrl = await blobToDataUrl(blob);
          const result: RecordedAudio = {
            blob,
            url,
            dataUrl,
            durationSec: durationRef.current,
            transcript: "",
          };
          setRecorded(result);
          setState("recorded");
          if (stopResolverRef.current) {
            stopResolverRef.current(result);
            stopResolverRef.current = null;
          }
        } catch {
          setError("Failed to process audio recording.");
          setState("idle");
          if (stopResolverRef.current) {
            stopResolverRef.current(null);
            stopResolverRef.current = null;
          }
        }
      };

      // Live Web Speech Recognition if available (best-effort)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Win = window as any;
        const SpeechRec = Win.SpeechRecognition || Win.webkitSpeechRecognition;
        if (SpeechRec) {
          const rec = new SpeechRec();
          recognitionRef.current = rec;
          rec.lang = SPEECH_LANG_MAP[lang] || "en-US";
          rec.continuous = true;
          rec.interimResults = true;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rec.onresult = (ev: any) => {
            let full = "";
            for (let i = 0; i < ev.results.length; i++) {
              full += ev.results[i][0].transcript + " ";
            }
            const clean = full.trim();
            if (clean) {
              setTranscript(clean);
              onTranscriptRef.current?.(clean);
            }
          };
          rec.start();
        }
      } catch {
        // Web Speech API unavailable or denied
      }

      recorder.start(250);
      setState("recording");
      durationRef.current = 0;
      setDuration(0);

      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
        if (durationRef.current >= 90) {
          void stop();
        }
      }, 1000);
    } catch (err: unknown) {
      console.warn("Microphone access error:", err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
        setError("mic_denied");
      } else if (e?.name === "NotFoundError" || e?.name === "DevicesNotFoundError") {
        setError("mic_not_found");
      } else if (e?.message === "NOT_SUPPORTED") {
        setError("mic_unsupported");
      } else {
        setError("mic_denied");
      }
      setState("idle");
    }
  }, [clear, lang, stop]);

  return {
    state,
    duration,
    recorded,
    transcript,
    error,
    start,
    stop,
    cancel,
    clear,
  };
}
