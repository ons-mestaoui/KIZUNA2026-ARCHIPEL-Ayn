"use client";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ARRAY, BASIN, PUMP_HOUSE } from "./layout";

// Lightweight 3D→screen labels: plain DOM spans positioned every frame.
// (Replaces drei <Html>, which mounts one React root per label.)
export type LabelId = "pv" | "pump" | "basin";

export const labelEls: Record<LabelId, HTMLSpanElement | null> = { pv: null, pump: null, basin: null };

const anchors: Record<LabelId, THREE.Vector3> = {
  pv: new THREE.Vector3(ARRAY.x, 1.5, ARRAY.rowsZ[0]),
  pump: new THREE.Vector3(PUMP_HOUSE.x, 1.2, PUMP_HOUSE.z),
  basin: new THREE.Vector3(BASIN.x, BASIN.h + 0.6, BASIN.z),
};
const v = new THREE.Vector3();

export function setLabel(id: LabelId, text: string) {
  const el = labelEls[id];
  if (el && el.textContent !== text) el.textContent = text;
}

/** Inside <Canvas>: project anchors to screen space each frame. */
export function LabelProjector() {
  useFrame(({ camera, size }) => {
    (Object.keys(anchors) as LabelId[]).forEach((id) => {
      const el = labelEls[id];
      if (!el) return;
      v.copy(anchors[id]).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      el.style.opacity = v.z < 1 ? "1" : "0";
    });
  });
  return null;
}

/** Outside <Canvas>: the label elements themselves. */
export function LabelOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <span ref={(el) => void (labelEls.pv = el)} className="twin-chip twin-chip-sun absolute top-0 left-0" />
      <span ref={(el) => void (labelEls.pump = el)} className="twin-chip absolute top-0 left-0" />
      <span ref={(el) => void (labelEls.basin = el)} className="twin-chip twin-chip-water absolute top-0 left-0" />
    </div>
  );
}
