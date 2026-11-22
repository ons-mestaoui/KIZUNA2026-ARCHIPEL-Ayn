"use client";

import { RoundedBox } from "@react-three/drei";
import { type RefObject, useMemo } from "react";
import * as THREE from "three";
import { PAD, YARD } from "./yard";

// The farm's kit, drawn properly: framed solar modules with cells on racks, a pump house with a roof and a fan, a stone
// well, a concrete basin, a generator. Everything is in layout units on the pad (see yard.ts), built facing west.
// Parts are plain meshes with shared materials; the few that move (rotor, water, LED, cells) are driven by the caller.

type Sh = { castShadow?: boolean; receiveShadow?: boolean };
const sh = (on: boolean): Sh => (on ? { castShadow: true, receiveShadow: true } : {});

// ── materials, created once ──────────────────────────────────────────────────────────────────────────────────
const std = (color: string, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
let cache: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  return {
    concrete: std("#9d978a", 0.95),
    concreteLight: std("#b4af9f", 0.92),
    curb: std("#8d8779", 0.95),
    joint: std("#7d786b", 1),
    plaster: std("#e4dcc9", 0.92),
    clay: std("#b4603a", 0.85),
    clayDark: std("#8c4a2d", 0.9),
    wood: std("#6d4a30", 0.85),
    woodDark: std("#4d3322", 0.9),
    alu: std("#c3cad3", 0.35, 0.8),
    steel: std("#7d8591", 0.45, 0.75),
    steelDark: std("#3d444e", 0.5, 0.6),
    black: std("#1d2128", 0.7),
    stone: std("#c9c1ad", 0.95),
    stoneB: std("#b6ad97", 0.95),
    stoneRim: std("#ddd5c1", 0.9),
    cabinet: std("#e3e6e8", 0.55, 0.15),
    cabinetDark: std("#b9bfc6", 0.5, 0.3),
    genBody: std("#d98a1c", 0.55, 0.2),
    genBand: std("#2f353d", 0.6, 0.3),
    pipe: std("#7a8390", 0.45, 0.6),
    red: std("#c2352b", 0.55, 0.2),
    foliage: std("#7f9358", 0.9),
    trunk: std("#6b5640", 0.95),
    waterDeep: new THREE.MeshStandardMaterial({ color: "#1e8fb0", roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.92 }),
    glassEdge: std("#aab2bd", 0.4, 0.7),
  };
}
export const mats = () => (cache ??= makeMats());

let cellTex: THREE.CanvasTexture | null = null;
/** The face of a photovoltaic module: 6 × 10 dark-blue cells with silver busbars, a faint sheen, thin gaps. */
export function cellTexture(): THREE.CanvasTexture {
  if (cellTex) return cellTex;
  const W = 240;
  const H = 400;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b1230";
  g.fillRect(0, 0, W, H);
  const cols = 6;
  const rows = 10;
  const pad = 7;
  const cw = (W - pad * 2) / cols;
  const ch = (H - pad * 2) / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = pad + k * cw + 1.5;
      const y = pad + r * ch + 1.5;
      const grad = g.createLinearGradient(x, y, x + cw, y + ch);
      grad.addColorStop(0, "#27458f");
      grad.addColorStop(1, "#1a2f6e");
      g.fillStyle = grad;
      g.fillRect(x, y, cw - 3, ch - 3);
      g.fillStyle = "rgba(205,214,235,0.55)"; // busbars
      for (const f of [0.33, 0.66]) g.fillRect(x + (cw - 3) * f - 0.6, y, 1.2, ch - 3);
      g.fillStyle = "rgba(205,214,235,0.18)"; // fingers
      for (let i = 1; i < 9; i++) g.fillRect(x, y + ((ch - 3) / 9) * i, cw - 3, 0.5);
    }
  }
  const sheen = g.createLinearGradient(0, 0, W, H);
  sheen.addColorStop(0, "rgba(255,255,255,0.16)");
  sheen.addColorStop(0.45, "rgba(255,255,255,0)");
  g.fillStyle = sheen;
  g.fillRect(0, 0, W, H);
  cellTex = new THREE.CanvasTexture(c);
  cellTex.colorSpace = THREE.SRGBColorSpace;
  cellTex.anisotropy = 8;
  return cellTex;
}

