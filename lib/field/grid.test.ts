import { describe, expect, it } from "vitest";
import { NDMI_RANGE, NDVI_RANGE, NODATA, base64ToBytes, bytesToBase64, decodeGrid, dequantize, encodeGrid, quantize } from "./grid";

describe("grid encoding", () => {
  it("round-trips values to within one quantization step", () => {
    const vals = [-0.2, 0, 0.123, 0.5, 0.731, 0.999, 1.0];
    const back = decodeGrid(encodeGrid(vals, NDVI_RANGE), NDVI_RANGE);
    vals.forEach((v, i) => expect(Math.abs(back[i] - v)).toBeLessThanOrEqual(1.2 / 254 / 2 + 1e-6));
  });

  it("keeps NDMI's own range, including negative values", () => {
    const back = decodeGrid(encodeGrid([-0.3, 0, 0.25], NDMI_RANGE), NDMI_RANGE);
    expect(back[0]).toBeCloseTo(-0.3, 2);
    expect(back[1]).toBeCloseTo(0, 2);
    expect(back[2]).toBeCloseTo(0.25, 2);
  });

  it("marks missing readings as 255 and brings them back as NaN", () => {
    expect(quantize(NaN, NDVI_RANGE)).toBe(NODATA);
    expect(quantize(Infinity, NDVI_RANGE)).toBe(NODATA);
    const back = decodeGrid(encodeGrid([0.5, NaN, 0.6], NDVI_RANGE), NDVI_RANGE);
    expect(Number.isNaN(back[1])).toBe(true);
    expect(back[0]).toBeCloseTo(0.5, 2);
  });

  it("clamps values outside the range instead of wrapping into 'no data'", () => {
    expect(quantize(2, NDVI_RANGE)).toBe(254);
    expect(quantize(-1, NDVI_RANGE)).toBe(0);
    expect(dequantize(254, NDVI_RANGE)).toBeCloseTo(1, 6);
  });

  it("base64 round-trips arbitrary bytes, including 255 and 0", () => {
    const bytes = new Uint8Array(70_000).map((_, i) => (i * 7) % 256);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });
});
