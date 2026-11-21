import { TILE, latToY, lonToX, terrariumHeight } from "./tiles";
import type { GeoBox } from "./types";

// Heights for the scene box from open terrain tiles (AWS "Terrarium": metres above sea level packed in R, G, B).
// The tiles are fetched and decoded by whoever calls this (the browser with a canvas, the snapshot script with sharp);
// the sampling itself is shared.

export interface PixelTile {
  width: number;
  height: number;
  /** row-major colour bytes */
  data: ArrayLike<number>;
  channels: 3 | 4;
}

export const tileKey = (x: number, y: number) => `${x}/${y}`;

/** Every tile of zoom `z` that the box touches. */
export function terrainTilesFor(box: GeoBox, z: number): { x: number; y: number }[] {
  const x0 = Math.floor(lonToX(box.west, z) / TILE);
  const x1 = Math.floor(lonToX(box.east, z) / TILE);
  const y0 = Math.floor(latToY(box.north, z) / TILE);
  const y1 = Math.floor(latToY(box.south, z) / TILE);
  const out: { x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y });
  return out;
}

/**
 * A w × h grid of heights in metres, row 0 = the north edge, with grid points ON the box edges (so a mesh of w − 1
 * cells covers the box exactly). Where a tile is missing the grid takes the average of the rest.
 */
export function heightGrid(box: GeoBox, w: number, h: number, z: number, tiles: Map<string, PixelTile>): Float32Array {
  const out = new Float32Array(w * h);
  let sum = 0;
  let n = 0;
  for (let j = 0; j < h; j++) {
    const lat = box.north - (j / (h - 1)) * (box.north - box.south);
    const Y = latToY(lat, z);
    for (let i = 0; i < w; i++) {
      const lon = box.west + (i / (w - 1)) * (box.east - box.west);
      const X = lonToX(lon, z);
      const tx = Math.floor(X / TILE);
      const ty = Math.floor(Y / TILE);
      const tile = tiles.get(tileKey(tx, ty));
      if (!tile) {
        out[j * w + i] = NaN;
        continue;
      }
      const px = Math.min(tile.width - 1, Math.max(0, X - tx * TILE - 0.5));
      const py = Math.min(tile.height - 1, Math.max(0, Y - ty * TILE - 0.5));
      const i0 = Math.floor(px);
      const j0 = Math.floor(py);
      const i1 = Math.min(tile.width - 1, i0 + 1);
      const j1 = Math.min(tile.height - 1, j0 + 1);
      const at = (a: number, b: number) => {
        const o = (b * tile.width + a) * tile.channels;
        return terrariumHeight(tile.data[o], tile.data[o + 1], tile.data[o + 2]);
      };
      const fx = px - i0;
      const fy = py - j0;
      const v = (at(i0, j0) * (1 - fx) + at(i1, j0) * fx) * (1 - fy) + (at(i0, j1) * (1 - fx) + at(i1, j1) * fx) * fy;
      out[j * w + i] = v;
      sum += v;
      n++;
    }
  }
  const fill = n ? sum / n : 0;
  for (let p = 0; p < out.length; p++) if (Number.isNaN(out[p])) out[p] = fill;
  return out;
}

/** The zoom at which one terrain tile pixel is about `targetM` metres, between 10 and 15 (the tiles end at 15). */
export function terrainZoom(box: GeoBox, targetM = 8): number {
  const lat = (box.south + box.north) / 2;
  const mpp0 = 156_543.03392 * Math.cos((lat * Math.PI) / 180);
  return Math.max(10, Math.min(15, Math.round(Math.log2(mpp0 / targetM))));
}

/** Metres, to decimetres in a signed 16-bit integer: base64 of the little-endian bytes. */
export function encodeHeights(heights: ArrayLike<number>): string {
  const ints = new Int16Array(heights.length);
  for (let i = 0; i < heights.length; i++) ints[i] = Math.max(-32768, Math.min(32767, Math.round(heights[i] * 10)));
  const bytes = new Uint8Array(ints.buffer);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function decodeHeights(b64: string): Float32Array {
  let bytes: Uint8Array;
  if (typeof Buffer !== "undefined") {
    bytes = new Uint8Array(Buffer.from(b64, "base64"));
  } else {
    const s = atob(b64);
    bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  }
  const ints = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const out = new Float32Array(ints.length);
  for (let i = 0; i < ints.length; i++) out[i] = ints[i] / 10;
  return out;
}
