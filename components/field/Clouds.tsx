"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type IslandShape, fbm, floatingRocks, rockGeometry } from "./island";

function useDisposable<T extends { dispose(): void }>(value: T) {
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

const hash = (a: number, b: number) => {
  const s = Math.sin(a * 91.7 + b * 47.3) * 43758.5453;
  return s - Math.floor(s);
};

/** One soft puff: overlapping blurry discs, bright on top and a little blue underneath. Drawn once, shared by every sprite. */
export function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 144;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 11; i++) {
    const x = 40 + hash(i, 1) * 176;
    const y = 52 + hash(i, 2) * 48;
    const r = 30 + hash(i, 3) * 36;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.5)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 144);
  }
  g.globalCompositeOperation = "source-atop"; // shade only where there is cloud
  const shade = g.createLinearGradient(0, 30, 0, 144);
  shade.addColorStop(0, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(120,145,190,0.55)");
  g.fillStyle = shade;
  g.fillRect(0, 0, 256, 144);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The sea of cloud far below: a wide disc, thick in the middle and thinning to nothing at the edge, with noisy lumps. */
function floorTexture(): THREE.CanvasTexture {
  const N = 256;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x / N - 0.5) * 2;
      const dy = (y / N - 0.5) * 2;
      const d = Math.hypot(dx, dy);
      const lump = fbm(x / 22, y / 22, 1.7);
      const a = Math.max(0, Math.min(1, (1 - d) * 2.2)) * (0.45 + 0.75 * lump);
      const k = (y * N + x) * 4;
      img.data[k] = 246 - 26 * (1 - lump);
      img.data[k + 1] = 249 - 22 * (1 - lump);
      img.data[k + 2] = 255 - 8 * (1 - lump);
      img.data[k + 3] = Math.min(255, a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const shadowTexture = () => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, "rgba(40,60,110,0.38)");
  grad.addColorStop(1, "rgba(40,60,110,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
};

/**
 * Clouds and mist under the island: puffs in a ring around and below it (some hugging the rim like a mist bank), a sea
 * of cloud far under it with the island's soft shadow on it, and a glow where the tip fades out. They drift slowly.
 */
export function Clouds({ shape, count = 30 }: { shape: IslandShape; count?: number }) {
  const { cx, cz, R, depth } = shape;
  const puff = useDisposable(useMemo(() => puffTexture(), []));
  const floor = useDisposable(useMemo(() => floorTexture(), []));
  const shadow = useDisposable(useMemo(() => shadowTexture(), []));

  const puffs = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // most puffs make the sea the island floats above; some wisps stand far out at its sides for depth
        const wisp = i % 4 === 0;
        const a = i * 2.399963 + hash(i, 5) * 0.8; // golden angle: an even spread
        const r = R * (wisp ? 1.9 + 0.8 * hash(i, 6) : 0.2 + 2.3 * Math.sqrt(hash(i, 6)));
        const y = wisp ? -depth * (0.35 + 0.6 * hash(i, 7)) : -depth * (1.3 + 0.35 * hash(i, 7));
        const w = R * (wisp ? 0.7 + 0.6 * hash(i, 8) : 0.9 + 0.9 * hash(i, 8));
        return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, w, o: 0.55 + 0.4 * hash(i, 9), phase: hash(i, 10) * 6.28, tint: wisp ? 1 : 0.92 - 0.1 * hash(i, 11) };
      }),
    [count, R, depth],
  );

  const group = useRef<THREE.Group>(null!);
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  const sea = useRef<THREE.Mesh>(null!);
  useFrame((state, delta) => {
    group.current.rotation.y += delta * 0.012; // the whole bank drifts around the island
    sea.current.rotation.z += delta * 0.006;
    const t = state.clock.elapsedTime;
    sprites.current.forEach((s, i) => {
      if (s) s.position.y = puffs[i].y + Math.sin(t * 0.22 + puffs[i].phase) * R * 0.012;
    });
  });

  const seaY = -depth * 1.62;
  return (
    <group position={[cx, 0, cz]}>
      <mesh ref={sea} rotation-x={-Math.PI / 2} position={[0, seaY, 0]} renderOrder={-2}>
        <circleGeometry args={[R * 2.8, 48]} />
        <meshBasicMaterial map={floor} transparent opacity={0.9} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, seaY + 0.6, 0]} renderOrder={-1}>
        <circleGeometry args={[R * 1.7, 48]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <group ref={group}>
        {puffs.map((p, i) => (
          <sprite
            key={i}
            ref={(s) => {
              sprites.current[i] = s;
            }}
            position={[p.x, p.y, p.z]}
            scale={[p.w, p.w * 0.56, 1]}
          >
            <spriteMaterial map={puff} transparent opacity={p.o} depthWrite={false} color={new THREE.Color(p.tint, p.tint, 1)} fog={false} toneMapped={false} />
          </sprite>
        ))}
      </group>
    </group>
  );
}

/** Rocks drifting around the island, each bobbing and turning slowly. */
export function FloatingRocks({ shape, count = 8 }: { shape: IslandShape; count?: number }) {
  const rocks = useMemo(() => floatingRocks(shape, count), [shape, count]);
  const geos = useMemo(() => rocks.map((r) => rockGeometry(r.seed)), [rocks]);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    rocks.forEach((r, i) => {
      const m = meshes.current[i];
      if (!m) return;
      m.position.y = r.at[1] + Math.sin(t * r.bob[1] + r.bob[2]) * r.bob[0];
      m.rotation.y = t * 0.05 * (i % 2 ? 1 : -1) + r.seed;
    });
  });
  return (
    <>
      {rocks.map((r, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={geos[i]}
          position={r.at}
          scale={r.radius}
        >
          <meshStandardMaterial vertexColors flatShading roughness={0.95} metalness={0} />
        </mesh>
      ))}
    </>
  );
}
