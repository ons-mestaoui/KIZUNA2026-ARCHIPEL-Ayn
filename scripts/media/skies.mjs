// The skies behind the Week tab's forecast card: four moods, painted in code. Each mood is two pictures:
//   sky-<mood>.webp    the sky: gradient, sun glow, high wisps and a few cumulus banks behind
//   cloud-<mood>.webp  a bank of cumulus in front (transparent), which the card slides slowly and sets the wave against
// and a landscape pair of each (…-wide) for the card when it spreads across a desktop page.
// Cumulus are built from many soft blobs sharing one gradient whose bright spot faces the sun (lit tops, shaded bases).
//   node scripts/media/skies.mjs
import { mkdirSync, statSync } from "node:fs";
import sharp from "sharp";

mkdirSync("public/media", { recursive: true });
const W = 1200;
const H = 1600;
const FW = 1400; // the front bank is wider than the card so it can drift
const FH = 640;

const rng = (seed) => {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
};

/** A cumulus bank: blobs piled into a dome with a flat bottom. Drawn twice: a shaded copy a little lower, then the lit copy on top, so
 *  the undersides stay shaded and the tops catch the light. */
function bank({ seed, cx, base, w, h, count, blur = 3.4, opacity = 1 }) {
  const r = rng(seed);
  const blobs = [];
  for (let i = 0; i < count * 2; i++) {
    const u = r() * 2 - 1;
    const dome = Math.pow(Math.max(0, 1 - u * u), 0.6);
    const height = h * dome;
    const rad = (0.055 + 0.1 * r()) * h * (0.6 + 0.7 * dome);
    const y = Math.min(base - rad * 0.5, base - r() * height * 0.94 - height * 0.04);
    blobs.push({ x: cx + u * (w / 2) + (r() - 0.5) * w * 0.05, y, rad });
  }
  blobs.sort((p, q) => q.y - p.y); // lowest first
  const circles = (dy, grad, scale) => blobs.map((p) => `<circle cx="${p.x.toFixed(0)}" cy="${(p.y + dy).toFixed(0)}" r="${(p.rad * scale).toFixed(0)}" fill="url(#${grad})"/>`).join("");
  const under = `<ellipse cx="${cx}" cy="${base - 2}" rx="${(w * 0.47).toFixed(0)}" ry="${(h * 0.1).toFixed(0)}" fill="url(#under)" opacity="0.5"/>`;
  const f = blur > 5 ? "softB" : "soft";
  return `<g opacity="${opacity}" filter="url(#${f})">${under}${circles(h * 0.1, "cs", 1.04)}${circles(0, "cg", 1)}</g>`;
}

const cloudGrad = (id, lit, mid, shade, fx = 0.5, fy = 0.3) => `
  <radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5" fx="${fx}" fy="${fy}">
    <stop offset="0" stop-color="${lit}" stop-opacity="1"/><stop offset="0.5" stop-color="${lit}" stop-opacity="0.92"/>
    <stop offset="0.78" stop-color="${mid}" stop-opacity="0.5"/><stop offset="1" stop-color="${mid}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="cs" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${shade}" stop-opacity="0.7"/><stop offset="0.65" stop-color="${shade}" stop-opacity="0.42"/><stop offset="1" stop-color="${shade}" stop-opacity="0"/>
  </radialGradient>`;

const COMMON_DEFS = (shade) => `
  <filter id="soft" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.011 0.016" numOctaves="3" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="6"/></filter>
  <filter id="softB" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="3" seed="9" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="40" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="9"/></filter>
  <linearGradient id="under" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade}" stop-opacity="0"/><stop offset="1" stop-color="${shade}" stop-opacity="0.9"/></linearGradient>`;

/** High, thin wisps (cirrus): stretched fractal noise, only in a band of the sky. */
const wisps = (seed, rgb, a, from, to) => `
  <filter id="wisp" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.0022 0.02" numOctaves="4" seed="${seed}"/>
    <feColorMatrix type="matrix" values="0 0 0 0 ${rgb[0] / 255}  0 0 0 0 ${rgb[1] / 255}  0 0 0 0 ${rgb[2] / 255}  0 0 0 4.2 -1.95"/>
    <feGaussianBlur stdDeviation="1.6"/>
  </filter>
  <linearGradient id="wfade" x1="0" y1="0" x2="0" y2="1"><stop offset="${from}" stop-color="#000"/><stop offset="${(from + to) / 2}" stop-color="#fff"/><stop offset="${to}" stop-color="#000"/></linearGradient>
  <mask id="wmask"><rect width="100%" height="100%" fill="url(#wfade)"/></mask>
  <g mask="url(#wmask)" opacity="${a}"><rect width="100%" height="100%" filter="url(#wisp)"/></g>`;

