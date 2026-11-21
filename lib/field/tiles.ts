import type { GeoBox } from "./types";

// Web-Mercator "slippy map" tiles: the maths for stitching a photo of a field out of tiles, and for reading heights
// from terrain tiles. Pure functions: the browser, the snapshot script and the tests share them.

export const TILE = 256;
const EQUATOR_MPP = 156_543.03392; // metres per pixel at zoom 0 on the equator

export const worldPx = (z: number) => TILE * 2 ** z;
export const lonToX = (lon: number, z: number) => ((lon + 180) / 360) * worldPx(z);
export const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * worldPx(z);
};
export const xToLon = (x: number, z: number) => (x / worldPx(z)) * 360 - 180;
export const yToLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldPx(z)))) * 180) / Math.PI;

export const metresPerPixel = (lat: number, z: number) => (EQUATOR_MPP * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

export interface TileGrid {
  z: number;
  /** the box in world pixels at this zoom (fractional) */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** the tiles that cover it, inclusive */
  tx0: number;
  tx1: number;
  ty0: number;
  ty1: number;
}

export function tileGrid(box: GeoBox, z: number): TileGrid {
  const x0 = lonToX(box.west, z);
  const x1 = lonToX(box.east, z);
  const y0 = latToY(box.north, z); // north is the smaller y
  const y1 = latToY(box.south, z);
  return { z, x0, y0, x1, y1, tx0: Math.floor(x0 / TILE), tx1: Math.floor(x1 / TILE), ty0: Math.floor(y0 / TILE), ty1: Math.floor(y1 / TILE) };
}

export const tileCount = (g: TileGrid) => (g.tx1 - g.tx0 + 1) * (g.ty1 - g.ty0 + 1);

/** The highest zoom at which a picture of the box is at most `maxPx` wide, between `floor` and `cap`. */
export function zoomFor(box: GeoBox, maxPx = 2048, cap = 18, floor = 14): number {
  const lat = (box.south + box.north) / 2;
  const widthM = (box.east - box.west) * 111_320 * Math.cos((lat * Math.PI) / 180);
  const z = Math.floor(Math.log2((EQUATOR_MPP * Math.cos((lat * Math.PI) / 180) * maxPx) / widthM));
  return Math.max(floor, Math.min(cap, z));
}

export const esriTileUrl = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
export const terrariumUrl = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

/** Terrarium tiles encode metres above sea level in the three colour channels. */
export const terrariumHeight = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32_768;
