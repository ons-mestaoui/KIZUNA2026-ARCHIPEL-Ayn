"use client";
/* eslint-disable react-hooks/immutability -- react-three-fiber is imperative by design: useFrame and effects mutate three.js objects (camera, textures, chip elements) */

import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FieldDTO, LonLat } from "@/lib/field/types";
import { COLORS } from "@/components/twin/layout";
import { fieldSpanM, sceneProjector } from "./derive";
import { type HeightAt, buildSkirt, buildTerrain, buildWall, heightSampler, relief } from "./geometry";

export interface HeightGrid {
  w: number;
  h: number;
  /** metres above sea level, row-major, row 0 = north */
  data: ArrayLike<number>;
}

export interface FieldSceneProps {
  field: FieldDTO;
  /** the ground texture, painted by the parent (see ground.ts) */
  texture: THREE.CanvasTexture;
  heights: HeightGrid | null;
  /** one slot per zone, then one per pin: the DOM element that follows that spot around the screen */
  chips: MutableRefObject<(HTMLElement | null)[]>;
  /** extra places to mark (the demo's soil sensor), after the zones */
  pins?: LonLat[];
  /** play the fly-in */
  intro: boolean;
  label: string;
  /** reports the relief exaggeration in use (1 = true height) */
  onRelief?: (exaggeration: number) => void;
}

const FOV = 32;
const POLAR = 0.88; // radians from straight down: a bit steeper than 3/4 so the zones read
const AZIMUTH = 0.3; // from the south, turned a little toward the east (north stays roughly up)
const INTRO_S = 2.4;
const CHIP_R = 21; // px: half of a zone chip
const GOLD = new THREE.Color("#e3a21a");
const STRATA = [
  { to: 0.28, color: COLORS.soilDry },
  { to: 0.7, color: COLORS.subsoil },
  { to: 1, color: COLORS.aquifer },
];

