"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { DailyPlan, ParcelConfig } from "@/lib/engine/types";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useLang";
import { setLabel } from "./labels";
import { ARRAY, BASIN, COLORS, LAYERS, PARCEL, PUMP_HOUSE, WELL } from "./layout";
import { frameAt } from "./useTwinFrame";

const PANELS_PER_ROW = 6;
const PARTICLES = 14;
const tmp = new THREE.Vector3();
const dummy = new THREE.Object3D();

/**
 * Pump house, well, pipes, and — only when the farm has them — the solar array and the storage basin.
 *   solar_basin → well → pump → basin → field      solar_direct / grid / diesel → well → pump → field
 *   network     → valve box → field (no well)
 */
export function WaterSystem({ plan, parcel, shadows }: { plan: DailyPlan; parcel: ParcelConfig; shadows: boolean }) {
  const t = useT();
  const source = plan.source;
  const solar = source === "solar_basin" || source === "solar_direct";
  const hasBasin = source === "solar_basin";
  const hasWell = source !== "network";

  const panelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: COLORS.panel, metalness: 0.5, roughness: 0.25, emissive: COLORS.sun, emissiveIntensity: 0.1 }),
    [],
  );
  const water = useRef<THREE.Mesh>(null!);
  const rotor = useRef<THREE.Mesh>(null!);
  const mainFlow = useRef<THREE.InstancedMesh>(null!);
  const feedFlow = useRef<THREE.InstancedMesh>(null!);

  const wellDepth = LAYERS.topsoil + LAYERS.subsoil + LAYERS.aquifer * 0.6;

  const { mainCurve, feedCurve } = useMemo(() => {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const pump = v(PUMP_HOUSE.x, 0.15, PUMP_HOUSE.z);
    const wellPts = hasWell ? [v(WELL.x, -wellDepth + 0.1, WELL.z), v(WELL.x, 0.15, WELL.z)] : [];
    if (hasBasin) {
      const main = new THREE.CatmullRomCurve3(
        [...wellPts, pump, v(BASIN.x + BASIN.w / 2 - 0.3, 0.15, PUMP_HOUSE.z + 0.4), v(BASIN.x + BASIN.w / 2 - 0.3, BASIN.h + 0.1, BASIN.z - BASIN.d / 2 + 0.2)],
        false,
        "catmullrom",
        0.1,
      );
      const feed = new THREE.CatmullRomCurve3(
        [v(BASIN.x - BASIN.w / 2, 0.08, BASIN.z), v(PARCEL.x1 + 0.1, 0.08, BASIN.z), v(PARCEL.x1 + 0.1, 0.08, PARCEL.z0 + 0.3)],
        false,
        "catmullrom",
        0.05,
      );
      return { mainCurve: main, feedCurve: feed };
    }
    // no basin: the pump feeds the field directly
    const main = new THREE.CatmullRomCurve3(
      [...wellPts, pump, v(PARCEL.x1 + 0.1, 0.08, PUMP_HOUSE.z), v(PARCEL.x1 + 0.1, 0.08, PARCEL.z0 + 0.3)],
      false,
      "catmullrom",
      0.05,
    );
    return { mainCurve: main, feedCurve: null };
  }, [hasBasin, hasWell, wellDepth]);

  useFrame((state, delta) => {
    const f = frameAt(plan, parcel.basinCapacityM3, parcel.pv.kWp);
    const time = state.clock.elapsedTime;
    const step = plan.hours[f.idx];

    panelMat.emissiveIntensity = 0.04 + 0.32 * f.pvFrac; // golden glow ∝ PV output
    if (hasBasin) {
      const h = Math.max(0.001, f.basinFrac * (BASIN.h - 0.08));
      water.current.scale.y += (h - water.current.scale.y) * Math.min(1, delta * 4);
      water.current.position.y = 0.04 + water.current.scale.y / 2;
    }
    const pumping = solar ? f.pumpOn : f.irrigating;
    if (pumping) rotor.current.rotation.y += delta * 8;
    flow(mainFlow.current, mainCurve, hasBasin ? f.pumpOn : f.pumpOn || f.irrigating, time * 0.35);
    flow(feedFlow.current, feedCurve ?? mainCurve, hasBasin ? f.irrigating : false, time * 0.3);

    // labels are DOM nodes updated directly (no React re-render per frame)
    setLabel("pv", solar ? `${(step.pvW / 1000).toFixed(1)} kW` : "");
    const idle = source === "grid" ? t.twin.pumpGrid : source === "diesel" ? t.twin.pumpDiesel : source === "network" ? t.twin.network : t.twin.pumpOff;
    setLabel(
      "pump",
      solar
        ? f.pumpOn
          ? fmt(t.twin.pumpOn, { m3: step.pumpedM3.toFixed(0) })
          : t.twin.pumpOff
        : f.irrigating
          ? fmt(t.twin.irrigating, { m3: step.irrigatedM3.toFixed(0) })
          : idle,
    );
    setLabel("basin", hasBasin ? fmt(t.twin.basin, { m3: Math.round(f.basinFrac * parcel.basinCapacityM3) }) : "");
  });

  return (
    <group>
      {/* solar array: 2 rows facing the equator, tilted 30° */}
      {solar &&
        ARRAY.rowsZ.map((z) => (
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
      {hasWell && (
        <>
          <mesh position={[WELL.x, -wellDepth / 2 + 0.1, WELL.z]}>
            <cylinderGeometry args={[WELL.r, WELL.r, wellDepth + 0.2, 16]} />
            <meshStandardMaterial color="#20252c" roughness={0.6} />
          </mesh>
          <mesh position={[WELL.x, -wellDepth / 2 + 0.1, WELL.z]}>
            <cylinderGeometry args={[0.045, 0.045, wellDepth + 0.4, 8]} />
            <meshStandardMaterial color={COLORS.pipe} metalness={0.6} roughness={0.4} />
          </mesh>
        </>
      )}

      {/* pump house + controller (a valve box on a shared network) */}
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
      {hasBasin && (
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
      )}

      {/* pipes, and the water moving through them */}
      <mesh key={`m${hasBasin}${hasWell}`}>
        <tubeGeometry args={[mainCurve, 64, 0.05, 6, false]} />
        <meshStandardMaterial color={COLORS.pipe} roughness={0.5} />
      </mesh>
      {feedCurve && (
        <mesh>
          <tubeGeometry args={[feedCurve, 48, 0.05, 6, false]} />
          <meshStandardMaterial color={COLORS.pipe} roughness={0.5} />
        </mesh>
      )}
      <instancedMesh ref={mainFlow} args={[undefined, undefined, PARTICLES]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshBasicMaterial color="#7fe3f0" />
      </instancedMesh>
      <instancedMesh ref={feedFlow} args={[undefined, undefined, PARTICLES]}>
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
