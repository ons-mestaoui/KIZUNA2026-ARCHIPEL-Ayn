"use client";

import { useApp } from "@/lib/store";

let raf = 0;

/**
 * Animate the simulated soil reading toward `target` over `ms`
 * (looks like water infiltrating / soil drying out — same visual path as a real sensor).
 */
export function animateSoilTo(target: number, ms = 1600) {
  cancelAnimationFrame(raf);
  const start = useApp.getState().soilPct;
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    useApp.getState().setSoilPct(start + (target - start) * eased, "simulated");
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

export const pourWater = () => animateSoilTo(Math.min(100, useApp.getState().soilPct + 30));
export const letItDry = () => animateSoilTo(18, 2400);
