"use client";

import { useCallback, useEffect, useState } from "react";
import type { FieldDTO } from "@/lib/field/types";
import { FIELD_CACHE_KEY } from "@/lib/state-cache";

export type FieldStatus = "loading" | "ready" | "empty" | "unavailable";

export interface FieldData {
  status: FieldStatus;
  field: FieldDTO | null;
  /** set when what is on screen is an older saved copy */
  savedAt: number | null;
  reload: () => void;
}

interface Cached {
  savedAt: number;
  farmId?: string;
  field: FieldDTO;
}

function readCache(farmId?: string): Cached | null {
  try {
    const raw = localStorage.getItem(FIELD_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (c?.field?.version === 1 && Array.isArray(c.field.polygon)) {
      if (farmId && c.farmId && c.farmId !== farmId) return null;
      return c;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(field: FieldDTO, farmId?: string) {
  try {
    localStorage.setItem(FIELD_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), farmId, field } satisfies Cached));
  } catch {
    /* storage full or blocked: the view just won't survive a signal loss */
  }
}

/**
 * The satellite view of the signed-in farmer's field from /api/field, kept on the device for when there is no signal.
 * `savedAt` is set when what is on screen is an older saved copy.
 */
export function useFieldData(enabled: boolean, farmId?: string): FieldData {
  const [state, setState] = useState<{ status: FieldStatus; field: FieldDTO | null; savedAt: number | null }>({ status: "loading", field: null, savedAt: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when disabled (e.g. no polygon)
      setState({ status: "empty", field: null, savedAt: null });
      return;
    }
    const ctl = new AbortController();
    const cached = readCache(farmId);
    const fallback = () =>
      cached ? setState({ status: "ready", field: cached.field, savedAt: cached.savedAt }) : setState({ status: "unavailable", field: null, savedAt: null });

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      fallback();
      return () => ctl.abort();
    }
    fetch("/api/field", { signal: ctl.signal })
      .then(async (res) => {
        if (res.status === 404) {
          setState({ status: "empty", field: null, savedAt: null });
          try {
            localStorage.removeItem(FIELD_CACHE_KEY);
          } catch {
            /* nothing to remove */
          }
          return;
        }
        if (!res.ok) return fallback();
        const field = (await res.json()) as FieldDTO;
        writeCache(field, farmId);
        setState({ status: "ready", field, savedAt: null });
      })
      .catch(() => {
        if (!ctl.signal.aborted) fallback();
      });
    return () => ctl.abort();
  }, [enabled, attempt, farmId]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: s.field ? s.status : "loading" }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}
