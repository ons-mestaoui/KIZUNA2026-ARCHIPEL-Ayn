"use client";
/* eslint-disable react-hooks/immutability -- react-three-fiber is imperative by design: useFrame mutates three.js objects (here, the water texture) */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { puffTexture } from "./Clouds";
import type { HeightAt } from "./geometry";
import { type IslandShape, buildFall, buildVines, hash, rimTrees, waterfallPath } from "./island";

function useDisposable<T extends { dispose(): void }>(value: T) {
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

/** Threads of water: bright vertical streaks on a clear ground, soft at the sides. The caller scrolls it downward. */
function streakTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  for (let x = 0; x < W; x++) {
    const edge = Math.min(1, Math.min(x, W - 1 - x) / 14); // soft edges
    const thread = 0.35 + 0.65 * hash(x, 3, 1);
    for (let seg = 0; seg < 9; seg++) {
      const y0 = hash(x, seg, 7) * H;
      const len = 30 + hash(x, seg, 9) * 90;
      g.fillStyle = `rgba(235,248,255,${(0.25 + 0.55 * hash(x, seg, 5)) * edge * thread})`;
      g.fillRect(x, y0, 1.2, len);
      g.fillRect(x, y0 - H, 1.2, len); // wrap
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const FALL_ANGLES = [0.62, 2.55, 4.4];

/**
 * What makes the island a place rather than a rock: vines down the cliffs, waterfalls pouring off the rim into the clouds
 * (with mist where they land), and a ring of small trees along the outer edge of the top.
 */
export function IslandLife({ shape, heightAt, vines = 30, trees = 16 }: { shape: IslandShape; heightAt: HeightAt; vines?: number; trees?: number }) {
  const { R } = shape;
  const vineGeo = useDisposable(useMemo(() => buildVines(shape, heightAt, vines), [shape, heightAt, vines]));
  const streaks = useDisposable(
    useMemo(() => {
      const t = streakTexture();
      t.repeat.set(1, 1 / (R * 0.2)); // one pattern per 0.2 R of fall
      return t;
    }, [R]),
  );
  const mist = useDisposable(useMemo(() => puffTexture(), []));

  const falls = useMemo(
    () =>
      FALL_ANGLES.map((a, i) => {
        const path = waterfallPath(shape, heightAt, a + (hash(i, 2, 2) - 0.5) * 0.3);
        return { path, geo: buildFall(path, R * 0.03, R * 0.052) };
      }),
    [shape, heightAt, R],
  );
  useEffect(() => () => falls.forEach((f) => f.geo.dispose()), [falls]);

  // trees: a trunk, and two blobs of leaves, instanced
  const list = useMemo(() => rimTrees(shape, heightAt, trees), [shape, heightAt, trees]);
  const trunks = useRef<THREE.InstancedMesh>(null!);
  const crowns = useRef<THREE.InstancedMesh>(null!);
  const crowns2 = useRef<THREE.InstancedMesh>(null!);
  useEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    list.forEach((t, i) => {
      o.position.set(t.x, t.y + t.h * 0.2, t.z);
      o.rotation.set(0, t.seed * 1.7, 0);
      o.scale.set(t.h * 0.1, t.h * 0.4, t.h * 0.1);
      o.updateMatrix();
      trunks.current.setMatrixAt(i, o.matrix);
      o.position.set(t.x, t.y + t.h * 0.62, t.z);
      o.scale.setScalar(t.h * 0.36);
      o.updateMatrix();
      crowns.current.setMatrixAt(i, o.matrix);
      c.set("#4f8a32").lerp(new THREE.Color("#8bbf45"), hash(t.seed, 1, 1));
      crowns.current.setColorAt(i, c);
      o.position.set(t.x + t.h * 0.12, t.y + t.h * 0.86, t.z - t.h * 0.06);
      o.scale.setScalar(t.h * 0.26);
      o.updateMatrix();
      crowns2.current.setMatrixAt(i, o.matrix);
      c.set("#5f9a36").lerp(new THREE.Color("#a0cc55"), hash(t.seed, 2, 1));
      crowns2.current.setColorAt(i, c);
    });
    for (const m of [trunks.current, crowns.current, crowns2.current]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }, [list]);

  useFrame((_, delta) => {
    streaks.offset.y -= delta * 0.9; // the water runs downward
  });

  return (
    <group>
      <mesh geometry={vineGeo}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
      {falls.map((f, i) => (
        <group key={i}>
          <mesh geometry={f.geo} renderOrder={3}>
            <meshBasicMaterial map={streaks} color="#dff3ff" transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} fog={false} />
          </mesh>
          {/* mist where it lands */}
          <sprite position={[f.path[f.path.length - 1].x, f.path[f.path.length - 1].y + R * 0.02, f.path[f.path.length - 1].z]} scale={[R * 0.55, R * 0.3, 1]}>
            <spriteMaterial map={mist} transparent opacity={0.85} depthWrite={false} fog={false} toneMapped={false} />
          </sprite>
        </group>
      ))}
      <instancedMesh ref={trunks} args={[undefined, undefined, list.length]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1.4, 1, 6]} />
        <meshStandardMaterial color="#6b5640" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, list.length]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={crowns2} args={[undefined, undefined, list.length]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  );
}
