"use client";

import { MotionConfig, motion } from "motion/react";
import type { ReactNode } from "react";

// Shared motion for the whole app. The rules (design-motion-principles): only transform and opacity move; entrances
// ease out and are short (under 300 ms), so the screen answers a tap at once; nothing loops; and "reduce motion" turns
// every movement into a plain fade (MotionConfig below).

const EASE = [0.16, 1, 0.3, 1] as const;

/** Wrap the app once: every motion component inside respects the reader's "reduce motion" setting. */
export function AppMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** A tab's content: it eases in (a short fade and rise) whenever the tab changes. */
export function TabSwap({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  return (
    <motion.div key={id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE }} className={className}>
      {children}
    </motion.div>
  );
}

/** A step of the sign-up flow: the same, a little slower, since the content is bigger. */
export function StepSwap({ id, children }: { id: string | number; children: ReactNode }) {
  return (
    <motion.div key={id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.34, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** The bar under (or over) the current tab: one shared element that slides from tab to tab. The tab button must be `relative`. */
export function TabMark({ layoutId, edge }: { layoutId: string; edge: "top" | "bottom" }) {
  return (
    <motion.span
      layoutId={layoutId}
      transition={{ type: "spring", stiffness: 520, damping: 42 }}
      aria-hidden
      className={`absolute inset-x-3 h-[3px] rounded-full bg-ink ${edge === "top" ? "top-0" : "bottom-0"}`}
    />
  );
}
