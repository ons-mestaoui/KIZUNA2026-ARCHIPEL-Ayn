"use client";
/* eslint-disable react-hooks/immutability -- react-three-fiber is imperative by design: useFrame and effects mutate three.js objects (camera, textures, chip elements) */

import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FieldDTO, LonLat } from "@/lib/field/types";
import { fieldSpanM, sceneProjector } from "./derive";
import { Clouds, FloatingRocks } from "./Clouds";
import { IslandLife } from "./IslandLife";
import { FieldEquipment, type EquipmentInfo } from "./FieldEquipment";
import { type IslandShape, buildIslandBody, buildIslandTop } from "./island";
import { PAD_M, placeYard } from "./yard";
import { type HeightAt, buildWall, heightSampler, relief } from "./geometry";

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
  /** the farm's solar panels, pump, well and basin, drawn on a pad beside the field and driven by the day clock */
  equipment?: EquipmentInfo;
  /** the DOM lines that float above the pad: index 0 is the box, 1–3 the sun, pump and basin lines */
  yardChips?: MutableRefObject<(HTMLElement | null)[]>;
  /** play the fly-in */
  intro: boolean;
  label: string;
  /** reports the relief exaggeration in use (1 = true height) */
  onRelief?: (exaggeration: number) => void;
}

const FOV = 32;
const POLAR = 1.1; // radians from straight down: low enough to see the rock under the island, high enough for the zones to read
const AZIMUTH = 0.3; // from the south, turned a little toward the east (north stays roughly up)
const INTRO_S = 2.4;
const CHIP_R = 21; // px: half of a zone chip
const GOLD = new THREE.Color("#e3a21a");