const MOODS = {
  calm: {
    sky: [["0", "#3f7bd0"], ["0.5", "#78aee6"], ["0.85", "#bfd9f1"], ["1", "#e6f0f8"]],
    sun: { x: 0.72, y: 0.22, r: 0.42, c: "#fff6d8", a: 0.9 },
    lit: "#ffffff", mid: "#e3edf9", shade: "#9db6d6",
    wisps: { seed: 5, rgb: [255, 255, 255], a: 0.55, from: 0.04, to: 0.4 },
    back: [
      { seed: 3, cx: 250, base: 880, w: 560, h: 190, count: 70, blur: 6, opacity: 0.8 },
      { seed: 9, cx: 980, base: 790, w: 520, h: 170, count: 60, blur: 6, opacity: 0.75 },
      { seed: 14, cx: 640, base: 1090, w: 1000, h: 300, count: 130 },
    ],
    front: [
      { seed: 21, cx: 330, base: 650, w: 820, h: 270, count: 120 },
      { seed: 27, cx: 1030, base: 660, w: 760, h: 240, count: 110 },
    ],
  },
  warm: {
    sky: [["0", "#38629f"], ["0.42", "#8b9fcf"], ["0.7", "#f0bf9a"], ["1", "#f9d8a8"]],
    sun: { x: 0.74, y: 0.46, r: 0.46, c: "#ffd79a", a: 0.95 },
    lit: "#fff1dd", mid: "#f7cba4", shade: "#8f7aa0",
    wisps: { seed: 8, rgb: [255, 230, 205], a: 0.5, from: 0.08, to: 0.5 },
    back: [
      { seed: 31, cx: 260, base: 920, w: 560, h: 200, count: 70, blur: 6, opacity: 0.85 },
      { seed: 36, cx: 960, base: 840, w: 520, h: 180, count: 60, blur: 6, opacity: 0.8 },
      { seed: 41, cx: 600, base: 1130, w: 1000, h: 320, count: 130 },
    ],
    front: [
      { seed: 47, cx: 320, base: 650, w: 830, h: 280, count: 120 },
      { seed: 52, cx: 1040, base: 660, w: 780, h: 250, count: 110 },
    ],
  },
  hot: {
    sky: [["0", "#244b8a"], ["0.35", "#6370a9"], ["0.62", "#e0804a"], ["1", "#f6b866"]],
    sun: { x: 0.68, y: 0.6, r: 0.55, c: "#ffb347", a: 1 },
    lit: "#ffe0a8", mid: "#f5a263", shade: "#7a4f6e",
    wisps: { seed: 12, rgb: [255, 190, 135], a: 0.5, from: 0.15, to: 0.6 },
    back: [
      { seed: 61, cx: 220, base: 980, w: 520, h: 200, count: 70, blur: 6, opacity: 0.85 },
      { seed: 66, cx: 1000, base: 900, w: 520, h: 190, count: 60, blur: 6, opacity: 0.8 },
      { seed: 71, cx: 600, base: 1200, w: 1050, h: 320, count: 130 },
    ],
    front: [
      { seed: 77, cx: 320, base: 655, w: 840, h: 290, count: 120 },
      { seed: 83, cx: 1040, base: 665, w: 780, h: 250, count: 110 },
    ],
  },
  storm: {
    sky: [["0", "#1b2640"], ["0.45", "#3f5176"], ["0.8", "#7f8fa8"], ["1", "#aeb9ca"]],
    sun: { x: 0.3, y: 0.78, r: 0.4, c: "#dfe6f1", a: 0.55 },
    lit: "#9aa7bd", mid: "#5d6e8f", shade: "#222c44",
    wisps: { seed: 16, rgb: [120, 134, 160], a: 0.4, from: 0.0, to: 0.35 },
    back: [
      { seed: 91, cx: 280, base: 560, w: 760, h: 360, count: 110, blur: 6, opacity: 0.95 },
      { seed: 96, cx: 960, base: 700, w: 800, h: 380, count: 120, blur: 6, opacity: 0.95 },
      { seed: 101, cx: 560, base: 900, w: 1100, h: 400, count: 150 },
      { seed: 106, cx: 300, base: 1180, w: 900, h: 330, count: 130 },
    ],
    front: [
      { seed: 111, cx: 300, base: 650, w: 900, h: 300, count: 130 },
      { seed: 116, cx: 1050, base: 660, w: 800, h: 270, count: 115 },
    ],
  },
};

async function write(name, svg, w, h, alpha) {
  const out = `public/media/${name}.webp`;
  await sharp(Buffer.from(svg)).resize(w, h).webp({ quality: alpha ? 80 : 76, alphaQuality: 85 }).toFile(out);
  console.log(out.padEnd(34), (statSync(out).size / 1024).toFixed(0), "KB");
}

