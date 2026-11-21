import { greennessColor, leafWaterColor, zoneColor, type RGB } from "@/lib/field/ramps";
import type { FieldDTO } from "@/lib/field/types";
import type { FieldGrids } from "./derive";
import type { FieldLayer } from "./store";

// Paints the ground texture of the 3D scene on a 2D canvas: the photo, a veil over everything outside the field,
// then the satellite layer on top, clipped to the field. Re-run whenever the layer, pass or selected zone changes.

const BASE = "#dde1d6"; // shows where there is no photo
const HAZE = "rgba(238,241,232,0.30)";

export interface GroundArgs {
  field: FieldDTO;
  grids: FieldGrids;
  frame: number;
  layer: FieldLayer;
  zone: number | null;
  scores: number[];
  photo: CanvasImageSource | null;
  /** optional grayscale multiplier picture (see hillshadeCanvas) */
  shade: CanvasImageSource | null;
}

/** A small w × h picture whose pixels are `colour(p)`, transparent where it returns null. */
function paint(w: number, h: number, colour: (p: number) => RGB | [number, number, number, number] | null): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  for (let p = 0; p < w * h; p++) {
    const col = colour(p);
    if (!col) continue;
    img.data[p * 4] = col[0];
    img.data[p * 4 + 1] = col[1];
    img.data[p * 4 + 2] = col[2];
    img.data[p * 4 + 3] = col.length === 4 ? col[3] : 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function drawGround(canvas: HTMLCanvasElement, a: GroundArgs) {
  const { field, grids, frame, layer, zone, scores, photo, shade } = a;
  const S = canvas.width;
  const ctx = canvas.getContext("2d")!;
  const { box } = field;
  const px = ([lon, lat]: [number, number]): [number, number] => [((lon - box.west) / (box.east - box.west)) * S, ((box.north - lat) / (box.north - box.south)) * S];

  const outline = new Path2D();
  field.polygon.map(px).forEach(([x, y], i) => (i === 0 ? outline.moveTo(x, y) : outline.lineTo(x, y)));
  outline.closePath();

  // 1. the photo (or a calm flat ground when there is none)
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = BASE;
  ctx.fillRect(0, 0, S, S);
  if (photo) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(photo, 0, 0, S, S);
  }

  // 2. relief shading from the terrain, if there is any
  if (shade) {
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(shade, 0, 0, S, S);
    ctx.globalCompositeOperation = "source-over";
  }

  // 3. dim the world, light the field: outside the outline the photo loses most of its colour and gains a light haze
  const outside = new Path2D();
  outside.rect(0, 0, S, S);
  outside.addPath(outline);
  ctx.save();
  ctx.globalCompositeOperation = "saturation";
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fill(outside, "evenodd");
  ctx.restore();
  ctx.save();
  ctx.fillStyle = HAZE;
  ctx.fill(outside, "evenodd");
  ctx.restore();

  // 4. the satellite layer
  const fr = grids.frames[frame];
  if (layer !== "photo" && fr) {
    const { w, h } = grids;
    const k = field.zones?.list.length ?? 0;
    let colour: (p: number) => RGB | null;
    if (layer === "zones" && grids.zoneMap && k > 0) {
      const zm = grids.zoneMap;
      colour = (p) => (zm[p] < k ? zoneColor(scores[zm[p]] ?? 0) : null);
    } else if (layer === "water") {
      colour = (p) => (Number.isFinite(fr.ndmi[p]) ? leafWaterColor(fr.ndmi[p]) : null);
    } else {
      colour = (p) => (Number.isFinite(fr.ndvi[p]) ? greennessColor(fr.ndvi[p]) : null);
    }
    const heat = paint(w, h, colour);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (layer !== "zones") {
      // the neighbours, faintly, so the field can be compared with them
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.drawImage(heat, 0, 0, S, S);
      ctx.restore();
    }
    ctx.save();
    ctx.clip(outline);
    ctx.globalAlpha = layer === "zones" ? 0.8 : 0.86;
    ctx.drawImage(heat, 0, 0, S, S);
    ctx.globalAlpha = 1;
    // 5. a selected zone stays vivid; the rest of the field steps back
    if (zone !== null && grids.zoneMap) {
      const zm = grids.zoneMap;
      const others = paint(w, h, (p) => (zm[p] !== zone && zm[p] < k ? [244, 246, 240, 143] : null));
      ctx.drawImage(others, 0, 0, S, S);
    }
    ctx.restore();
  }
}

/**
 * A grayscale picture that multiplies the photo to show relief: ground facing away from a north-west sun is darker,
 * flat ground and lit slopes are left alone. `heights` is a row-major grid (row 0 = north) in metres.
 */
export function hillshadeCanvas(heights: { w: number; h: number; data: ArrayLike<number> }, cellM: number, size: number, zFactor: number): HTMLCanvasElement {
  const { w, h, data } = heights;
  const at = (i: number, j: number) => data[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))];
  const az = (315 * Math.PI) / 180;
  const alt = (40 * Math.PI) / 180;
  const flat = Math.sin(alt);
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const g = small.getContext("2d")!;
  const img = g.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      // Horn's method; y points south here, so the northward slope is minus dz/dy
      const dzdx = (at(i + 1, j - 1) + 2 * at(i + 1, j) + at(i + 1, j + 1) - (at(i - 1, j - 1) + 2 * at(i - 1, j) + at(i - 1, j + 1))) / (8 * cellM);
      const dzdy = -(at(i - 1, j + 1) + 2 * at(i, j + 1) + at(i + 1, j + 1) - (at(i - 1, j - 1) + 2 * at(i, j - 1) + at(i + 1, j - 1))) / (8 * cellM);
      const slope = Math.atan(zFactor * Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      const lit = Math.sin(alt) * Math.cos(slope) + Math.cos(alt) * Math.sin(slope) * Math.cos(az - aspect);
      const v = Math.round(255 * Math.min(1, Math.max(0.74, 1 + (lit - flat) * 1.1)));
      const o = (j * w + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const og = out.getContext("2d")!;
  og.imageSmoothingEnabled = true;
  og.imageSmoothingQuality = "high";
  og.drawImage(small, 0, 0, size, size);
  return out;
}

