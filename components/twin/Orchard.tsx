"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CropId, DailyPlan, ParcelConfig } from "@/lib/engine/types";
import { COLORS, PARCEL } from "./layout";
import { frameAt } from "./useTwinFrame";

const dummy = new THREE.Object3D();
const canopyTarget = new THREE.Color();

interface Look {
  rows: number;
  cols: number;
  trunkH: number;
  canopyR: number;
  canopyY: number;
  squash: number; // canopy height relative to its width
  color: string;
  stressed: string;
}

// What each crop looks like from above: trees are tall and sparse, vegetables low and dense.
const LOOKS: Record<CropId, Look> = {
  citrus: { rows: 12, cols: 13, trunkH: 0.36, canopyR: 0.28, canopyY: 0.48, squash: 1, color: "#3d7a3a", stressed: "#a59a3a" },
  olive: { rows: 10, cols: 11, trunkH: 0.4, canopyR: 0.34, canopyY: 0.55, squash: 0.85, color: "#7a8f58", stressed: "#a8995a" },
  datePalm: { rows: 6, cols: 7, trunkH: 1.0, canopyR: 0.34, canopyY: 1.12, squash: 0.55, color: "#3f7d45", stressed: "#a59a3a" },
  grape: { rows: 14, cols: 22, trunkH: 0.25, canopyR: 0.17, canopyY: 0.36, squash: 1.2, color: "#5b8f3a", stressed: "#b0a23c" },
  tomato: { rows: 18, cols: 26, trunkH: 0.1, canopyR: 0.11, canopyY: 0.16, squash: 1.1, color: "#4a8f3f", stressed: "#b0a23c" },
  pepper: { rows: 18, cols: 26, trunkH: 0.1, canopyR: 0.1, canopyY: 0.15, squash: 1.1, color: "#3f8a45", stressed: "#b0a23c" },
  potato: { rows: 18, cols: 26, trunkH: 0.06, canopyR: 0.12, canopyY: 0.11, squash: 0.8, color: "#5a9a45", stressed: "#b0a23c" },
  watermelon: { rows: 9, cols: 13, trunkH: 0.04, canopyR: 0.22, canopyY: 0.12, squash: 0.5, color: "#2f7a45", stressed: "#a8a03c" },
};

function positions(rows: number, cols: number) {
  const out: [number, number][] = [];
  const dx = (PARCEL.x1 - PARCEL.x0) / cols;
  const dz = (PARCEL.z1 - PARCEL.z0) / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([PARCEL.x0 + dx * (c + 0.5), PARCEL.z0 + dz * (r + 0.5)]);
  return out;
}

/** The crop (instanced: 3 draw calls) + irrigation laterals + wetted bulbs under each plant. */
export function Orchard({ plan, parcel, shadows }: { plan: DailyPlan; parcel: ParcelConfig; shadows: boolean }) {
  const look = LOOKS[parcel.crop];
  const pos = useMemo(() => positions(look.rows, look.cols), [look.rows, look.cols]);
  const count = pos.length;
  const healthy = useMemo(() => new THREE.Color(look.color), [look.color]);
  const stressed = useMemo(() => new THREE.Color(look.stressed), [look.stressed]);

  const trunks = useRef<THREE.InstancedMesh>(null!);
  const canopies = useRef<THREE.InstancedMesh>(null!);
  const bulbs = useRef<THREE.InstancedMesh>(null!);
  const bulbMat = useRef<THREE.MeshBasicMaterial>(null!);
  const canopyMat = useRef<THREE.MeshStandardMaterial>(null!);
  const dripMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2b2f36", emissive: COLORS.water, emissiveIntensity: 0 }),
    [],
  );

  useLayoutEffect(() => {
    const k = look.canopyR / 0.28; // canopy geometry radius is 0.28
    pos.forEach(([x, z], i) => {
      const s = 0.85 + ((i * 37) % 11) / 40; // deterministic size variety
      dummy.position.set(x, (look.trunkH / 2) * s, z);
      dummy.scale.set(1, (look.trunkH / 0.36) * s, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trunks.current.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, look.canopyY * s, z);
      dummy.scale.set(k * s, k * s * look.squash, k * s);
      dummy.rotation.set(0, (i * 1.7) % Math.PI, 0);
      dummy.updateMatrix();
      canopies.current.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 0.006, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(Math.max(0.6, k));
      dummy.updateMatrix();
      bulbs.current.setMatrixAt(i, dummy.matrix);
    });
    trunks.current.instanceMatrix.needsUpdate = true;
    canopies.current.instanceMatrix.needsUpdate = true;
    bulbs.current.instanceMatrix.needsUpdate = true;
  }, [pos, look]);

  useFrame((state, delta) => {
    const f = frameAt(plan, parcel.basinCapacityM3, parcel.pv.kWp);
    // laterals glow + wetted bulbs grow while irrigating
    dripMat.emissiveIntensity = f.irrigating ? 0.6 + 0.4 * Math.sin(state.clock.elapsedTime * 4) : 0;
    bulbMat.current.opacity += ((f.irrigating ? 0.55 : 0) - bulbMat.current.opacity) * Math.min(1, delta * 2);
    // canopy colour reflects water stress
    const stress = plan.stress === "severe" ? 1 : plan.stress === "mild" ? 0.45 : 0;
    canopyTarget.copy(healthy).lerp(stressed, stress);
    canopyMat.current.color.lerp(canopyTarget, Math.min(1, delta * 2));
  });

  const rowLen = PARCEL.x1 - PARCEL.x0;
  const dz = (PARCEL.z1 - PARCEL.z0) / look.rows;

  return (
    <group>
      <instancedMesh key={`t${count}`} ref={trunks} args={[undefined, undefined, count]} castShadow={shadows}>
        <cylinderGeometry args={[0.035, 0.05, 0.36, 5]} />
        <meshStandardMaterial color={COLORS.trunk} roughness={1} />
      </instancedMesh>
      <instancedMesh key={`c${count}`} ref={canopies} args={[undefined, undefined, count]} castShadow={shadows}>
        <icosahedronGeometry args={[0.28, 1]} />
        <meshStandardMaterial ref={canopyMat} color={look.color} roughness={0.8} flatShading />
      </instancedMesh>
      <instancedMesh key={`b${count}`} ref={bulbs} args={[undefined, undefined, count]}>
        <circleGeometry args={[0.26, 16]} />
        <meshBasicMaterial ref={bulbMat} color={COLORS.soilWet} transparent opacity={0} depthWrite={false} />
      </instancedMesh>
      {Array.from({ length: look.rows }, (_, r) => (
        <mesh key={r} material={dripMat} position={[(PARCEL.x0 + PARCEL.x1) / 2, 0.02, PARCEL.z0 + dz * (r + 0.5) + 0.12]}>
          <boxGeometry args={[rowLen, 0.02, 0.02]} />
        </mesh>
      ))}
    </group>
  );
}
