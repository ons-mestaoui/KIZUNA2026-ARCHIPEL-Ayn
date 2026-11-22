"use client";

import { useEffect, useMemo, useState } from "react";
import { decodeHeights, heightGrid, terrainTilesFor, terrainZoom, tileKey, type PixelTile } from "@/lib/field/terrain";
import { TILE, terrariumUrl } from "@/lib/field/tiles";
import type { FieldDTO } from "@/lib/field/types";
import type { HeightGrid } from "./FieldScene";

const GRID = 65;

/** One terrain tile as colour bytes (a canvas does the PNG decoding). */
async function loadTile(z: number, x: number, y: number, signal: AbortSignal): Promise<PixelTile | null> {
  try {
    const res = await fetch(terrariumUrl(z, x, y), { signal, mode: "cors" });
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const c = document.createElement("canvas");
    c.width = c.height = TILE;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(bitmap, 0, 0);
    bitmap.close();
    return { width: TILE, height: TILE, data: g.getImageData(0, 0, TILE, TILE).data, channels: 4 };
  } catch {
    return null;
  }
}

/**
 * The ground heights under the scene: bundled with the demo snapshot, or read from open terrain tiles for a live
 * field. Returns null until they are known, or when there is no signal (the scene is then simply flat).
 */
export function useHeights(field: FieldDTO): HeightGrid | null {
  const bundled = useMemo(() => (field.terrain ? { w: field.terrain.w, h: field.terrain.h, data: decodeHeights(field.terrain.heights) } : null), [field.terrain]);
  const [live, setLive] = useState<{ box: FieldDTO["box"]; grid: HeightGrid } | null>(null);

  useEffect(() => {
    if (field.terrain) return;
    const ctl = new AbortController();
    const z = terrainZoom(field.box);
    (async () => {
      const wanted = terrainTilesFor(field.box, z);
      const loaded = await Promise.all(wanted.map((t) => loadTile(z, t.x, t.y, ctl.signal)));
      if (ctl.signal.aborted) return;
      const tiles = new Map<string, PixelTile>();
      wanted.forEach((t, i) => loaded[i] && tiles.set(tileKey(t.x, t.y), loaded[i]!));
      if (tiles.size === 0) return;
      setLive({ box: field.box, grid: { w: GRID, h: GRID, data: heightGrid(field.box, GRID, GRID, z, tiles) } });
    })();
    return () => ctl.abort();
  }, [field.box, field.terrain]);

  const boxMatch =
    live &&
    live.box.north === field.box.north &&
    live.box.south === field.box.south &&
    live.box.east === field.box.east &&
    live.box.west === field.box.west;

  return bundled ?? (boxMatch ? live.grid : null);
}