let rippleTex: THREE.CanvasTexture | null = null;
/** Soft light bands for the water's surface; the caller scrolls it. */
export function rippleTexture(): THREE.CanvasTexture {
  if (rippleTex) return rippleTex;
  const N = 128;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2aa6c8";
  g.fillRect(0, 0, N, N);
  for (let i = 0; i < 26; i++) {
    const x = (i * 53) % N;
    const y = (i * 97) % N;
    const grad = g.createRadialGradient(x, y, 0, x, y, 14 + (i % 5) * 4);
    grad.addColorStop(0, "rgba(220,250,255,0.32)");
    grad.addColorStop(1, "rgba(220,250,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, N, N);
  }
  rippleTex = new THREE.CanvasTexture(c);
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  rippleTex.repeat.set(3, 2);
  rippleTex.colorSpace = THREE.SRGBColorSpace;
  return rippleTex;
}

const B = ({ p, s, m, shadows, r }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material; shadows: boolean; r?: [number, number, number] }) => (
  <mesh position={p} rotation={r} material={m} {...sh(shadows)}>
    <boxGeometry args={s} />
  </mesh>
);

// ── the pad ──────────────────────────────────────────────────────────────────────────────────────────────────
export function PadSlab({ shadows }: { shadows: boolean }) {
  const M = mats();
  const w = PAD.w;
  const d = PAD.d;
  return (
    <group>
      <B p={[0, -0.8, 0]} s={[w, 1.6, d]} m={M.concrete} shadows={shadows} />
      <B p={[0, 0.04, 0]} s={[w - 2.6, 0.12, d - 2.6]} m={M.concreteLight} shadows={shadows} />
      {/* the curb all round */}
      <B p={[0, 0.16, -d / 2 + 0.3]} s={[w, 0.34, 0.6]} m={M.curb} shadows={shadows} />
      <B p={[0, 0.16, d / 2 - 0.3]} s={[w, 0.34, 0.6]} m={M.curb} shadows={shadows} />
      <B p={[-w / 2 + 0.3, 0.16, 0]} s={[0.6, 0.34, d - 1.2]} m={M.curb} shadows={shadows} />
      <B p={[w / 2 - 0.3, 0.16, 0]} s={[0.6, 0.34, d - 1.2]} m={M.curb} shadows={shadows} />
      {/* expansion joints */}
      {[-9, 0, 9].map((x) => (
        <B key={x} p={[x, 0.11, 0]} s={[0.08, 0.02, d - 2.7]} m={M.joint} shadows={false} />
      ))}
      <B p={[0, 0.11, 0]} s={[w - 2.7, 0.02, 0.08]} m={M.joint} shadows={false} />
    </group>
  );
}

// ── solar panels ─────────────────────────────────────────────────────────────────────────────────────────────
/** One module on its own rack: aluminium frame, glass with cells, two legs on concrete feet. `glass` is the animated material. */
function Module({ glass, shadows }: { glass: THREE.Material; shadows: boolean }) {
  const M = mats();
  const { panelW: w, panelD: d, tilt } = YARD.pv;
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  const lift = 1.2;
  const front = lift - (d / 2) * sin; // height of the south (low) edge
  const back = lift + (d / 2) * sin;
  const legZ = (d / 2) * cos * 0.78;
  return (
    <group>
      <group position={[0, lift, 0]} rotation-x={tilt}>
        {/* glass: the cells on top, the frame colour on the other faces */}
        <mesh material={[M.glassEdge, M.glassEdge, glass, M.steelDark, M.glassEdge, M.glassEdge]} {...sh(shadows)}>
          <boxGeometry args={[w - 0.14, 0.08, d - 0.14]} />
        </mesh>
        {/* frame */}
        <B p={[0, 0, -d / 2 + 0.07]} s={[w, 0.16, 0.14]} m={M.alu} shadows={shadows} />
        <B p={[0, 0, d / 2 - 0.07]} s={[w, 0.16, 0.14]} m={M.alu} shadows={shadows} />
        <B p={[-w / 2 + 0.07, 0, 0]} s={[0.14, 0.16, d]} m={M.alu} shadows={shadows} />
        <B p={[w / 2 - 0.07, 0, 0]} s={[0.14, 0.16, d]} m={M.alu} shadows={shadows} />
        {/* the two rails under it */}
        <B p={[-w * 0.27, -0.16, 0]} s={[0.18, 0.18, d * 0.92]} m={M.steel} shadows={shadows} />
        <B p={[w * 0.27, -0.16, 0]} s={[0.18, 0.18, d * 0.92]} m={M.steel} shadows={shadows} />
        {/* junction box on the back */}
        <B p={[0, -0.14, -d / 2 + 0.55]} s={[0.5, 0.16, 0.34]} m={M.black} shadows={shadows} />
      </group>
      {/* legs: a tall one at the back, a short one at the front, each on a concrete foot */}
      {[-w * 0.27, w * 0.27].map((x) => (
        <group key={x}>
          <B p={[x, (back - 0.12) / 2, -legZ]} s={[0.16, back - 0.12, 0.16]} m={M.steel} shadows={shadows} />
          <B p={[x, (front - 0.12) / 2, legZ]} s={[0.16, front - 0.12, 0.16]} m={M.steel} shadows={shadows} />
          <B p={[x, 0.1, -legZ]} s={[0.5, 0.2, 0.5]} m={M.concrete} shadows={shadows} />
          <B p={[x, 0.1, legZ]} s={[0.5, 0.2, 0.5]} m={M.concrete} shadows={shadows} />
        </group>
      ))}
    </group>
  );
}

