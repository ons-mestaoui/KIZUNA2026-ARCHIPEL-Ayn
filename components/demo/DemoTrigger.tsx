"use client";

import { useEffect, useRef } from "react";
import { clearStateCache } from "@/lib/state-cache";

const HOLD_MS = 1500;

// A full page load (not a client-side route change): the entry sets the session cookie and redirects.
const enter = () => {
  clearStateCache(); // the demo replaces whoever was signed in; their saved plan must not stay behind
  window.location.assign(new URL("/api/demo/enter", window.location.origin).href);
};

/**
 * Hidden doors into the demo. The landing page never mentions it:
 *   • Shift + D                 (laptop)
 *   • press and hold the logo   (phone, 1.5 s)
 *   • /?demo=kizuna             (a link or a QR code you control)
 * Wraps the logo; everything else on the page is unaware of it.
 */
export function DemoTrigger({ children }: { children: React.ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") === "kizuna") enter();
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (e.shiftKey && e.key.toLowerCase() === "d" && !/INPUT|TEXTAREA|SELECT/.test(tag)) enter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <span
      onPointerDown={() => {
        fired.current = false;
        cancel();
        timer.current = setTimeout(() => {
          fired.current = true;
          enter();
        }, HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()} // a long press on a link opens the phone's link menu
      onClickCapture={(e) => {
        if (fired.current) e.preventDefault(); // the long press must not also follow the logo's link
      }}
      className="inline-flex touch-manipulation select-none [-webkit-touch-callout:none]"
    >
      {children}
    </span>
  );
}
