import { TILE, esriTileUrl, tileCount, tileGrid, zoomFor } from "@/lib/field/tiles";
import type { GeoBox } from "@/lib/field/types";

// A photo of the scene box, stitched in the browser from Esri World Imagery tiles (the same service the app's maps
// use, shown with its attribution). The tiles go straight from Esri to the phone; our server never touches them.

/**
 * Esri answers HTTP 200 with a grey "Map data not yet available" picture where it has no imagery at that zoom. Measured
 * on the real service it is exactly 2,521 bytes, so that size (and anything tiny) is not a photograph.
 */
const isPlaceholder = (bytes: number) => bytes < 1500 || (bytes >= 2400 && bytes <= 2650);
/** Detail check for zoom 18: where Esri only has coarse imagery it serves an upscaled, featureless tile. */
const MIN_DETAILED_TILE_BYTES = 8000;

async function fetchTile(url: string, signal?: AbortSignal): Promise<{ bitmap: ImageBitmap; bytes: number } | null> {
  try {
    const res = await fetch(url, { signal, mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (isPlaceholder(blob.size)) return null;
    return { bitmap: await createImageBitmap(blob), bytes: blob.size };
  } catch {
    return null;
  }
}

export interface Photo {
  canvas: HTMLCanvasElement;
  zoom: number;
}

/**
 * The scene box as one canvas, or null if too many tiles were missing to be worth showing.
 * Zoom 18 (≈0.5 m a pixel) when the picture is small enough and the imagery there is detailed; otherwise 17 or lower.
 */
export async function loadPhoto(box: GeoBox, opts: { signal?: AbortSignal; maxPx?: number } = {}): Promise<Photo | null> {
  let z = zoomFor(box, opts.maxPx ?? 2048);
  const centreTile = (zoom: number) => {
    const g = tileGrid(box, zoom);
    return { x: Math.floor((g.x0 + g.x1) / 2 / TILE), y: Math.floor((g.y0 + g.y1) / 2 / TILE) };
  };
  if (z >= 18) {
    const c = centreTile(18);
    const probe = await fetchTile(esriTileUrl(18, c.x, c.y), opts.signal);
    if (!probe || probe.bytes < MIN_DETAILED_TILE_BYTES) z = 17;
    probe?.bitmap.close();
  }

  const g = tileGrid(box, z);
  const width = Math.round(g.x1 - g.x0);
  const height = Math.round(g.y1 - g.y0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#dde1d6";
  ctx.fillRect(0, 0, width, height);

  const jobs: Promise<boolean>[] = [];
  for (let ty = g.ty0; ty <= g.ty1; ty++) {
    for (let tx = g.tx0; tx <= g.tx1; tx++) {
      jobs.push(
        fetchTile(esriTileUrl(z, tx, ty), opts.signal).then((t) => {
          if (!t) return false;
          ctx.drawImage(t.bitmap, Math.round(tx * TILE - g.x0), Math.round(ty * TILE - g.y0));
          t.bitmap.close();
          return true;
        }),
      );
    }
  }
  const drawn = (await Promise.all(jobs)).filter(Boolean).length;
  if (opts.signal?.aborted || drawn < tileCount(g) * 0.6) return null;
  return { canvas, zoom: z };
}