export function SolarArray({ glass, shadows }: { glass: THREE.Material; shadows: boolean }) {
  const p = YARD.pv;
  return (
    <>
      {p.rows.map((z) =>
        Array.from({ length: p.perRow }, (_, i) => (
          <group key={`${z}-${i}`} position={[p.x - (p.perRow * (p.panelW + 0.2)) / 2 + (i + 0.5) * (p.panelW + 0.2), 0, z]}>
            <Module glass={glass} shadows={shadows} />
          </group>
        )),
      )}
    </>
  );
}

// ── the inverter cabinet, or the diesel generator that replaces the panels ─────────────────────────────────────
export function Cabinet({ led, shadows }: { led: RefObject<THREE.MeshBasicMaterial>; shadows: boolean }) {
  const M = mats();
  const { w, d, h } = YARD.cabinet;
  return (
    <group>
      <B p={[0, 0.12, 0]} s={[w + 0.4, 0.24, d + 0.4]} m={M.concrete} shadows={shadows} />
      <B p={[0, 0.24 + h / 2, 0]} s={[w, h, d]} m={M.cabinet} shadows={shadows} />
      <B p={[0, 0.24 + h + 0.1, 0]} s={[w + 0.3, 0.2, d + 0.3]} m={M.cabinetDark} shadows={shadows} />
      {/* the door on the south face, with its handle and a vent grille */}
      <B p={[0, 0.24 + h / 2, d / 2 + 0.03]} s={[w * 0.82, h * 0.84, 0.06]} m={M.cabinetDark} shadows={false} />
      <B p={[w * 0.3, 0.24 + h / 2, d / 2 + 0.09]} s={[0.1, 0.7, 0.08]} m={M.steelDark} shadows={false} />
      {[0, 1, 2, 3, 4].map((i) => (
        <B key={i} p={[-w * 0.22, 0.24 + h * 0.3 + i * 0.13, d / 2 + 0.08]} s={[w * 0.4, 0.05, 0.06]} m={M.steelDark} shadows={false} />
      ))}
      {/* the little screen and its status light (green when pumping, amber in sun, grey when idle) */}
      <B p={[-w * 0.22, 0.24 + h * 0.78, d / 2 + 0.08]} s={[0.9, 0.5, 0.05]} m={M.black} shadows={false} />
      <mesh position={[w * 0.2, 0.24 + h * 0.78, d / 2 + 0.1]}>
        <sphereGeometry args={[0.14, 10, 8]} />
        <meshBasicMaterial ref={led} color="#8a909a" toneMapped={false} />
      </mesh>
      {/* conduit down the east side */}
      <mesh position={[w / 2 + 0.25, 1.4, 0]} material={M.pipe} {...sh(shadows)}>
        <cylinderGeometry args={[0.14, 0.14, 2.8, 10]} />
      </mesh>
    </group>
  );
}

