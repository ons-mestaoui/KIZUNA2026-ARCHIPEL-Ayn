// Compact pixel grids for the API payload: one byte per pixel, base64. Index values are quantized to 0–254 over a
// fixed range and 255 means "no reading" (cloud, shadow, outside the picture). A 100 × 100 scene is ~13 KB of text
// per layer, small enough to ship two passes in one JSON response.

export const NODATA = 255;
export type Range = readonly [number, number];

/** Greenness. Healthy dense canopy is 0.6–0.9, bare soil 0.1–0.25, water below 0. */
export const NDVI_RANGE: Range = [-0.2, 1.0];
/** Leaf water. Dry or sparse vegetation is below 0, well-watered dense canopy above 0.3. */
export const NDMI_RANGE: Range = [-0.4, 0.6];

export function quantize(v: number, [lo, hi]: Range): number {
  if (!Number.isFinite(v)) return NODATA;
  return Math.max(0, Math.min(254, Math.round(((v - lo) / (hi - lo)) * 254)));
}

export const dequantize = (q: number, [lo, hi]: Range): number => (q === NODATA ? NaN : lo + (q / 254) * (hi - lo));

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    const b = Buffer.from(b64, "base64");
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Index values (NaN = no reading) → base64 bytes. */
export function encodeGrid(values: ArrayLike<number>, range: Range): string {
  const bytes = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) bytes[i] = quantize(values[i], range);
  return bytesToBase64(bytes);
}

/** base64 bytes → Float32 index values, NaN where there was no reading. */
export function decodeGrid(b64: string, range: Range): Float32Array {
  const bytes = base64ToBytes(b64);
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = dequantize(bytes[i], range);
  return out;
}
