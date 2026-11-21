"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BLOCK, COLORS, EQUIP_X, LAYERS, PARCEL } from "./layout";

const dryColor = new THREE.Color(COLORS.soilDry);
const wetColor = new THREE.Color(COLORS.soilWet);
const target = new THREE.Color();

/** A tiny seeded random generator, so the crack pattern is identical on every load. */
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Procedural dried-mud crack pattern. */
function useCrackTexture() {
  return useMemo(() => {
    const size = 512;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    const rnd = seeded(7);
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

/** `wet` 0 (cracked, pale) … 1 (dark, moist). Changes ease in over ~1 s, so pouring water is visible. */
export function Diorama({ wet }: { wet: number }) {
  const topsoil = useRef<THREE.MeshStandardMaterial>(null!);
  const cracks = useRef<THREE.MeshBasicMaterial>(null!);
  const crackTex = useCrackTexture();
  const wetRef = useRef(wet);
  useEffect(() => {
    wetRef.current = wet; // read by useFrame, so no re-render per animation frame
  }, [wet]);

  useFrame((_, delta) => {
    const w = wetRef.current;
    target.copy(dryColor).lerp(wetColor, w);
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