const NO_PINS: LonLat[] = [];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function useDisposable<T extends { dispose(): void }>(value: T) {
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

/** The floating island (ground on top, rock below), the field's wall and the zone anchors, built once per payload. */
function World({ field, texture, heights, chips, pins = NO_PINS, equipment, yardChips, intro, onRelief }: Omit<FieldSceneProps, "label">) {
  const { gl, camera, size } = useThree();
  const sideM = field.sideM;
  const rel = useMemo(() => (heights ? relief(heights.data, sideM) : null), [heights, sideM]);
  const heightAt: HeightAt = useMemo(() => (heights && rel ? heightSampler(heights, sideM, rel.exaggeration, rel.floorM) : () => 0), [heights, rel, sideM]);
  const toXZ = useMemo(() => sceneProjector(field), [field]);
  const ring = useMemo(() => field.polygon.map(toXZ), [field, toXZ]);
  const span = useMemo(() => fieldSpanM(field), [field]);
  const wallH = clamp(span * 0.12, 8, 40);

  useEffect(() => onRelief?.(rel?.exaggeration ?? 1), [rel, onRelief]);

  const wall = useDisposable(useMemo(() => buildWall(ring, heightAt, wallH, [GOLD.r, GOLD.g, GOLD.b]), [ring, heightAt, wallH]));
  // soft shadows from the panels onto the pad, on desktops (a phone's GPU has better things to do)
  const [shadows] = useState(() => window.matchMedia("(pointer: fine)").matches);

  useEffect(() => {
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
  }, [texture, gl]);

  // the pad for the kit, beside the field (none when the field is too big for it to mean anything)
  const spot = useMemo(() => (equipment ? placeYard(ring, sideM) : null), [equipment, ring, sideM]);
  const emptyChips = useRef<(HTMLElement | null)[]>([]);

  // everything the first view has to show: the field, and the pad when there is one
  const bounds = useMemo(() => {
    const xs = ring.map((p) => p[0]);
    const zs = ring.map((p) => p[1]);
    if (spot) {
      xs.push(spot.at[0] - PAD_M.w / 2, spot.at[0] + PAD_M.w / 2);
      zs.push(spot.at[1] - PAD_M.d / 2, spot.at[1] + PAD_M.d / 2);
    }
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, span: Math.max(x1 - x0, z1 - z0) };
  }, [ring, spot]);

  // the island wraps everything the first view has to show, with a margin, and never runs off the ground texture
  const shape: IslandShape = useMemo(() => {
    const reach = Math.hypot(Math.max(Math.abs(bounds.x0 - bounds.cx), Math.abs(bounds.x1 - bounds.cx)), Math.max(Math.abs(bounds.z0 - bounds.cz), Math.abs(bounds.z1 - bounds.cz)));
    const room = sideM / 2 - Math.max(Math.abs(bounds.cx), Math.abs(bounds.cz)) - 4;
    const R = clamp(reach * 1.14 + 14, 60, Math.max(60, room));
    return { cx: bounds.cx, cz: bounds.cz, R, depth: R * 1.3 };
  }, [bounds, sideM]);
  const top = useDisposable(useMemo(() => buildIslandTop(shape, sideM, heightAt), [shape, sideM, heightAt]));
  const body = useDisposable(useMemo(() => buildIslandBody(shape, heightAt), [shape, heightAt]));

  // where the camera looks: the middle of what there is to see, on the ground
  const target = useMemo(() => new THREE.Vector3(bounds.cx, heightAt(bounds.cx, bounds.cz), bounds.cz), [bounds, heightAt]);

  // how far back to stand so the whole island, with a little sky around it, fits the narrower side of the screen
  const fit = useMemo(() => {
    const visible = Math.max(190, shape.R * 2.16); // metres across the view at the target
    const vHalf = THREE.MathUtils.degToRad(FOV / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * (size.width / Math.max(1, size.height)));
    return visible / 2 / Math.tan(Math.min(vHalf, hHalf));
  }, [shape, size.width, size.height]);

  // anchors for the chips: the zones, then any pins
  const anchors = useMemo(
    () =>
      [...(field.zones?.list ?? []).map((z) => z.centroid), ...pins].map((p) => {
        const [x, zz] = toXZ(p);
        return new THREE.Vector3(x, heightAt(x, zz) + 2, zz);
      }),
    [field, pins, toXZ, heightAt],
  );

  const sun = useMemo(() => ({ target: new THREE.Object3D() }), []);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const pad = useMemo(() => ({ x: spot ? spot.at[0] : bounds.cx, y: heightAt(spot ? spot.at[0] : bounds.cx, spot ? spot.at[1] : bounds.cz), z: spot ? spot.at[1] : bounds.cz }), [spot, bounds, heightAt]);
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
  // pins are wider than a zone chip: measure them when they change, not every frame (no layout reads while animating)
  useEffect(() => {
    spots.forEach((p, i) => {
      if (p.pin) p.r = Math.max(CHIP_R, (chips.current[i]?.offsetWidth ?? 0) / 2);
    });
  }, [spots, chips]);
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
    // looking from the side the chips would float in the air, so they fade as the camera comes down toward the horizon
    const polar = controls.current?.getPolarAngle() ?? POLAR;
    const side = clamp((1.38 - polar) / 0.22, 0, 1);
    spots.forEach((p, i) => {
      const el = chips.current[i];
      if (!el) return;
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      el.style.opacity = p.on ? String(side) : "0";
    });
  });

  return (
    <>
      {/* light with no network: a few soft panels that the glossy parts (panels, water, pipes) reflect */}
      <Environment resolution={64} frames={1} environmentIntensity={0.75}>
        <Lightformer form="rect" intensity={2.4} position={[0, 40, 0]} rotation-x={Math.PI / 2} scale={[70, 70, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={2.8} position={[-34, 12, 34]} scale={[34, 16, 1]} color="#ffe2b0" />
        <Lightformer form="rect" intensity={1.3} position={[34, 8, -24]} rotation-y={Math.PI} scale={[34, 16, 1]} color="#a8c4ff" />
      </Environment>
      <hemisphereLight args={["#e8f1ff", "#b3a283", 1.1]} />
      <primitive object={sun.target} position={[pad.x, pad.y, pad.z]} />
      <directionalLight
        ref={sunRef}
        target={sun.target}
        position={[pad.x - 120, pad.y + 220, pad.z + 160]}
        intensity={2.2}
        color="#fff1d6"
        castShadow={shadows && !!spot}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-PAD_M.w * 0.62}
        shadow-camera-right={PAD_M.w * 0.62}
        shadow-camera-top={PAD_M.w * 0.62}
        shadow-camera-bottom={-PAD_M.w * 0.62}
        shadow-camera-near={20}
        shadow-camera-far={600}
        shadow-bias={-0.0005}
        shadow-normalBias={0.4}
      />
      <directionalLight position={[160, 90, -200]} intensity={0.8} color="#9db8ff" />
      {/* a warm fill from the front and below, so the rock face and the underside are lit, not black */}
      <directionalLight position={[-60, -90, 260]} intensity={1.15} color="#ffd9b0" />
      {spot && equipment && <FieldEquipment equipment={equipment} spot={spot} ring={ring} heightAt={heightAt} chips={yardChips ?? emptyChips} shadows={shadows} />}
      <mesh geometry={top}>
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh geometry={body}>
        <meshStandardMaterial vertexColors flatShading roughness={0.96} metalness={0} />
      </mesh>
      <mesh geometry={wall} renderOrder={2}>
        <meshBasicMaterial vertexColors transparent side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <IslandLife shape={shape} heightAt={heightAt} vines={shadows ? 34 : 22} trees={shadows ? 18 : 12} />
      <FloatingRocks shape={shape} count={shadows ? 7 : 5} />
      <Clouds shape={shape} count={shadows ? 34 : 22} />
      <OrbitControls
        ref={controls}
        enabled={ready}
        target={target}
        enablePan={false}
        enableDamping
        dampingFactor={0.09}
        rotateSpeed={0.7}
        minPolarAngle={0.2}
        maxPolarAngle={1.52}
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
      shadows
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
