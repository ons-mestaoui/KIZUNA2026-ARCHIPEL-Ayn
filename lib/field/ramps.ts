// Colour scales for the satellite view. Built in OKLCH (perceptual lightness) and sampled in OKLab, so each scale
// really does go from light to dark in even steps, and are checked in ramps.test.ts (monotone lightness, and the two
// arms of the diverging scale stay apart for red-green colour-blind readers).
//
//   greenness  one-hue sequential (green): pale = little vegetation, dark = dense, healthy canopy
//   leaf water one-hue sequential (blue):  pale = dry leaves, dark = well-watered canopy
//   zones      diverging amber ← neutral grey → teal: weaker/drier than the field average … stronger/wetter

export type RGB = [number, number, number]; // 0–255
type Stop = readonly [L: number, C: number, h: number];

const DEG = Math.PI / 180;

function oklchToLinear([L, C, h]: Stop): RGB {
  const a = C * Math.cos(h * DEG);
  const b = C * Math.sin(h * DEG);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

const encode = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255;
};
const decode = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const oklchToRgb = (s: Stop): RGB => {
  const [r, g, b] = oklchToLinear(s);
  return [Math.round(encode(r)), Math.round(encode(g)), Math.round(encode(b))];
};

/** sRGB (0–255) → OKLab [L, a, b]. */
export function rgbToOklab([r, g, b]: RGB): [number, number, number] {
  const lr = decode(r);
  const lg = decode(g);
  const lb = decode(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

export const lightness = (c: RGB) => rgbToOklab(c)[0];
export const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
export const toCss = ([r, g, b]: RGB, alpha = 1) => `rgba(${r},${g},${b},${alpha})`;

export interface Ramp {
  stops: RGB[];
  /** 256 colours from t = 0 to t = 1, for per-pixel painting */
  lut: RGB[];
}

function buildRamp(stops: readonly Stop[]): Ramp {
  const rgb = stops.map(oklchToRgb);
  const lab = rgb.map(rgbToOklab);
  const lut: RGB[] = [];
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t));
    const f = t - k;
    const L = lab[k][0] + (lab[k + 1][0] - lab[k][0]) * f;
    const a = lab[k][1] + (lab[k + 1][1] - lab[k][1]) * f;
    const b = lab[k][2] + (lab[k + 1][2] - lab[k][2]) * f;
    // OKLab → sRGB by way of OKLCH
    const C = Math.hypot(a, b);
    const h = (Math.atan2(b, a) / DEG + 360) % 360;
    lut.push(oklchToRgb([L, C, h]));
  }
  return { stops: rgb, lut };
}

const lutAt = (r: Ramp, t: number): RGB => r.lut[Math.round(Math.min(1, Math.max(0, t)) * 255)];

export const GREENNESS = buildRamp([
  [0.965, 0.012, 125],
  [0.89, 0.035, 122],
  [0.815, 0.065, 126],
  [0.74, 0.095, 131],
  [0.665, 0.12, 137],
  [0.59, 0.132, 142],
  [0.515, 0.128, 146],
  [0.44, 0.11, 148],
  [0.365, 0.088, 150],
]);

export const LEAF_WATER = buildRamp([
  [0.965, 0.008, 230],
  [0.89, 0.025, 232],
  [0.815, 0.045, 235],
  [0.74, 0.07, 239],
  [0.665, 0.095, 243],
  [0.59, 0.115, 247],
  [0.515, 0.122, 251],
  [0.44, 0.112, 255],
  [0.365, 0.095, 258],
]);

/** Diverging arms, from the neutral centre outwards. */
const NEUTRAL: Stop = [0.915, 0, 0];
export const ZONE_WEAKER = buildRamp([NEUTRAL, [0.83, 0.095, 75], [0.745, 0.14, 58], [0.66, 0.165, 45]]);
export const ZONE_STRONGER = buildRamp([NEUTRAL, [0.835, 0.05, 200], [0.755, 0.085, 200], [0.67, 0.105, 205]]);

/** NDVI range the greenness scale covers: bare soil ≈ 0.2, dense healthy canopy ≈ 0.9 (and above). */
export const GREEN_RANGE = [0.2, 0.95] as const;
/** NDMI range the leaf-water scale covers. */
export const WATER_RANGE = [0.0, 0.5] as const;

export const greennessColor = (ndvi: number): RGB => lutAt(GREENNESS, (ndvi - GREEN_RANGE[0]) / (GREEN_RANGE[1] - GREEN_RANGE[0]));
export const leafWaterColor = (ndmi: number): RGB => lutAt(LEAF_WATER, (ndmi - WATER_RANGE[0]) / (WATER_RANGE[1] - WATER_RANGE[0]));

/** score −1 (much weaker/drier than the field) … 0 (average) … +1 (much stronger/wetter) */
export const zoneColor = (score: number): RGB => (score < 0 ? lutAt(ZONE_WEAKER, -score) : lutAt(ZONE_STRONGER, score));
