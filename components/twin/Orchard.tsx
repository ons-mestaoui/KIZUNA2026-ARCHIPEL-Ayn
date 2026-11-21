"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { DailyPlan } from "@/lib/engine/types";
import { useApp } from "@/lib/store";
import { COLORS, PARCEL, PER_ROW, ROWS } from "./layout";
import { frameAt } from "./useTwinFrame";

const dummy = new THREE.Object3D();
const healthy = new THREE.Color(COLORS.canopy);
const stressed = new THREE.Color(COLORS.canopyStressed);
const canopyTarget = new THREE.Color();

function treePositions() {
  const out: [number, number][] = [];
  const dx = (PARCEL.x1 - PARCEL.x0) / PER_ROW;
  const dz = (PARCEL.z1 - PARCEL.z0) / ROWS;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < PER_ROW; c++) out.push([PARCEL.x0 + dx * (c + 0.5), PARCEL.z0 + dz * (r + 0.5)]);
  return out;
}

/** Citrus orchard (instanced: 2 draw calls) + drip lines + wetted bulbs under each tree. */
export function Orchard({ plan, shadows }: { plan: DailyPlan; shadows: boolean }) {
  const trunks = useRef<THREE.InstancedMesh>(null!);
  const canopies = useRef<THREE.InstancedMesh>(null!);
  const bulbs = useRef<THREE.InstancedMesh>(null!);
  const bulbMat = useRef<THREE.MeshBasicMaterial>(null!);
  const dripMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2b2f36", emissive: COLORS.water, emissiveIntensity: 0 }),
    [],
  );
  const canopyMat = useRef<THREE.MeshStandardMaterial>(null!);
  const pos = useMemo(treePositions, []);
  const count = pos.length;
  const parcel = useApp((s) => s.parcel);

  useLayoutEffect(() => {
    pos.forEach(([x, z], i) => {
      const s = 0.85 + ((i * 37) % 11) / 40; // deterministic size variety
      dummy.position.set(x, 0.18 * s, z);
      dummy.scale.set(1, s, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trunks.current.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 0.48 * s, z);
      dummy.scale.setScalar(s);
      dummy.rotation.set(0, (i * 1.7) % Math.PI, 0);
      dummy.updateMatrix();
      canopies.current.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 0.006, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      bulbs.current.setMatrixAt(i, dummy.matrix);
    });
    trunks.current.instanceMatrix.needsUpdate = true;
    canopies.current.instanceMatrix.needsUpdate = true;
    bulbs.current.instanceMatrix.needsUpdate = true;
  }, [pos]);

  useFrame((state, delta) => {
    const f = frameAt(plan, parcel.basinCapacityM3, parcel.pv.kWp);
    // drip lines glow + wetted bulbs grow while irrigating
    const pulse = f.irrigating ? 0.6 + 0.4 * Math.sin(state.clock.elapsedTime * 4) : 0;
    dripMat.emissiveIntensity = pulse;
    const targetOpacity = f.irrigating ? 0.55 : 0;
    bulbMat.current.opacity += (targetOpacity - bulbMat.current.opacity) * Math.min(1, delta * 2);
    // canopy colour reflects water stress
    const stress = plan.stress === "severe" ? 1 : plan.stress === "mild" ? 0.45 : 0;
    canopyTarget.copy(healthy).lerp(stressed, stress);
    canopyMat.current.color.lerp(canopyTarget, Math.min(1, delta * 2));
  });

  const rowLen = PARCEL.x1 - PARCEL.x0;
  const dz = (PARCEL.z1 - PARCEL.z0) / ROWS;

  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, count]} castShadow={shadows}>
        <cylinderGeometry args={[0.035, 0.05, 0.36, 5]} />
        <meshStandardMaterial color={COLORS.trunk} roughness={1} />
      </instancedMesh>
      <instancedMesh ref={canopies} args={[undefined, undefined, count]} castShadow={shadows}>
        <icosahedronGeometry args={[0.28, 1]} />
        <meshStandardMaterial ref={canopyMat} color={COLORS.canopy} roughness={0.8} flatShading />
      </instancedMesh>
      <instancedMesh ref={bulbs} args={[undefined, undefined, count]}>
        <circleGeometry args={[0.26, 16]} />
        <meshBasicMaterial ref={bulbMat} color={COLORS.soilWet} transparent opacity={0} depthWrite={false} />
      </instancedMesh>
      {/* drip laterals, one per row */}
      {Array.from({ length: ROWS }, (_, r) => (
        <mesh
          key={r}
          material={dripMat}
          position={[(PARCEL.x0 + PARCEL.x1) / 2, 0.02, PARCEL.z0 + dz * (r + 0.5) + 0.12]}
        >
          <boxGeometry args={[rowLen, 0.02, 0.02]} />
        </mesh>
      ))}
    </group>
  );
}
