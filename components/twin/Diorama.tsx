"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { thetaFromPercent } from "@/lib/engine/waterBalance";
import { useApp } from "@/lib/store";
import { BLOCK, COLORS, EQUIP_X, LAYERS, PARCEL } from "./layout";

const dry = new THREE.Color(COLORS.soilDry);
const wet = new THREE.Color(COLORS.soilWet);
const target = new THREE.Color();

/** 0 = bone dry (≤ 0.6·θWP), 1 = field capacity or wetter. */
export function wetness(soilPct: number): number {
  const { soil } = useApp.getState().parcel;
  const theta = thetaFromPercent(soilPct, soil);
  const lo = soil.wiltingPoint * 0.6;
  return THREE.MathUtils.clamp((theta - lo) / (soil.fieldCapacity - lo), 0, 1);
}

/** Procedural dried-mud crack pattern (seeded so it's identical every load). */
function useCrackTexture() {
  return useMemo(() => {
    const size = 512;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.strokeStyle = "rgba(60,38,20,0.9)";
    g.lineCap = "round";
    for (let i = 0; i < 70; i++) {
      let x = rnd() * size;
      let y = rnd() * size;
      let a = rnd() * Math.PI * 2;
      g.lineWidth = 1 + rnd() * 2.2;
      g.beginPath();
      g.moveTo(x, y);
      const steps = 6 + Math.floor(rnd() * 10);
      for (let s = 0; s < steps; s++) {
        a += (rnd() - 0.5) * 1.1;
        x += Math.cos(a) * 14;
        y += Math.sin(a) * 14;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

export function Diorama() {
  const topsoil = useRef<THREE.MeshStandardMaterial>(null!);
  const cracks = useRef<THREE.MeshBasicMaterial>(null!);
  const crackTex = useCrackTexture();

  // Smoothly follow the sensor: pouring water visibly darkens the soil over ~1 s.
  useFrame((_, delta) => {
    const w = wetness(useApp.getState().soilPct);
    target.copy(dry).lerp(wet, w);
    topsoil.current.color.lerp(target, Math.min(1, delta * 3));
    const crackTarget = THREE.MathUtils.clamp(1 - w * 1.6, 0, 1) * 0.85;
    cracks.current.opacity += (crackTarget - cracks.current.opacity) * Math.min(1, delta * 3);
  });

  const parcelW = EQUIP_X - BLOCK.x0;
  const yardW = BLOCK.x1 - EQUIP_X;
  const depth = BLOCK.z1 - BLOCK.z0;
  const { topsoil: t, subsoil: s, aquifer: a } = LAYERS;

  return (
    <group>
      {/* topsoil under the orchard — colour = live root-zone moisture */}
      <mesh position={[BLOCK.x0 + parcelW / 2, -t / 2, 0]} receiveShadow>
        <boxGeometry args={[parcelW, t, depth]} />
        <meshStandardMaterial ref={topsoil} color={COLORS.soilDry} roughness={0.95} />
      </mesh>
      {/* equipment yard (packed earth) */}
      <mesh position={[EQUIP_X + yardW / 2, -t / 2, 0]} receiveShadow>
        <boxGeometry args={[yardW, t, depth]} />
        <meshStandardMaterial color={COLORS.yard} roughness={1} />
      </mesh>
      {/* subsoil */}
      <mesh position={[0, -t - s / 2, 0]}>
        <boxGeometry args={[BLOCK.x1 - BLOCK.x0, s, depth]} />
        <meshStandardMaterial color={COLORS.subsoil} roughness={1} />
      </mesh>
      {/* aquifer (nappe) — what the well draws from */}
      <mesh position={[0, -t - s - a / 2, 0]}>
        <boxGeometry args={[BLOCK.x1 - BLOCK.x0, a, depth]} />
        <meshStandardMaterial color={COLORS.aquifer} roughness={0.6} metalness={0.1} />
      </mesh>
      {/* dried-mud cracks fade out as the soil gets wet */}
      <mesh rotation-x={-Math.PI / 2} position={[(PARCEL.x0 + PARCEL.x1) / 2, 0.004, 0]}>
        <planeGeometry args={[PARCEL.x1 - PARCEL.x0, PARCEL.z1 - PARCEL.z0]} />
        <meshBasicMaterial ref={cracks} map={crackTex} transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  );
}
