"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { DailyPlan } from "@/lib/engine/types";
import { useApp } from "@/lib/store";
import { ARRAY, BASIN, COLORS, LAYERS, PARCEL, PUMP_HOUSE, WELL } from "./layout";
import { setLabel } from "./labels";
import { frameAt } from "./useTwinFrame";

const PANELS_PER_ROW = 6;
const PARTICLES = 14;
const tmp = new THREE.Vector3();
const dummy = new THREE.Object3D();

export function WaterSystem({ plan, shadows }: { plan: DailyPlan; shadows: boolean }) {
  const parcel = useApp((s) => s.parcel);
  const panelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: COLORS.panel,
        metalness: 0.5,
        roughness: 0.25,
        emissive: COLORS.sun,
        emissiveIntensity: 0.1,
      }),
    [],
  );
  const water = useRef<THREE.Mesh>(null!);
  const rotor = useRef<THREE.Mesh>(null!);
  const pumpFlow = useRef<THREE.InstancedMesh>(null!);
  const dripFlow = useRef<THREE.InstancedMesh>(null!);

  const wellDepth = LAYERS.topsoil + LAYERS.subsoil + LAYERS.aquifer * 0.6;

  const { pumpCurve, feedCurve } = useMemo(() => {
    const pumpCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(WELL.x, -wellDepth + 0.1, WELL.z),
      new THREE.Vector3(WELL.x, 0.15, WELL.z),
      new THREE.Vector3(PUMP_HOUSE.x, 0.15, PUMP_HOUSE.z),
      new THREE.Vector3(BASIN.x + BASIN.w / 2 - 0.3, 0.15, PUMP_HOUSE.z + 0.4),
      new THREE.Vector3(BASIN.x + BASIN.w / 2 - 0.3, BASIN.h + 0.1, BASIN.z - BASIN.d / 2 + 0.2),
    ], false, "catmullrom", 0.1);
    const feedCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(BASIN.x - BASIN.w / 2, 0.08, BASIN.z),
      new THREE.Vector3(PARCEL.x1 + 0.1, 0.08, BASIN.z),
      new THREE.Vector3(PARCEL.x1 + 0.1, 0.08, PARCEL.z0 + 0.3),
    ], false, "catmullrom", 0.05);
    return { pumpCurve, feedCurve };
  }, [wellDepth]);

  useFrame((state, delta) => {
    const f = frameAt(plan, parcel.basinCapacityM3, parcel.pv.kWp);
    const t = state.clock.elapsedTime;
    // golden glow on the panels ∝ PV output — "the golden drop" of energy
    panelMat.emissiveIntensity = 0.04 + 0.32 * f.pvFrac;
    // basin water level
    const h = Math.max(0.001, f.basinFrac * (BASIN.h - 0.08));
    water.current.scale.y += (h - water.current.scale.y) * Math.min(1, delta * 4);
    water.current.position.y = 0.04 + water.current.scale.y / 2;
    // pump rotor spins while pumping
    if (f.pumpOn) rotor.current.rotation.y += delta * 8;
    flow(pumpFlow.current, pumpCurve, f.pumpOn, t * 0.35);
    flow(dripFlow.current, feedCurve, f.irrigating, t * 0.3);
    // labels (direct DOM writes, no React re-render)
    const step = plan.hours[f.idx];
    setLabel("pv", `${(step.pvW / 1000).toFixed(1)} kW`);
    setLabel("pump", f.pumpOn ? `Pump on · ${step.pumpedM3.toFixed(0)} m³/h` : "Pump off");
    setLabel("basin", `Basin ${Math.round(f.basinFrac * parcel.basinCapacityM3)} m³`);
  });

  return (
    <group>
      {/* solar array: 2 rows facing south, tilted 30° */}
      {ARRAY.rowsZ.map((z) => (
        <group key={z} position={[ARRAY.x, 0, z]}>
          {Array.from({ length: PANELS_PER_ROW }, (_, i) => (
            <group key={i} position={[-ARRAY.width / 2 + (ARRAY.width / PANELS_PER_ROW) * (i + 0.5), 0.55, 0]}>
              <mesh rotation-x={ARRAY.tilt} castShadow={shadows} material={panelMat}>
                <boxGeometry args={[ARRAY.width / PANELS_PER_ROW - 0.06, 0.04, 1.05]} />
              </mesh>
              <mesh position={[0, -0.3, 0]}>
                <boxGeometry args={[0.04, 0.55, 0.04]} />
                <meshStandardMaterial color={COLORS.pipe} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* borehole cut in half by the east face: visible down to the aquifer */}
      <mesh position={[WELL.x, -wellDepth / 2 + 0.1, WELL.z]}>
        <cylinderGeometry args={[WELL.r, WELL.r, wellDepth + 0.2, 16]} />
        <meshStandardMaterial color="#20252c" roughness={0.6} />
      </mesh>
      <mesh position={[WELL.x, -wellDepth / 2 + 0.1, WELL.z]}>
        <cylinderGeometry args={[0.045, 0.045, wellDepth + 0.4, 8]} />
        <meshStandardMaterial color={COLORS.pipe} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* pump house + controller */}
      <group position={[PUMP_HOUSE.x, 0, PUMP_HOUSE.z]}>
        <mesh position={[0, 0.3, 0]} castShadow={shadows}>
          <boxGeometry args={[0.9, 0.6, 0.7]} />
          <meshStandardMaterial color={COLORS.concrete} roughness={0.9} />
        </mesh>
        <mesh ref={rotor} position={[0, 0.66, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.08, 6]} />
          <meshStandardMaterial color={COLORS.sun} metalness={0.3} roughness={0.4} />
        </mesh>
      </group>

      {/* storage basin (bassin d'accumulation) */}
      <group position={[BASIN.x, 0, BASIN.z]}>
        {[
          [0, BASIN.h / 2, -BASIN.d / 2, BASIN.w, BASIN.h, 0.1],
          [0, BASIN.h / 2, BASIN.d / 2, BASIN.w, BASIN.h, 0.1],
          [-BASIN.w / 2, BASIN.h / 2, 0, 0.1, BASIN.h, BASIN.d],
          [BASIN.w / 2, BASIN.h / 2, 0, 0.1, BASIN.h, BASIN.d],
          [0, 0.02, 0, BASIN.w, 0.04, BASIN.d],
        ].map(([x, y, z, w, hh, d], i) => (
          <mesh key={i} position={[x, y, z]} castShadow={shadows} receiveShadow>
            <boxGeometry args={[w, hh, d]} />
            <meshStandardMaterial color={COLORS.concrete} roughness={0.9} />
          </mesh>
        ))}
        <mesh ref={water} position={[0, 0.05, 0]} scale={[1, 0.001, 1]}>
          <boxGeometry args={[BASIN.w - 0.12, 1, BASIN.d - 0.12]} />
          <meshStandardMaterial color={COLORS.water} transparent opacity={0.85} roughness={0.15} metalness={0.1} />
        </mesh>
      </group>

      {/* pipes */}
      <mesh>
        <tubeGeometry args={[pumpCurve, 64, 0.05, 6, false]} />
        <meshStandardMaterial color={COLORS.pipe} roughness={0.5} />
      </mesh>
      <mesh>
        <tubeGeometry args={[feedCurve, 48, 0.05, 6, false]} />
        <meshStandardMaterial color={COLORS.pipe} roughness={0.5} />
      </mesh>
      {/* water moving through the pipes */}
      <instancedMesh ref={pumpFlow} args={[undefined, undefined, PARTICLES]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshBasicMaterial color="#7fe3f0" />
      </instancedMesh>
      <instancedMesh ref={dripFlow} args={[undefined, undefined, PARTICLES]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshBasicMaterial color="#7fe3f0" />
      </instancedMesh>
    </group>
  );
}

function flow(mesh: THREE.InstancedMesh, curve: THREE.Curve<THREE.Vector3>, on: boolean, phase: number) {
  for (let i = 0; i < PARTICLES; i++) {
    const u = (phase + i / PARTICLES) % 1;
    curve.getPointAt(u, tmp);
    dummy.position.copy(tmp);
    dummy.scale.setScalar(on ? 1 : 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
