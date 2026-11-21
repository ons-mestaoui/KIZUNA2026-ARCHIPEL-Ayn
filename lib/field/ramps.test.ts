import { describe, expect, it } from "vitest";
import { GREENNESS, LEAF_WATER, ZONE_STRONGER, ZONE_WEAKER, greennessColor, leafWaterColor, lightness, oklchToRgb, rgbToOklab, toHex, zoneColor, type RGB } from "./ramps";

// Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear RGB
const PROTAN = [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]];
const DEUTAN = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]];
const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const enc = (v: number) => { const c = Math.min(1, Math.max(0, v)); return (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255; };
const simulate = (m: number[][], c: RGB): RGB => { const l = c.map(lin); return m.map((row) => enc(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])) as RGB; };
const dE = (a: RGB, b: RGB) => { const A = rgbToOklab(a), B = rgbToOklab(b); return 100 * Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };

describe("colour maths", () => {
  it("OKLCH white and black land on sRGB white and black", () => {
    expect(oklchToRgb([1, 0, 0])).toEqual([255, 255, 255]);
    expect(oklchToRgb([0, 0, 0])).toEqual([0, 0, 0]);
    expect(toHex([227, 162, 26])).toBe("#e3a21a");
  });
  it("round-trips lightness", () => {
    for (const L of [0.3, 0.55, 0.8]) expect(lightness(oklchToRgb([L, 0.08, 140]))).toBeCloseTo(L, 1);
  });
});

describe("sequential scales go from light to dark in even steps", () => {
  const steps = (ramp: { stops: RGB[] }) => ramp.stops.slice(1).map((c, i) => lightness(ramp.stops[i]) - lightness(c));
  for (const [name, ramp] of [["greenness", GREENNESS], ["leaf water", LEAF_WATER]] as const) {
    it(`${name}: lightness falls at every stop`, () => {
      steps(ramp).forEach((d) => expect(d).toBeGreaterThan(0.06));
    });
    it(`${name}: even steps: none is more than 1.3 times another (no plateau, no cliff)`, () => {
      const s = steps(ramp);
      expect(Math.max(...s) / Math.min(...s)).toBeLessThan(1.3);
    });
    it(`${name}: the 256-colour table is monotone too`, () => {
      for (let i = 1; i < 256; i++) expect(lightness(ramp.lut[i])).toBeLessThanOrEqual(lightness(ramp.lut[i - 1]) + 0.002);
    });
  }
  it("the end of each scale is dark enough to read on a pale photo and the start is pale", () => {
    expect(lightness(GREENNESS.stops[0])).toBeGreaterThan(0.9);
    expect(lightness(GREENNESS.stops.at(-1)!)).toBeLessThan(0.4);
    expect(lightness(LEAF_WATER.stops.at(-1)!)).toBeLessThan(0.4);
  });
  it("maps NDVI and NDMI onto the scales and clamps outside them", () => {
    expect(greennessColor(-0.5)).toEqual(GREENNESS.lut[0]);
    expect(greennessColor(1.2)).toEqual(GREENNESS.lut[255]);
    expect(lightness(greennessColor(0.3))).toBeGreaterThan(lightness(greennessColor(0.7)));
    expect(lightness(leafWaterColor(0.0))).toBeGreaterThan(lightness(leafWaterColor(0.3)));
  });
});

describe("the diverging zone scale", () => {
  it("starts from one neutral grey for both arms", () => {
    expect(zoneColor(0)).toEqual(ZONE_WEAKER.lut[0]);
    expect(zoneColor(0)).toEqual(ZONE_STRONGER.lut[0]);
    const [r, g, b] = zoneColor(0);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(3); // grey
  });
  it("each arm gets darker and more saturated away from the centre, in equal-ish steps", () => {
    for (const arm of [ZONE_WEAKER, ZONE_STRONGER]) {
      const L = arm.stops.map(lightness);
      const d = L.slice(1).map((v, i) => L[i] - v);
      d.forEach((x) => expect(x).toBeGreaterThan(0.04));
      expect(Math.max(...d) / Math.min(...d)).toBeLessThan(1.3);
    }
  });
  it("the two arms are warm vs cool: amber on one side, teal on the other", () => {
    const [wr, , wb] = zoneColor(-1);
    const [sr, , sb] = zoneColor(1);
    expect(wr).toBeGreaterThan(wb + 60); // orange
    expect(sb).toBeGreaterThan(sr + 20); // teal/blue-green
  });
  it("weaker, similar and stronger stay distinguishable for red-green colour-blind readers", () => {
    const trio = [zoneColor(-0.8), zoneColor(0), zoneColor(0.8)];
    for (const m of [PROTAN, DEUTAN]) {
      const s = trio.map((c) => simulate(m, c));
      expect(dE(s[0], s[1])).toBeGreaterThan(10);
      expect(dE(s[1], s[2])).toBeGreaterThan(10);
      expect(dE(s[0], s[2])).toBeGreaterThan(12);
    }
    // and for normal vision
    expect(dE(trio[0], trio[1])).toBeGreaterThan(15);
    expect(dE(trio[1], trio[2])).toBeGreaterThan(15);
  });
  it("clamps scores beyond ±1", () => {
    expect(zoneColor(-3)).toEqual(ZONE_WEAKER.lut[255]);
    expect(zoneColor(3)).toEqual(ZONE_STRONGER.lut[255]);
  });
});
