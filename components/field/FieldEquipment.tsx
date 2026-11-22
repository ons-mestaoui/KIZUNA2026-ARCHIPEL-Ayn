"use client";

import { useFrame } from "@react-three/fiber";
import { type MutableRefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { COLORS } from "@/components/twin/layout";
import { frameAt } from "@/components/twin/useTwinFrame";
import type { DailyPlan } from "@/lib/engine/types";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useLang";
import type { HeightAt, XZ } from "./geometry";
import { PAD, YARD, YARD_SCALE as S, type YardSpot, lateralLines } from "./yard";

/** What the equipment needs to know about the farm: today's plan and the size of the kit. */
export interface EquipmentInfo {
  plan: DailyPlan;
  basinCapacityM3: number;
  kWp: number;
}

const PER_LINE = 5; // water drops per drip line
const MAIN_DROPS = 12;
const CABLE_SPARKS = 8;
const WATER = "#7fe3f0";
const tmp = new THREE.Vector3();
const dummy = new THREE.Object3D();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function useDisposable<T extends { dispose(): void }>(value: T) {
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

/** Points every `step` metres along a straight run, lifted above the ground. */
function groundPath(a: XZ, b: XZ, heightAt: HeightAt, lift: number, step = 5): THREE.Vector3[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = a[0] + ((b[0] - a[0]) * i) / n;
    const z = a[1] + ((b[1] - a[1]) * i) / n;
    return new THREE.Vector3(x, heightAt(x, z) + lift, z);
  });
}