export function Generator({ led, shadows }: { led: RefObject<THREE.MeshBasicMaterial>; shadows: boolean }) {
  const M = mats();
  return (
    <group>
      {/* skid */}
      <B p={[0, 0.2, 1.3]} s={[7.2, 0.3, 0.42]} m={M.steelDark} shadows={shadows} />
      <B p={[0, 0.2, -1.3]} s={[7.2, 0.3, 0.42]} m={M.steelDark} shadows={shadows} />
      <B p={[0, 0.2, 0]} s={[7, 0.2, 2.6]} m={M.steelDark} shadows={shadows} />
      {/* enclosure */}
      <RoundedBox args={[6, 3.1, 3.1]} radius={0.22} smoothness={3} position={[0, 2.05, 0]} material={M.genBody} {...sh(shadows)} />
      <B p={[0, 1.15, 0]} s={[6.06, 0.5, 3.16]} m={M.genBand} shadows={shadows} />
      {/* louvres on the south face */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <B key={i} p={[-1.1, 1.8 + i * 0.22, 1.58]} s={[3.2, 0.07, 0.1]} m={M.genBand} shadows={false} />
      ))}
      {/* control panel at the east end */}
      <B p={[3.05, 2.4, 0]} s={[0.12, 1.2, 1.5]} m={M.genBand} shadows={false} />
      <B p={[3.13, 2.6, 0]} s={[0.05, 0.5, 0.9]} m={M.black} shadows={false} />
      <mesh position={[3.16, 2.05, 0.4]}>
        <sphereGeometry args={[0.15, 10, 8]} />
        <meshBasicMaterial ref={led} color="#8a909a" toneMapped={false} />
      </mesh>
      {/* exhaust: a muffler on the roof and a stack with a rain cap */}
      <mesh position={[-1.5, 4.0, 0.2]} rotation-z={Math.PI / 2} material={M.steel} {...sh(shadows)}>
        <cylinderGeometry args={[0.46, 0.46, 1.7, 14]} />
      </mesh>
      <mesh position={[-2.2, 5.2, 0.2]} material={M.steelDark} {...sh(shadows)}>
        <cylinderGeometry args={[0.2, 0.2, 2.4, 10]} />
      </mesh>
      <mesh position={[-2.2, 6.5, 0.2]} material={M.steelDark} {...sh(shadows)}>
        <coneGeometry args={[0.45, 0.35, 10]} />
      </mesh>
      {/* a lifting eye */}
      <mesh position={[1.4, 3.75, 0]} rotation-y={Math.PI / 2} material={M.steel}>
        <torusGeometry args={[0.28, 0.07, 6, 12]} />
      </mesh>
    </group>
  );
}

// ── the pump house ────────────────────────────────────────────────────────────────────────────────────────────
function roofGeometry(w: number, d: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-d / 2 - 0.5, 0);
  s.lineTo(d / 2 + 0.5, 0);
  s.lineTo(0, 1.7);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w + 1.0, bevelEnabled: false });
  g.translate(0, 0, -(w + 1.0) / 2);
  g.rotateY(Math.PI / 2); // the ridge runs along x
  return g;
}

