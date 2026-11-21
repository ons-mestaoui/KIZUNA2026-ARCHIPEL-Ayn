import { describe, expect, it } from "vitest";
import { sceneBox, squareFromArea } from "./geo";
import { esriTileUrl, latToY, lonToX, metresPerPixel, terrariumHeight, tileCount, tileGrid, worldPx, xToLon, yToLat, zoomFor } from "./tiles";

describe("web mercator", () => {
  it("round-trips a position", () => {
    for (const z of [12, 17, 18]) {
      const lon = 10.573;
      const lat = 36.687;
      expect(xToLon(lonToX(lon, z), z)).toBeCloseTo(lon, 9);
      expect(yToLat(latToY(lat, z), z)).toBeCloseTo(lat, 9);
    }
  });
  it("matches the tile the real service served for the demo orchard at zoom 18", () => {
    // verified against server.arcgisonline.com: this tile shows the citrus block (the 'alignment gate' photos)
    const x = Math.floor(lonToX(10.573, 18) / 256);
    const y = Math.floor(latToY(36.687, 18) / 256);
    expect([x, y]).toEqual([138771, 102319]);
    expect(esriTileUrl(18, x, y)).toBe("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/18/102319/138771");
  });
  it("the world is 256 px at zoom 0 and doubles each zoom", () => {
    expect(worldPx(0)).toBe(256);
    expect(worldPx(17)).toBe(256 * 131_072);
  });
  it("ground resolution at 36.7°N: about 0.96 m per pixel at zoom 17", () => {
    expect(metresPerPixel(36.687, 17)).toBeCloseTo(0.957, 2);
    expect(metresPerPixel(36.687, 18)).toBeCloseTo(0.4786, 3);
  });
});

describe("tiles covering a field's scene", () => {
  const { box } = sceneBox(squareFromArea([10.573, 36.687], 1)); // 500 m
  it("a 500 m scene at zoom 18 is about 1050 px wide: five or six tiles each way", () => {
    const g = tileGrid(box, 18);
    expect(g.x1 - g.x0).toBeGreaterThan(1000);
    expect(g.x1 - g.x0).toBeLessThan(1100);
    expect(Math.abs(g.x1 - g.x0 - (g.y1 - g.y0))).toBeLessThan(2); // square on the ground, square in the picture
    expect(tileCount(g)).toBeGreaterThanOrEqual(25);
    expect(tileCount(g)).toBeLessThanOrEqual(36);
  });
  it("the tiles really cover the box", () => {
    const g = tileGrid(box, 17);
    expect(g.tx0 * 256).toBeLessThanOrEqual(g.x0);
    expect((g.tx1 + 1) * 256).toBeGreaterThanOrEqual(g.x1);
    expect(g.ty0 * 256).toBeLessThanOrEqual(g.y0);
    expect((g.ty1 + 1) * 256).toBeGreaterThanOrEqual(g.y1);
  });
  it("picks the highest zoom that keeps the picture within 2048 px", () => {
    expect(zoomFor(box)).toBe(18); // 500 m: ~1050 px at 18
    const medium = sceneBox(squareFromArea([10.573, 36.687], 20)).box; // ~1 km
    expect(zoomFor(medium)).toBe(17);
    const big = sceneBox(squareFromArea([10.573, 36.687], 100)).box; // 2.2 km
    expect(zoomFor(big)).toBe(16);
    const huge = sceneBox(squareFromArea([10.573, 36.687], 500)).box; // 3 km
    expect(zoomFor(huge)).toBe(16);
    expect(zoomFor(huge, 2048, 18, 17)).toBe(17); // never below the floor
  });
});

describe("terrarium heights", () => {
  it("decodes metres above sea level", () => {
    expect(terrariumHeight(128, 0, 0)).toBe(0); // sea level
    expect(terrariumHeight(128, 42, 128)).toBeCloseTo(42.5, 6);
    expect(terrariumHeight(127, 255, 0)).toBe(-1);
  });
});
