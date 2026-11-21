"use client";

import { Sky, Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { getPosition } from "suncalc"; // v2: degrees, azimuth clockwise from north
import * as THREE from "three";
import type { Sky as SkyImpl } from "three-stdlib";
import { useApp } from "@/lib/store";

const SUN_DIST = 40;
const tmpDir = new THREE.Vector3();
const dayAmbient = new THREE.Color("#f4efe2");
const nightAmbient = new THREE.Color("#4a5a86");
const tmpColor = new THREE.Color();

/** Sun direction for a local Tunis hour (UTC+1, no DST) on a given date. +x east, +z south. */
export function sunDirection(dateISO: string, hour: number, lat: number, lon: number, out: THREE.Vector3) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d, 0, 0, 0) + (hour - 1) * 3600_000;
  const p = getPosition(new Date(t), lat, lon);
  const alt = THREE.MathUtils.degToRad(p.altitude);
  const az = THREE.MathUtils.degToRad(p.azimuth); // 0 = N (−z), 90 = E (+x)
  return out.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
}

export function SunAndSky({ date, lat, lon, shadows }: { date: string; lat: number; lon: number; shadows: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const sky = useRef<SkyImpl>(null!);
  const isNight = useApp((s) => s.hour < 5.5 || s.hour > 20);

  useFrame(() => {
    const { hour } = useApp.getState();
    sunDirection(date, hour, lat, lon, tmpDir);
    const day = THREE.MathUtils.clamp(tmpDir.y * 3, 0, 1);
    light.current.position.copy(tmpDir).multiplyScalar(SUN_DIST);
    light.current.intensity = 2.6 * day;
    hemi.current.intensity = 0.35 + 0.9 * day;
    hemi.current.color.copy(tmpColor.copy(nightAmbient).lerp(dayAmbient, day));
    sky.current?.material.uniforms.sunPosition?.value.copy(tmpDir);
  });

  return (
    <>
      <Sky ref={sky} distance={4000} turbidity={6} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.85} />
      {isNight && <Stars radius={120} depth={30} count={1500} factor={3} fade speed={0.5} />}
      <hemisphereLight ref={hemi} args={["#f4efe2", "#6b5a44", 1]} />
      <directionalLight
        ref={light}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0005}
      />
    </>
  );
}