export function PumpHouse({ rotor, shadows }: { rotor: RefObject<THREE.Group>; shadows: boolean }) {
  const M = mats();
  const { w, d, h } = YARD.pump;
  const roof = useMemo(() => roofGeometry(w, d), [w, d]);
  return (
    <group>
      <B p={[0, 0.15, 0]} s={[w + 0.5, 0.3, d + 0.5]} m={M.concrete} shadows={shadows} />
      <B p={[0, 0.3 + h / 2, 0]} s={[w, h, d]} m={M.plaster} shadows={shadows} />
      <mesh geometry={roof} position={[0, 0.3 + h, 0]} material={M.clay} {...sh(shadows)} />
      <B p={[0, 0.3 + h + 1.72, 0]} s={[w + 1.1, 0.14, 0.34]} m={M.clayDark} shadows={shadows} />
      {/* door and window on the south face */}
      <B p={[-1.7, 0.3 + 1.3, d / 2 + 0.04]} s={[1.5, 2.6, 0.1]} m={M.woodDark} shadows={false} />
      <B p={[-1.7, 0.3 + 1.3, d / 2 + 0.11]} s={[1.2, 2.3, 0.05]} m={M.wood} shadows={false} />
      <B p={[1.7, 0.3 + 2.4, d / 2 + 0.04]} s={[1.5, 1.1, 0.1]} m={M.woodDark} shadows={false} />
      <B p={[1.7, 0.3 + 2.4, d / 2 + 0.08]} s={[1.2, 0.8, 0.06]} m={mats().waterDeep} shadows={false} />
      <B p={[1.7, 0.3 + 1.78, d / 2 + 0.16]} s={[1.7, 0.12, 0.26]} m={M.curb} shadows={false} />
      {/* the cooling fan on the west face: it spins when the pump runs */}
      <group position={[-w / 2 - 0.06, 0.3 + 2.7, 0]}>
        <mesh rotation-y={Math.PI / 2} material={M.steelDark}>
          <torusGeometry args={[0.9, 0.1, 8, 20]} />
        </mesh>
        <group ref={rotor}>
          {[0, 1, 2, 3].map((i) => (
            <B key={i} p={[-0.05, Math.sin((i * Math.PI) / 2) * 0.42, Math.cos((i * Math.PI) / 2) * 0.42]} s={[0.06, i % 2 ? 0.8 : 0.16, i % 2 ? 0.16 : 0.8]} m={M.steel} shadows={false} />
          ))}
          <mesh rotation-z={Math.PI / 2} position={[-0.08, 0, 0]} material={M.red}>
            <cylinderGeometry args={[0.14, 0.14, 0.12, 10]} />
          </mesh>
        </group>
      </group>
      {/* the outgoing pipe and its valve wheel, on the west face, low */}
      <mesh position={[-w / 2 - 0.9, 0.3 + 0.7, 0]} rotation-z={Math.PI / 2} material={M.pipe} {...sh(shadows)}>
        <cylinderGeometry args={[0.3, 0.3, 1.8, 12]} />
      </mesh>
      <mesh position={[-w / 2 - 0.9, 0.3 + 1.25, 0]} material={M.pipe}>
        <cylinderGeometry args={[0.12, 0.12, 0.5, 8]} />
      </mesh>
      <mesh position={[-w / 2 - 0.9, 0.3 + 1.55, 0]} rotation-x={Math.PI / 2} material={M.red}>
        <torusGeometry args={[0.3, 0.06, 6, 14]} />
      </mesh>
    </group>
  );
}

// ── the well ──────────────────────────────────────────────────────────────────────────────────────────────────
export function Well({ shadows }: { shadows: boolean }) {
  const M = mats();
  const courses = 6;
  return (
    <group>
      {Array.from({ length: courses }, (_, i) => (
        <mesh key={i} position={[0, 0.12 + i * 0.25, 0]} rotation-y={i * 0.4} material={i % 2 ? M.stoneB : M.stone} {...sh(shadows)}>
          <cylinderGeometry args={[1.42 - (i % 2) * 0.03, 1.46, 0.25, 16]} />
        </mesh>
      ))}
      <mesh position={[0, 1.68, 0]} material={M.stoneRim} {...sh(shadows)}>
        <torusGeometry args={[1.4, 0.16, 8, 20]} />
      </mesh>
      <mesh position={[0, 1.4, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.25, 18]} />
        <meshStandardMaterial color="#0f2f45" roughness={0.2} metalness={0.3} />
      </mesh>
      {/* a wooden frame with a windlass, a little roof, a rope and a bucket */}
      {[-1.5, 1.5].map((z) => (
        <B key={z} p={[0, 2.4, z]} s={[0.2, 2.8, 0.2]} m={M.wood} shadows={shadows} />
      ))}
      <mesh position={[0, 3.2, 0]} rotation-x={Math.PI / 2} material={M.woodDark} {...sh(shadows)}>
        <cylinderGeometry args={[0.2, 0.2, 3.2, 10]} />
      </mesh>
      <B p={[0, 3.95, -0.9]} s={[2.2, 0.12, 2.2]} m={M.clay} shadows={shadows} r={[0.5, 0, 0]} />
      <B p={[0, 3.95, 0.9]} s={[2.2, 0.12, 2.2]} m={M.clay} shadows={shadows} r={[-0.5, 0, 0]} />
      <mesh position={[0, 2.4, 0.3]} material={M.woodDark}>
        <cylinderGeometry args={[0.025, 0.025, 1.5, 5]} />
      </mesh>
      <mesh position={[0, 1.6, 0.3]} material={M.steel} {...sh(shadows)}>
        <cylinderGeometry args={[0.3, 0.22, 0.4, 10]} />
      </mesh>
    </group>
  );
}

