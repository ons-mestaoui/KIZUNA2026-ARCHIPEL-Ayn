"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { STATE_CACHE_KEY } from "@/lib/state-cache";
import type { FarmStateDTO } from "@/lib/state-types";
import { useApp } from "@/lib/store";

type Status = "loading" | "ready" | "offline" | "error";

/**
 * The farm's plan from /api/state. The last good answer is kept on the phone so a farmer in a
 * field with no signal still sees yesterday's plan (clearly marked), instead of a blank screen.
 */
export function useFarmState() {
  const router = useRouter();
  const [state, setState] = useState<FarmStateDTO | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const first = useRef(true);

  const start = (s: FarmStateDTO) => {
    if (first.current) {
      first.current = false;
      useApp.getState().setHour(s.localHour); // the twin opens at the farm's current time of day
    }
  };

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.status === 401) return void router.replace("/sign-in?next=/app");
      if (res.status === 404) return void router.replace("/onboarding");
      if (!res.ok) throw new Error(String(res.status));
      const s = (await res.json()) as FarmStateDTO;
      setState(s);
      setStatus("ready");
      setSavedAt(null);
      start(s);
      try {
        localStorage.setItem(STATE_CACHE_KEY, JSON.stringify({ at: Date.now(), state: s }));
      } catch {
        /* storage full or blocked: the live state still works */
      }
    } catch {
      try {
        const raw = localStorage.getItem(STATE_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as { at: number; state: FarmStateDTO };
          setState(cached.state);
          setSavedAt(cached.at);
          setStatus("offline");
          start(cached.state);
          return;
        }
      } catch {
        /* unreadable cache */
      }
      setStatus("error");
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    refresh();
  }, [refresh]);

  return { state, status, savedAt, refresh };
}