const NO_PINS: LonLat[] = [];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function useDisposable<T extends { dispose(): void }>(value: T) {
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

/** The slab of ground, the field's wall and the zone anchors, built once per payload. */
function World({ field, texture, heights, chips, pins = NO_PINS, intro, onRelief }: Omit<FieldSceneProps, "label">) {
  const { gl, camera, size } = useThree();
  const sideM = field.sideM;
  const rel = useMemo(() => (heights ? relief(heights.data, sideM) : null), [heights, sideM]);
  const heightAt: HeightAt = useMemo(() => (heights && rel ? heightSampler(heights, sideM, rel.exaggeration, rel.floorM) : () => 0), [heights, rel, sideM]);
  const toXZ = useMemo(() => sceneProjector(field), [field]);
  const ring = useMemo(() => field.polygon.map(toXZ), [field, toXZ]);
  const span = useMemo(() => fieldSpanM(field), [field]);
  const wallH = clamp(span * 0.12, 8, 40);
  const depth = sideM * 0.1;

  useEffect(() => onRelief?.(rel?.exaggeration ?? 1), [rel, onRelief]);

  const terrain = useDisposable(useMemo(() => buildTerrain(sideM, 128, heightAt), [sideM, heightAt]));
  const wall = useDisposable(useMemo(() => buildWall(ring, heightAt, wallH, [GOLD.r, GOLD.g, GOLD.b]), [ring, heightAt, wallH]));
  const skirt = useDisposable(useMemo(() => buildSkirt(sideM, 64, heightAt, depth, STRATA), [sideM, heightAt, depth]));

  // a soft contact shadow under the slab so it sits on the page instead of floating
  const shadow = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 18, 64, 64, 64);
    grad.addColorStop(0, "rgba(23,38,74,0.34)");
    grad.addColorStop(1, "rgba(23,38,74,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  useDisposable(shadow);

  useEffect(() => {
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
  }, [texture, gl]);

  // where the camera looks: the middle of the field, on the ground
  const target = useMemo(() => {
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return new THREE.Vector3(cx, heightAt(cx, cz), cz);
  }, [ring, heightAt]);

  // how far back to stand so the field and a good slice of its surroundings fill the screen, on any shape of screen
  const fit = useMemo(() => {
    const visible = Math.max(span * 1.6, clamp(span * 2.5, 200, sideM * 0.92)); // metres across the view at the target: the field fills about 40 % of it
    const vHalf = THREE.MathUtils.degToRad(FOV / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * (size.width / Math.max(1, size.height)));
    return visible / 2 / Math.tan(Math.min(vHalf, hHalf));
  }, [sideM, span, size.width, size.height]);

  // anchors for the chips: the zones, then any pins
  const anchors = useMemo(
    () =>
      [...(field.zones?.list ?? []).map((z) => z.centroid), ...pins].map((p) => {
        const [x, zz] = toXZ(p);
        return new THREE.Vector3(x, heightAt(x, zz) + 2, zz);
      }),
    [field, pins, toXZ, heightAt],
  );

  const controls = useRef<OrbitControlsImpl>(null);
  const [ready, setReady] = useState(!intro);
  const started = useRef<number | null>(null);
  const place = (r: number, polar: number, az: number) => {
    camera.position.set(target.x + r * Math.sin(polar) * Math.sin(az), target.y + r * Math.cos(polar), target.z + r * Math.sin(polar) * Math.cos(az));
    camera.lookAt(target);
  };

  // the one orchestrated moment: arrive from high above, then hand the camera to the farmer
  useEffect(() => {
    if (!intro) place(fit, POLAR, AZIMUTH);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the first placement / a change of fit
  }, [fit, intro, target]);

  const v = useMemo(() => new THREE.Vector3(), []);
  const zoneCount = field.zones?.list.length ?? 0;
  const spots = useMemo(() => anchors.map((_, i) => ({ x: 0, y: 0, on: true, r: CHIP_R, pin: i >= zoneCount })), [anchors, zoneCount]);
  useFrame((state) => {
    if (!ready) {
      started.current ??= state.clock.elapsedTime;
      const k = Math.min(1, (state.clock.elapsedTime - started.current) / INTRO_S);
      const e = 1 - (1 - k) ** 3;
      place(THREE.MathUtils.lerp(fit * 1.9, fit, e), THREE.MathUtils.lerp(0.18, POLAR, e), THREE.MathUtils.lerp(AZIMUTH - 0.9, AZIMUTH, e));
      if (k >= 1) {
        setReady(true);
        controls.current?.update();
      }
    }
    // project every anchor to the screen, then nudge them apart so nothing hides a zone letter: zone chips stay put and
    // pins (which are wider) move out of their way
    anchors.forEach((a, i) => {
      v.copy(a).project(camera);
      spots[i].x = ((v.x + 1) / 2) * state.size.width;
      spots[i].y = ((1 - v.y) / 2) * state.size.height;
      spots[i].on = v.z < 1;
      spots[i].r = spots[i].pin ? Math.max(CHIP_R, (chips.current[i]?.offsetWidth ?? 0) / 2) : CHIP_R;
    });
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          const a = spots[i];
          const b = spots[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const need = a.r + b.r + 4;
          if (d >= need) continue;
          const push = need - d;
          const ux = d > 0.01 ? dx / d : 0;
          const uy = d > 0.01 ? dy / d : -1;
          if (a.pin !== b.pin) {
            const pin = a.pin ? a : b;
            const sign = a.pin ? -1 : 1; // away from the chip
            pin.x += sign * ux * push;
            pin.y += sign * uy * push;
          } else {
            a.x -= (ux * push) / 2;
            a.y -= (uy * push) / 2;
            b.x += (ux * push) / 2;
            b.y += (uy * push) / 2;
          }
        }
      }
    }
    spots.forEach((p, i) => {
      const el = chips.current[i];
      if (!el) return;
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      el.style.opacity = p.on ? "1" : "0";
    });
  });

  return (
    <>
      <mesh geometry={terrain}>
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh geometry={skirt}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh geometry={wall} renderOrder={2}>
        <meshBasicMaterial vertexColors transparent side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -depth - 0.4, 0]}>
        <circleGeometry args={[sideM * 0.8, 64]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <OrbitControls
        ref={controls}
        enabled={ready}
        target={target}
        enablePan={false}
        enableDamping
        dampingFactor={0.09}
        rotateSpeed={0.7}
        minPolarAngle={0.2}
        maxPolarAngle={1.25}
        minDistance={fit * 0.35}
        maxDistance={fit * 2.2}
      />
    </>
  );
}

export default function FieldScene(props: FieldSceneProps) {
  const [dpr, setDpr] = useState(1.75);
  return (
    <Canvas
      flat
      dpr={[1, dpr]}
      camera={{ fov: FOV, near: 1, far: 12000, position: [0, 400, 600] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      style={{ touchAction: "none" }}
      aria-label={props.label}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.75)} />
      <World {...props} />
    </Canvas>
  );
}