for (const [name, m] of Object.entries(MOODS)) {
  const sunGrad = `<radialGradient id="sun" cx="${m.sun.x}" cy="${m.sun.y}" r="${m.sun.r}"><stop offset="0" stop-color="${m.sun.c}" stop-opacity="${m.sun.a}"/><stop offset="1" stop-color="${m.sun.c}" stop-opacity="0"/></radialGradient>`;
  const sky = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${m.sky.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>
      ${sunGrad}${cloudGrad("cg", m.lit, m.mid, m.shade)}${COMMON_DEFS(m.shade)}
    </defs>
    <rect width="100%" height="100%" fill="url(#sky)"/>
    <rect width="100%" height="100%" fill="url(#sun)"/>
    ${wisps(m.wisps.seed, m.wisps.rgb, m.wisps.a, m.wisps.from, m.wisps.to)}
    ${m.back.map((b) => bank({ ...b, grad: "cg" })).join("")}
    <rect width="100%" height="100%" fill="url(#sun)" opacity="0.4"/>
  </svg>`;
  await write(`sky-${name}`, sky, W, H, false);

  const front = `<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${FH}" viewBox="0 0 ${FW} ${FH}">
    <defs>${cloudGrad("cg", m.lit, m.mid, m.shade, 0.7, 0.25)}${COMMON_DEFS(m.shade)}</defs>
    ${m.front.map((b) => bank({ ...b, grad: "cg" })).join("")}
  </svg>`;
  await write(`cloud-${name}`, front, FW, FH, true);
}

// ── landscape versions (desktop): the same moods, composed for a wide card ─────────────────────────────────────────
const WW = 2000;
const WH = 1100;
const FWW = 2400;
const FWH = 560;
const WIDE = {
  calm: { sun: [0.62, 0.26], dy: 0, big: 1 },
  warm: { sun: [0.62, 0.46], dy: 70, big: 1 },
  hot: { sun: [0.6, 0.56], dy: 140, big: 1 },
  storm: { sun: [0.3, 0.88], dy: -230, big: 1.25 },
};
for (const [name, m] of Object.entries(MOODS)) {
  const k = WIDE[name];
  const sunGrad = `<radialGradient id="sun" cx="${k.sun[0]}" cy="${k.sun[1]}" r="0.42"><stop offset="0" stop-color="${m.sun.c}" stop-opacity="${m.sun.a}"/><stop offset="1" stop-color="${m.sun.c}" stop-opacity="0"/></radialGradient>`;
  const y = (v) => v + k.dy;
  const back = [
    { seed: 201, cx: 330, base: y(640), w: 640 * k.big, h: 215 * k.big, count: 80, blur: 6, opacity: 0.85 },
    { seed: 207, cx: 1240, base: y(580), w: 600 * k.big, h: 195 * k.big, count: 70, blur: 6, opacity: 0.8 },
    { seed: 213, cx: 1760, base: y(700), w: 700 * k.big, h: 230 * k.big, count: 80, blur: 6, opacity: 0.85 },
    { seed: 219, cx: 900, base: y(860), w: 1300 * k.big, h: 330 * k.big, count: 160 },
    { seed: 225, cx: 1600, base: y(900), w: 900 * k.big, h: 280 * k.big, count: 110 },
  ];
  const wideSky = `<svg xmlns="http://www.w3.org/2000/svg" width="${WW}" height="${WH}" viewBox="0 0 ${WW} ${WH}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${m.sky.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>
      ${sunGrad}${cloudGrad("cg", m.lit, m.mid, m.shade)}${COMMON_DEFS(m.shade)}
    </defs>
    <rect width="100%" height="100%" fill="url(#sky)"/>
    <rect width="100%" height="100%" fill="url(#sun)"/>
    ${wisps(m.wisps.seed, m.wisps.rgb, m.wisps.a, m.wisps.from, m.wisps.to)}
    ${back.map((b) => bank({ ...b, grad: "cg" })).join("")}
    <rect width="100%" height="100%" fill="url(#sun)" opacity="0.4"/>
  </svg>`;
  await write(`sky-${name}-wide`, wideSky, WW, WH, false);

  const frontBanks = [
    { seed: 231, cx: 420, base: 540, w: 1100 * k.big, h: 300 * k.big, count: 140 },
    { seed: 237, cx: 1250, base: 548, w: 1150 * k.big, h: 330 * k.big, count: 150 },
    { seed: 243, cx: 2050, base: 540, w: 950 * k.big, h: 290 * k.big, count: 125 },
  ];
  const wideFront = `<svg xmlns="http://www.w3.org/2000/svg" width="${FWW}" height="${FWH}" viewBox="0 0 ${FWW} ${FWH}">
    <defs>${cloudGrad("cg", m.lit, m.mid, m.shade, 0.7, 0.25)}${COMMON_DEFS(m.shade)}</defs>
    ${frontBanks.map((b) => bank({ ...b, grad: "cg" })).join("")}
  </svg>`;
  await write(`cloud-${name}-wide`, wideFront, FWW, FWH, true);
}