// ── the storage basin, with water that rises and falls ───────────────────────────────────────────────────────
export function Basin({ water, surface, shadows }: { water: RefObject<THREE.Mesh>; surface: RefObject<THREE.Mesh>; shadows: boolean }) {
  const M = mats();
  const { w, d, wall } = YARD.basin;
  const t = 0.7; // wall thickness
  const ripple = useMemo(() => rippleTexture(), []);
  const surfaceMat = useMemo(() => new THREE.MeshStandardMaterial({ map: ripple, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.96 }), [ripple]);
  return (
    <group>
      <B p={[0, 0.06, 0]} s={[w, 0.12, d]} m={M.concrete} shadows={shadows} />
      {/* four thick walls and a coping slab on each */}
      <B p={[0, wall / 2, -d / 2 + t / 2]} s={[w, wall, t]} m={M.concreteLight} shadows={shadows} />
      <B p={[0, wall / 2, d / 2 - t / 2]} s={[w, wall, t]} m={M.concreteLight} shadows={shadows} />
      <B p={[-w / 2 + t / 2, wall / 2, 0]} s={[t, wall, d - 2 * t]} m={M.concreteLight} shadows={shadows} />
      <B p={[w / 2 - t / 2, wall / 2, 0]} s={[t, wall, d - 2 * t]} m={M.concreteLight} shadows={shadows} />
      <B p={[0, wall + 0.08, -d / 2 + 0.45]} s={[w + 0.3, 0.16, 0.9]} m={M.stoneRim} shadows={shadows} />
      <B p={[0, wall + 0.08, d / 2 - 0.45]} s={[w + 0.3, 0.16, 0.9]} m={M.stoneRim} shadows={shadows} />
      <B p={[-w / 2 + 0.45, wall + 0.08, 0]} s={[0.9, 0.16, d - 1.2]} m={M.stoneRim} shadows={shadows} />
      <B p={[w / 2 - 0.45, wall + 0.08, 0]} s={[0.9, 0.16, d - 1.2]} m={M.stoneRim} shadows={shadows} />
      {/* the water: a body whose height follows the level, and a rippling surface on top of it */}
      <mesh ref={water} position={[0, 0.13, 0]} scale={[1, 0.001, 1]} material={M.waterDeep}>
        <boxGeometry args={[w - 2 * t, 1, d - 2 * t]} />
      </mesh>
      <mesh ref={surface} position={[0, 0.14, 0]} rotation-x={-Math.PI / 2} material={surfaceMat} visible={false}>
        <planeGeometry args={[w - 2 * t - 0.05, d - 2 * t - 0.05]} />
      </mesh>
      {/* a ladder down into it on the north wall */}
      {[-1.6, 1.6].map((x) => (
        <B key={x} p={[x, wall - 0.4, -d / 2 + t + 0.08]} s={[0.1, 1.6, 0.1]} m={M.steel} shadows={false} />
      ))}
      {[0, 1, 2].map((i) => (
        <B key={i} p={[0, wall - 0.9 + i * 0.5, -d / 2 + t + 0.08]} s={[3.2, 0.08, 0.08]} m={M.steel} shadows={false} />
      ))}
    </group>
  );
}

// ── little olive trees around the pad's edge ─────────────────────────────────────────────────────────────────
export function Tree({ at, scale = 1, shadows }: { at: [number, number, number]; scale?: number; shadows: boolean }) {
  const M = mats();
  return (
    <group position={at} scale={scale}>
      <mesh position={[0, 0.9, 0]} material={M.trunk} {...sh(shadows)}>
        <cylinderGeometry args={[0.16, 0.26, 1.8, 6]} />
      </mesh>
      {[
        [0, 2.5, 0, 1.15],
        [0.7, 2.1, 0.3, 0.8],
        [-0.6, 2.2, -0.4, 0.85],
        [0.1, 3.1, -0.2, 0.7],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} material={M.foliage} {...sh(shadows)}>
          <icosahedronGeometry args={[r, 1]} />
        </mesh>
      ))}
    </group>
  );
}
