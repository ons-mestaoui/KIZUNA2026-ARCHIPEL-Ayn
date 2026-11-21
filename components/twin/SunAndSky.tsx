"use client";

import { Sky, Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { getPosition } from "suncalc"; // v2: degrees, azimuth clockwise from north
import * as THREE from "three";
import type { Sky as SkyImpl } from "three-stdlib";
import { useApp } from "@/lib/store";

const SUN_DIST = 40;
const tmpDir = new THREE.Vector3();
const tmpSel = new THREE.Vector3();
const tmpColor = new THREE.Color();
const dayAmbient = new THREE.Color("#f4efe2");
const nightAmbient = new THREE.Color("#7f93c9"); // moonlit blue: night must stay readable, not black
const nightSky = new THREE.Color("#162340");

/**
 * Sun direction for a farm-local hour. `utcOffsetH` is the farm's offset from UTC on that date
 * (so Tunis, Tokyo and everywhere else get their own sun). +x east, −z north.
 */
export function sunDirection(dateISO: string, hour: number, lat: number, lon: number, utcOffsetH: number, out: THREE.Vector3) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d, 0, 0, 0) + (hour - utcOffsetH) * 3600_000;
  const p = getPosition(new Date(t), lat, lon);
  const alt = THREE.MathUtils.degToRad(p.altitude);
  const az = THREE.MathUtils.degToRad(p.azimuth); // 0 = N (−z), 90 = E (+x)
  return out.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
}

export function SunAndSky({
  date,
  lat,
  lon,
  utcOffsetH,
  shadows,
}: {
  date: string;
  lat: number;
  lon: number;
  utcOffsetH: number;
  shadows: boolean;
}) {
  const light = useRef<THREE.DirectionalLight>(null!);
  const moon = useRef<THREE.DirectionalLight>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const sky = useRef<SkyImpl>(null!);
  const scene = useThree((s) => s.scene);
  const isNight = useApp((s) => sunDirection(date, s.hour, lat, lon, utcOffsetH, tmpSel).y < 0.02);

  useFrame(() => {
    const { hour } = useApp.getState();
    sunDirection(date, hour, lat, lon, utcOffsetH, tmpDir);
    const day = THREE.MathUtils.clamp(tmpDir.y * 3, 0, 1);
    light.current.position.copy(tmpDir).multiplyScalar(SUN_DIST);
    light.current.intensity = 2.6 * day;
    moon.current.intensity = 0.9 * (1 - day);
    hemi.current.intensity = 1.05 + 0.2 * day;
    hemi.current.color.copy(tmpColor.copy(nightAmbient).lerp(dayAmbient, day));
    // the daytime sky shader goes black once the sun is down: swap in a navy night sky
    const skyOn = tmpDir.y > 0.05;
    if (sky.current) {
      sky.current.visible = skyOn;
      sky.current.material.uniforms.sunPosition?.value.copy(tmpDir);
    }
    scene.background = skyOn ? null : nightSky;
  });

  return (
    <>
      <Sky ref={sky} distance={4000} turbidity={6} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.85} />
      {isNight && <Stars radius={120} depth={30} count={1500} factor={3} fade speed={0.5} />}
      <hemisphereLight ref={hemi} args={["#f4efe2", "#6b5a44", 1]} />
      <directionalLight ref={moon} position={[-18, 30, 22]} color="#a9bdf0" />
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
