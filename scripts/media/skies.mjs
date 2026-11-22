// The skies behind the Week tab's forecast card: four moods, painted in code (gradients, a sun glow and fractal-noise clouds
// with a shaded underside), written to public/media/sky-<mood>.webp.   node scripts/media/skies.mjs
import { mkdirSync, statSync } from "node:fs";
import sharp from "sharp";

const W = 1400;
const H = 900;
mkdirSync("public/media", { recursive: true });

/** One cloud layer: fractal noise → soft blobs (k/b choose how much sky they cover), lightly blurred. */
const cloud = (id, seed, freq, rgb, k, b, blur = 2.2) => `
  <filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="5" seed="${seed}" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 ${rgb[0] / 255}  0 0 0 0 ${rgb[1] / 255}  0 0 0 0 ${rgb[2] / 255}  0 0 0 ${k} ${b}" result="c"/>
    <feGaussianBlur in="c" stdDeviation="${blur}"/>
  </filter>`;

// Each mood: gradient, sun glow, and cloud layers. A layer is painted twice: first dark and shifted down (its shaded underside),
// then lit on top, so the clouds have volume. `from`/`to` fade the layer in over a band of the sky (clear air above, a bank below).
const MOODS = {
  calm: {
    sky: [["0", "#4f86d0"], ["0.6", "#8fbbea"], ["1", "#d8e7f6"]],
    sun: { x: 0.8, y: 0.62, r: 0.55, color: "#fff4da", a: 0.6 },
    layers: [
      { seed: 12, freq: "0.0028 0.0065", lit: [255, 255, 255], shade: [150, 175, 215], k: 4.4, b: -2.15, o: 0.98, from: 0.3, to: 0.62 },
      { seed: 29, freq: "0.006 0.011", lit: [246, 249, 255], shade: [165, 188, 222], k: 3.6, b: -1.85, o: 0.7, from: 0.45, to: 0.8 },
    ],
    haze: "rgba(255,255,255,0.1)",
  },
  warm: {
    sky: [["0", "#456fb8"], ["0.5", "#8fa6cf"], ["0.78", "#efc29c"], ["1", "#f8d9ae"]],
    sun: { x: 0.8, y: 0.74, r: 0.6, color: "#ffd9a0", a: 0.85 },
    layers: [
      { seed: 33, freq: "0.003 0.0065", lit: [255, 238, 218], shade: [158, 140, 170], k: 4.4, b: -2.1, o: 0.97, from: 0.25, to: 0.58 },
      { seed: 51, freq: "0.006 0.012", lit: [252, 214, 186], shade: [176, 140, 150], k: 3.6, b: -1.8, o: 0.75, from: 0.45, to: 0.85 },
    ],
    haze: "rgba(255,190,130,0.12)",
  },
  hot: {
    sky: [["0", "#27508f"], ["0.38", "#6a78ad"], ["0.68", "#e2894a"], ["1", "#f5b862"]],
    sun: { x: 0.74, y: 0.8, r: 0.62, color: "#ffb347", a: 1 },
    layers: [
      { seed: 57, freq: "0.0025 0.007", lit: [255, 196, 138], shade: [110, 92, 130], k: 4.6, b: -2.2, o: 0.95, from: 0.35, to: 0.7 },
      { seed: 73, freq: "0.006 0.012", lit: [255, 164, 98], shade: [140, 90, 100], k: 3.6, b: -1.75, o: 0.7, from: 0.5, to: 0.9 },
    ],
    haze: "rgba(255,140,60,0.14)",
  },
  storm: {
    sky: [["0", "#222e46"], ["0.5", "#4b5e82"], ["0.85", "#8e9db4"], ["1", "#bcc7d6"]],
    sun: { x: 0.28, y: 0.94, r: 0.45, color: "#e9eef5", a: 0.55 },
    layers: [
      { seed: 77, freq: "0.0028 0.006", lit: [96, 110, 138], shade: [28, 36, 54], k: 4.4, b: -1.7, o: 0.98, from: 0, to: 0.3 },
      { seed: 91, freq: "0.006 0.011", lit: [150, 162, 184], shade: [60, 72, 98], k: 3.6, b: -1.7, o: 0.8, from: 0.2, to: 0.55 },
      { seed: 103, freq: "0.011 0.019", lit: [214, 222, 234], shade: [120, 134, 158], k: 3.2, b: -1.7, o: 0.45, from: 0.45, to: 0.8 },
    ],
    haze: "rgba(25,35,55,0.1)",
  },
};

for (const [name, m] of Object.entries(MOODS)) {
  const defs = m.layers
    .map(
      (l, i) => `
    ${cloud(`lit${i}`, l.seed, l.freq, l.lit, l.k, l.b)}
    ${cloud(`shade${i}`, l.seed, l.freq, l.shade, l.k, l.b - 0.1, 5)}
    <linearGradient id="fade${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="${l.from}" stop-color="#000"/><stop offset="${l.to}" stop-color="#fff"/></linearGradient>
    <mask id="mask${i}"><rect width="100%" height="100%" fill="url(#fade${i})"/></mask>`,
    )
    .join("");
  const layers = m.layers
    .map(
      (l, i) => `
    <g mask="url(#mask${i})" opacity="${l.o}">
      <rect width="100%" height="100%" filter="url(#shade${i})" transform="translate(0 14)" opacity="0.85"/>
      <rect width="100%" height="100%" filter="url(#lit${i})"/>
    </g>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${m.sky.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>
      <radialGradient id="sun" cx="${m.sun.x}" cy="${m.sun.y}" r="${m.sun.r}">
        <stop offset="0" stop-color="${m.sun.color}" stop-opacity="${m.sun.a}"/><stop offset="1" stop-color="${m.sun.color}" stop-opacity="0"/>
      </radialGradient>
      ${defs}
    </defs>
    <rect width="100%" height="100%" fill="url(#sky)"/>
    <rect width="100%" height="100%" fill="url(#sun)"/>
    ${layers}
    <rect width="100%" height="100%" fill="${m.haze}"/>
    <rect width="100%" height="100%" fill="url(#sun)" opacity="0.5"/>
  </svg>`;
  const out = `public/media/sky-${name}.webp`;
  await sharp(Buffer.from(svg)).webp({ quality: 74 }).toFile(out);
  console.log(out.padEnd(30), (statSync(out).size / 1024).toFixed(0), "KB");
}