/** Flat ribbons that follow the ground (drip lines, the wet strip around them, the header). */
function strips(paths: XZ[][], width: number, lift: number, heightAt: HeightAt, step = 6): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const path of paths) {
    const pts: XZ[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    pts.push(path[path.length - 1]);
    const base = pos.length / 3;
    pts.forEach((p, i) => {
      const q = pts[Math.min(pts.length - 1, i + 1)];
      const o = pts[Math.max(0, i - 1)];
      let dx = q[0] - o[0];
      let dz = q[1] - o[1];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const nx = (-dz * width) / 2;
      const nz = (dx * width) / 2;
      const y = heightAt(p[0], p[1]) + lift;
      pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Drops moving along a curve: `level` (0–1) is how strongly the flow is on, so it fades in and out instead of snapping. */
function drops(mesh: THREE.InstancedMesh, curve: THREE.Curve<THREE.Vector3>, level: number, phase: number, size: number) {
  for (let i = 0; i < mesh.count; i++) {
    curve.getPointAt((phase + i / mesh.count) % 1, tmp);
    dummy.position.copy(tmp);
    dummy.scale.setScalar(level * size);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export interface FieldEquipmentProps {
  equipment: EquipmentInfo;
  spot: YardSpot;
  ring: XZ[];
  heightAt: HeightAt;
  /** index 0: the box that follows the pad around the screen; 1–3: the sun, pump and basin lines inside it */
  chips: MutableRefObject<(HTMLElement | null)[]>;
}

/**
 * The farm's kit, drawn on a pad beside the field: solar panels, the pump house, the well, the storage basin (or a
 * diesel generator), and the pipes that carry water to drip lines across the field. It follows the same clock as the
 * day ribbon, so pressing Play shows the sun rise, the pump start, the basin fill and the water run out into the
 * field. Where the pad stands is illustrative; the farmer never told us.
 */
export function FieldEquipment({ equipment, spot, ring, heightAt, chips }: FieldEquipmentProps) {
  const t = useT();
  const { plan, basinCapacityM3, kWp } = equipment;
  const source = plan.source;
  const solar = source === "solar_basin" || source === "solar_direct";
  const diesel = source === "diesel";
  const hasBasin = source === "solar_basin";
  const hasWell = source !== "network";
  const hasCabinet = source !== "network";
  const [cx, cz] = spot.at;
  const side = spot.side;

  // the pad stands level, at the highest ground under it
  const padTop = useMemo(() => {
    let top = -Infinity;
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) top = Math.max(top, heightAt(cx + (dx * PAD.w * S) / 2, cz + (dz * PAD.d * S) / 2));
    return top + 0.25;
  }, [cx, cz, heightAt]);
  // a point on the pad in layout units → scene metres (the pad is drawn S times its layout size)
  const at = (x: number, y: number, z: number) => new THREE.Vector3(cx + side * x * S, padTop + y * S, cz + z * S);

  const field = useMemo(() => {
    const target: XZ = [cx, cz];
    const xs = ring.map((p) => p[0]);
    const zs = ring.map((p) => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    return lateralLines(ring, target, clamp(span / 11, 9, 40));
  }, [ring, cx, cz]);

  const paths = useMemo(() => {
    const outlet = at(hasBasin ? -YARD.basin.w / 2 - 0.5 : -YARD.pump.w / 2 - 0.8, 0.5, hasBasin ? YARD.basin.z : YARD.pump.z);
    // the feed joins the header at the end nearest the pad
    let hp: XZ = field.header[0] ?? ([outlet.x, outlet.z] as XZ);
    for (const p of field.header) if (Math.hypot(p[0] - outlet.x, p[1] - outlet.z) < Math.hypot(hp[0] - outlet.x, hp[1] - outlet.z)) hp = p;
    const feedPts = [outlet, ...groundPath([outlet.x, outlet.z], hp, heightAt, 0.7).slice(1)];
    const main: THREE.Vector3[] = [];
    if (hasWell) {
      const well = at(YARD.well.x, 1.0, YARD.well.z);
      const pump = at(YARD.pump.x, 1.0, YARD.pump.z + 1);
      main.push(well, at(YARD.well.x, 0.7, YARD.well.z - 3), pump);
      if (hasBasin) main.push(at(YARD.pump.x - 5, 0.7, YARD.pump.z), at(YARD.basin.x + YARD.basin.w / 2 + 0.3, YARD.basin.wall + 0.3, YARD.basin.z));
    }
    const cable = hasCabinet
      ? [at(YARD.pv.x + 12, 0.5, YARD.pv.rows[1]), at(YARD.cabinet.x - 2, 0.5, YARD.cabinet.z + 0.5), at(YARD.cabinet.x + 1, 0.5, YARD.cabinet.z + 3), at(YARD.pump.x + 1, 0.5, YARD.pump.z - YARD.pump.d / 2)]
      : [];
    return { feedPts, main, cable };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `at` is a pure function of cx/cz/side/padTop
  }, [field, heightAt, cx, cz, side, padTop, hasBasin, hasWell, hasCabinet]);

  const curve = (pts: THREE.Vector3[]) => (pts.length >= 2 ? new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.2) : null);
  const mainCurve = useMemo(() => curve(paths.main), [paths.main]);
  const feedCurve = useMemo(() => curve(paths.feedPts), [paths.feedPts]);
  const cableCurve = useMemo(() => (solar ? curve(paths.cable) : null), [paths.cable, solar]);
  const mainTube = useDisposable(useMemo(() => (mainCurve ? new THREE.TubeGeometry(mainCurve, Math.max(16, paths.main.length * 8), 0.45, 6, false) : new THREE.BufferGeometry()), [mainCurve, paths.main.length]));
  const feedTube = useDisposable(useMemo(() => (feedCurve ? new THREE.TubeGeometry(feedCurve, Math.max(12, paths.feedPts.length * 3), 0.5, 6, false) : new THREE.BufferGeometry()), [feedCurve, paths.feedPts.length]));
  const cableTube = useDisposable(useMemo(() => (cableCurve ? new THREE.TubeGeometry(cableCurve, 24, 0.16, 5, false) : new THREE.BufferGeometry()), [cableCurve]));

  // drip lines, the wet strip around each, and the header that joins them
  const lineXZ = useMemo(() => field.lines.map(([a, b]) => [a, b] as XZ[]), [field]);
  const pipeGeo = useDisposable(useMemo(() => strips([...lineXZ, field.header], 1.1, 0.55, heightAt), [lineXZ, field.header, heightAt]));
  const wetGeo = useDisposable(useMemo(() => strips(lineXZ, 6, 0.4, heightAt), [lineXZ, heightAt]));

  const panelMat = useDisposable(useMemo(() => new THREE.MeshStandardMaterial({ color: "#16264f", metalness: 0.55, roughness: 0.28, emissive: "#6f9bff", emissiveIntensity: 0.05 }), []));
  const pipeMat = useDisposable(useMemo(() => new THREE.MeshBasicMaterial({ color: "#59616d", side: THREE.DoubleSide, toneMapped: false }), []));
  const wetMat = useDisposable(useMemo(() => new THREE.MeshBasicMaterial({ color: "#35c4dc", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), []));
  const pipeIdle = useMemo(() => new THREE.Color("#59616d"), []);
  const pipeWet = useMemo(() => new THREE.Color("#1aa3b8"), []);

  const water = useRef<THREE.Mesh>(null!);
  const rotor = useRef<THREE.Mesh>(null!);
  const led = useRef<THREE.MeshBasicMaterial>(null!);
  const mainDrops = useRef<THREE.InstancedMesh>(null!);
  const feedDrops = useRef<THREE.InstancedMesh>(null!);
  const lineDrops = useRef<THREE.InstancedMesh>(null!);
  const sparks = useRef<THREE.InstancedMesh>(null!);
  const level = useRef({ main: 0, feed: 0, field: 0, spark: 0 });
  const lastText = useRef(["", "", ""]);
  const anchor = useMemo(() => at(0, 4, -PAD.d / 2), [cx, cz, side, padTop]); // eslint-disable-line react-hooks/exhaustive-deps
  const projected = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const f = frameAt(plan, basinCapacityM3, kWp);
    const step = plan.hours[f.idx];
    const time = state.clock.elapsedTime;
    const L = level.current;
    const k = Math.min(1, delta * 5);
    const pumping = solar ? f.pumpOn : f.irrigating;
    const mainOn = hasWell && (hasBasin ? f.pumpOn : f.pumpOn || f.irrigating);
    const feedOn = hasBasin ? f.irrigating : f.pumpOn || f.irrigating;
    L.main += ((mainOn ? 1 : 0) - L.main) * k;
    L.feed += ((feedOn ? 1 : 0) - L.feed) * k;
    L.field += ((f.irrigating ? 1 : 0) - L.field) * Math.min(1, delta * 2.2); // the ground takes a moment to wet
    L.spark += ((solar && f.pumpOn ? 1 : 0) - L.spark) * k;

    panelMat.emissiveIntensity = 0.05 + 0.4 * f.pvFrac; // the cells light up with the sun
    if (hasBasin && water.current) {
      const h = Math.max(0.001, f.basinFrac * (YARD.basin.wall - 0.25));
      water.current.scale.y += (h - water.current.scale.y) * Math.min(1, delta * 4);
      water.current.position.y = 0.12 + water.current.scale.y / 2;
    }
    if (rotor.current && pumping) rotor.current.rotation.y += delta * 8;
    if (led.current) led.current.color.set(pumping ? "#46d36b" : solar && f.pvFrac > 0.05 ? "#e3a21a" : "#8a909a");

    if (mainCurve) drops(mainDrops.current, mainCurve, L.main, time * 0.4, 0.8);
    if (feedCurve) drops(feedDrops.current, feedCurve, L.feed, time * 0.3, 0.9);
    if (cableCurve) drops(sparks.current, cableCurve, L.spark, time * 0.5, 0.5);
    // water running out along every drip line, from the header end into the field
    const ld = lineDrops.current;
    field.lines.forEach(([a, b], li) => {
      for (let j = 0; j < PER_LINE; j++) {
        const u = (time * 0.11 + j / PER_LINE + li * 0.13) % 1;
        const x = a[0] + (b[0] - a[0]) * u;
        const z = a[1] + (b[1] - a[1]) * u;
        dummy.position.set(x, heightAt(x, z) + 1.0, z);
        dummy.scale.setScalar(L.field * 0.8);
        dummy.updateMatrix();
        ld.setMatrixAt(li * PER_LINE + j, dummy.matrix);
      }
    });
    ld.instanceMatrix.needsUpdate = true;
    wetMat.opacity = 0.34 * L.field;
    pipeMat.color.copy(pipeIdle).lerp(pipeWet, L.field);

    // the three lines above the pad: plain text updated in place, no re-render per frame
    const idle = source === "grid" ? t.twin.pumpGrid : source === "diesel" ? t.twin.pumpDiesel : source === "network" ? t.twin.network : t.twin.pumpOff;
    const text = [
      solar ? `${(step.pvW / 1000).toFixed(1)} kW` : "",
      solar ? (f.pumpOn ? fmt(t.twin.pumpOn, { m3: step.pumpedM3.toFixed(0) }) : t.twin.pumpOff) : f.irrigating ? fmt(t.twin.irrigating, { m3: step.irrigatedM3.toFixed(0) }) : idle,
      hasBasin ? fmt(t.twin.basin, { m3: Math.round(f.basinFrac * basinCapacityM3) }) : "",
    ];
    text.forEach((s, i) => {
      if (lastText.current[i] !== s) {
        lastText.current[i] = s;
        const el = chips.current[i + 1];
        if (el) el.textContent = s;
      }
    });
    const box = chips.current[0];
    if (box) {
      projected.copy(anchor).project(state.camera);
      const x = ((projected.x + 1) / 2) * state.size.width;
      const y = ((1 - projected.y) / 2) * state.size.height;
      box.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      box.style.opacity = projected.z < 1 ? "1" : "0";
    }
  });

  const p = YARD.pv;
  return (
    <group>
      {/* everything on the pad is built facing west and mirrored when the pad stands west of the field */}
      <group position={[cx, padTop, cz]} scale={[side * S, S, S]}>
        <mesh position={[0, -0.8 - 0.01, 0]}>
          <boxGeometry args={[PAD.w, 1.6, PAD.d]} />
          <meshStandardMaterial color="#d3cbb6" roughness={0.95} />
        </mesh>

        {/* solar panels, tilted to face the sun (south) */}
        {solar &&
          p.rows.map((z) =>
            Array.from({ length: p.perRow }, (_, i) => (
              <group key={`${z}-${i}`} position={[p.x - (p.perRow * (p.panelW + 0.2)) / 2 + (i + 0.5) * (p.panelW + 0.2), 1.2, z]}>
                <group rotation-x={p.tilt}>
                  <mesh>
                    <boxGeometry args={[p.panelW, 0.12, p.panelD]} />
                    <meshStandardMaterial color="#aeb7c4" metalness={0.6} roughness={0.4} />
                  </mesh>
                  <mesh position={[0, 0.07, 0]} material={panelMat}>
                    <boxGeometry args={[p.panelW - 0.28, 0.06, p.panelD - 0.28]} />
                  </mesh>
                </group>
                <mesh position={[0, -0.65, 0]}>
                  <boxGeometry args={[0.2, 1.3, 0.2]} />
                  <meshStandardMaterial color={COLORS.pipe} />
                </mesh>
              </group>
            )),
          )}

        {/* the inverter cabinet, or the diesel generator that replaces the panels */}
        {hasCabinet && (
          <group position={[YARD.cabinet.x, 0, diesel ? YARD.cabinet.z + 2 : YARD.cabinet.z]}>
            <mesh position={[0, (diesel ? 3.4 : YARD.cabinet.h) / 2, 0]}>
              <boxGeometry args={[diesel ? 6 : YARD.cabinet.w, diesel ? 3.4 : YARD.cabinet.h, diesel ? 3.4 : YARD.cabinet.d]} />
              <meshStandardMaterial color={diesel ? "#c78a2c" : "#e6e8ea"} roughness={0.7} />
            </mesh>
            {diesel && (
              <mesh position={[1.8, 5, 0]}>
                <cylinderGeometry args={[0.28, 0.28, 3.2, 8]} />
                <meshStandardMaterial color="#454b55" />
              </mesh>
            )}
            <mesh position={[(diesel ? 6 : YARD.cabinet.w) / 2 + 0.02, 2.2, 0]}>
              <sphereGeometry args={[0.28, 8, 6]} />
              <meshBasicMaterial ref={led} color="#8a909a" toneMapped={false} />
            </mesh>
          </group>
        )}

        {/* pump house (a valve box on a shared network) */}
        <group position={[YARD.pump.x, 0, YARD.pump.z]}>
          <mesh position={[0, YARD.pump.h / 2, 0]}>
            <boxGeometry args={[YARD.pump.w, YARD.pump.h, YARD.pump.d]} />
            <meshStandardMaterial color="#e0ddd2" roughness={0.9} />
          </mesh>
          <mesh position={[0, YARD.pump.h + 0.2, 0]}>
            <boxGeometry args={[YARD.pump.w + 0.8, 0.4, YARD.pump.d + 0.8]} />
            <meshStandardMaterial color="#8e5b3c" roughness={0.8} />
          </mesh>
          <mesh ref={rotor} position={[0, YARD.pump.h + 0.7, 0]}>
            <cylinderGeometry args={[0.95, 0.95, 0.3, 6]} />
            <meshStandardMaterial color={COLORS.sun} metalness={0.3} roughness={0.4} />
          </mesh>
        </group>

        {/* the well */}
        {hasWell && (
          <group position={[YARD.well.x, 0, YARD.well.z]}>
            <mesh position={[0, 0.7, 0]}>
              <cylinderGeometry args={[1.2, 1.3, 1.4, 14]} />
              <meshStandardMaterial color="#cfcabb" roughness={0.9} />
            </mesh>
            <mesh position={[0, 1.5, 0]}>
              <cylinderGeometry args={[0.8, 0.8, 0.2, 14]} />
              <meshStandardMaterial color="#3b434d" metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        )}

        {/* the storage basin, with water that rises and falls */}
        {hasBasin && (
          <group position={[YARD.basin.x, 0, YARD.basin.z]}>
            {[
              [0, YARD.basin.wall / 2, -YARD.basin.d / 2, YARD.basin.w, YARD.basin.wall, 0.5],
              [0, YARD.basin.wall / 2, YARD.basin.d / 2, YARD.basin.w, YARD.basin.wall, 0.5],
              [-YARD.basin.w / 2, YARD.basin.wall / 2, 0, 0.5, YARD.basin.wall, YARD.basin.d],
              [YARD.basin.w / 2, YARD.basin.wall / 2, 0, 0.5, YARD.basin.wall, YARD.basin.d],
              [0, 0.06, 0, YARD.basin.w, 0.12, YARD.basin.d],
            ].map(([x, y, z, w, h, d], i) => (
              <mesh key={i} position={[x, y, z]}>
                <boxGeometry args={[w, h, d]} />
                <meshStandardMaterial color="#e4e1d6" roughness={0.9} />
              </mesh>
            ))}
            <mesh ref={water} position={[0, 0.13, 0]} scale={[1, 0.001, 1]}>
              <boxGeometry args={[YARD.basin.w - 0.9, 1, YARD.basin.d - 0.9]} />
              <meshStandardMaterial color={COLORS.water} transparent opacity={0.9} roughness={0.15} metalness={0.1} />
            </mesh>
          </group>
        )}
      </group>

      {/* pipes, cable and the water moving through them */}
      {mainCurve && (
        <mesh geometry={mainTube}>
          <meshStandardMaterial color={COLORS.pipe} roughness={0.5} />
        </mesh>
      )}
      {feedCurve && (
        <mesh geometry={feedTube}>
          <meshStandardMaterial color={COLORS.pipe} roughness={0.5} />
        </mesh>
      )}
      {cableCurve && (
        <mesh geometry={cableTube}>
          <meshStandardMaterial color="#2b3340" roughness={0.6} />
        </mesh>
      )}
      <mesh geometry={wetGeo} material={wetMat} renderOrder={1} />
      <mesh geometry={pipeGeo} material={pipeMat} renderOrder={2} />
      <instancedMesh ref={mainDrops} args={[undefined, undefined, MAIN_DROPS]} frustumCulled={false}>
        <sphereGeometry args={[0.7, 8, 6]} />
        <meshBasicMaterial color={WATER} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={feedDrops} args={[undefined, undefined, 14]} frustumCulled={false}>
        <sphereGeometry args={[0.8, 8, 6]} />
        <meshBasicMaterial color={WATER} toneMapped={false} />
      </instancedMesh>
      <instancedMesh key={field.lines.length} ref={lineDrops} args={[undefined, undefined, Math.max(1, field.lines.length * PER_LINE)]} frustumCulled={false}>
        <sphereGeometry args={[0.9, 8, 6]} />
        <meshBasicMaterial color={WATER} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={sparks} args={[undefined, undefined, CABLE_SPARKS]} frustumCulled={false}>
        <sphereGeometry args={[0.5, 8, 6]} />
        <meshBasicMaterial color="#ffd24a" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
