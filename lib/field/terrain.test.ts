import { describe, expect, it } from "vitest";
import { sceneBox, squareFromArea } from "./geo";
import { type PixelTile, decodeHeights, encodeHeights, heightGrid, terrainTilesFor, terrainZoom, tileKey } from "./terrain";
import { TILE, lonToX } from "./tiles";

const { box } = sceneBox(squareFromArea([10.569, 36.689], 1)); // 500 m
const Z = 14;

/** The terrain tile at (tx, ty) whose height is `f(world pixel x, world pixel y)`, packed the way Terrarium does. */
function tile(tx: number, ty: number, f: (x: number, y: number) => number): PixelTile {
  const data = new Uint8Array(TILE * TILE * 3);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const v = f(tx * TILE + x, ty * TILE + y) + 32768;
      const o = (y * TILE + x) * 3;
      data[o] = Math.floor(v / 256);
      data[o + 1] = Math.floor(v % 256);
      data[o + 2] = Math.floor((v - Math.floor(v)) * 256);
    }
  }
  return { width: TILE, height: TILE, data, channels: 3 };
}

describe("terrain tiles", () => {
  it("lists the tiles the box touches", () => {
    const tiles = terrainTilesFor(box, Z);
    expect(tiles.length).toBeGreaterThanOrEqual(1);
    expect(tiles.length).toBeLessThanOrEqual(4);
    expect(Math.floor(lonToX(box.west, Z) / TILE)).toBe(Math.min(...tiles.map((t) => t.x)));
  });
  it("picks a zoom of about 8 m a pixel, within the tiles' range", () => {
    expect(terrainZoom(box)).toBe(14); // 156543 × cos(36.7°) / 2^14 = 7.7 m
    expect(terrainZoom(box, 40)).toBe(12);
    expect(terrainZoom(box, 0.1)).toBe(15);
  });
});

describe("heightGrid", () => {
  const tiles = new Map<string, PixelTile>();
  for (const t of terrainTilesFor(box, Z)) tiles.set(tileKey(t.x, t.y), tile(t.x, t.y, (x) => 100 + x * 0.5)); // one continuous ramp: 0.5 m per pixel eastward

  it("reads a ramp: rising to the east, level from north to south", () => {
    const g = heightGrid(box, 17, 17, Z, tiles);
    expect(g[8 * 17 + 16]).toBeGreaterThan(g[8 * 17 + 0]);
    expect(g[0 * 17 + 8]).toBeCloseTo(g[16 * 17 + 8], 1);
  });
  it("puts grid points on the box edges: row 0 is the north edge", () => {
    const m = new Map<string, PixelTile>();
    for (const t of terrainTilesFor(box, Z)) m.set(tileKey(t.x, t.y), tile(t.x, t.y, (_x, y) => 100 + y)); // height = world pixel row: rises toward the south
    const g = heightGrid(box, 9, 9, Z, m);
    expect(g[8 * 9 + 4]).toBeGreaterThan(g[0 * 9 + 4]); // south is higher than north
  });
  it("matches the metres: 0.5 m per 7.7 m pixel across a 500 m box (65 pixels) is about 32 m of rise", () => {
    const g = heightGrid(box, 33, 33, Z, tiles);
    const rise = g[16 * 33 + 32] - g[16 * 33];
    expect(rise).toBeGreaterThan(29);
    expect(rise).toBeLessThan(36);
  });
  it("fills a missing tile with the average of the rest rather than a hole", () => {
    const some = new Map(tiles);
    const first = terrainTilesFor(box, Z)[0];
    if (terrainTilesFor(box, Z).length > 1) some.delete(tileKey(first.x, first.y));
    const g = heightGrid(box, 9, 9, Z, some);
    for (const v of g) expect(Number.isFinite(v)).toBe(true);
  });
  it("with no tiles at all it is flat at 0", () => {
    expect(Array.from(heightGrid(box, 3, 3, Z, new Map()))).toEqual(new Array(9).fill(0));
  });
});

describe("height encoding", () => {
  it("round-trips to a decimetre, including below sea level", () => {
    const h = [0, 12.34, 55.8, -3.2, 1234.5];
    const back = decodeHeights(encodeHeights(h));
    h.forEach((v, i) => expect(back[i]).toBeCloseTo(v, 1));
  });
  it("is compact: 2 bytes a point", () => {
    expect(Buffer.from(encodeHeights(new Float32Array(65 * 65)), "base64")).toHaveLength(65 * 65 * 2);
  });
});
