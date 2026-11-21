// Snapshots the demo field's satellite view into data/demo/ and public/demo/ so the pitch runs with no internet:
//   npm run snapshot:field      (tsx scripts/snapshot-field.mts; needs CDSE_CLIENT_ID / CDSE_CLIENT_SECRET in .env.local; the demo itself never needs them)
//
//   data/demo/field.json         the same FieldDTO the live /api/field returns, plus terrain heights and named pass sets
//   public/demo/field-photo.jpg  Sentinel-2 true colour of the scene (open licence): the demo's first paint and its offline photo
//
// Zones are fixed from the per-pixel median of the four summer passes either side of the 21 July 2026 heatwave, so a
// zone means the same patch of ground on every date. The demo shows two of those passes (before and after the
// heatwave) and the two latest clear passes for its "live" scenario.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { DEMO_POLYGON, DEMO_SUMMER_PASSES } from "../lib/demo-field";
import { adviseZones } from "../lib/field/advice";
import { CLEAR_GOOD, buildField } from "../lib/field/build";
import { createCdseClient } from "../lib/field/copernicus-core";
import { sceneBox } from "../lib/field/geo";
import { type PixelTile, encodeHeights, heightGrid, terrainTilesFor, terrainZoom, tileKey } from "../lib/field/terrain";
import { terrariumUrl } from "../lib/field/tiles";

process.loadEnvFile(join(process.cwd(), ".env.local"));
const id = process.env.CDSE_CLIENT_ID;
const secret = process.env.CDSE_CLIENT_SECRET;
if (!id || !secret) throw new Error("Set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET in .env.local first.");
const client = createCdseClient({ id, secret });

const DAY = 86_400_000;
const now = new Date();
const HEATWAVE_SHOWN = ["2026-07-18", "2026-07-23"]; // before and after 21 July
const PHOTO_DATE = "2026-07-18"; // a cloud-free summer pass

// the two latest clear passes for the "live" scenario
const recent = await client.series(DEMO_POLYGON, new Date(now.getTime() - 45 * DAY), new Date(now.getTime() + DAY));
const liveDates = recent.filter((p) => p.clear >= CLEAR_GOOD).slice(-2).map((p) => p.date); // the two newest clear passes, however close together
if (liveDates.length < 2) console.warn("Only", liveDates.length, "clear recent pass(es): the live scenario will show fewer chips.");
console.log("live passes:", liveDates.join(", "));

const built = await buildField(client, DEMO_POLYGON, {
  now,
  source: "snapshot",
  frameDates: [...DEMO_SUMMER_PASSES, ...liveDates],
  zoneDates: DEMO_SUMMER_PASSES,
});

// keep only the passes the demo shows (the other two summer passes only helped to fix the zones)
const shown = [...HEATWAVE_SHOWN, ...liveDates];
const keep = built.frames.map((f, i) => ({ f, s: built.stats[i] })).filter((k) => shown.includes(k.f.date));
const { box } = sceneBox(DEMO_POLYGON);

// terrain: open Terrarium tiles → a 65 × 65 grid of heights
const z = terrainZoom(box);
const tiles = new Map<string, PixelTile>();
for (const t of terrainTilesFor(box, z)) {
  const res = await fetch(terrariumUrl(z, t.x, t.y));
  if (!res.ok) throw new Error(`terrain tile ${z}/${t.x}/${t.y}: HTTP ${res.status}`);
  const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  tiles.set(tileKey(t.x, t.y), { width: info.width, height: info.height, data, channels: 3 });
}
const heights = heightGrid(box, 65, 65, z, tiles);
const lo = Math.min(...heights);
const hi = Math.max(...heights);

// the photo
mkdirSync(join(process.cwd(), "public", "demo"), { recursive: true });
const jpeg = await client.trueColor(box, PHOTO_DATE, 400, 400);
writeFileSync(join(process.cwd(), "public", "demo", "field-photo.jpg"), jpeg);

const field = {
  ...built,
  frames: keep.map((k) => k.f),
  stats: keep.map((k) => k.s),
  lastClear: keep.at(-1)?.f.date ?? built.lastClear,
  terrain: { w: 65, h: 65, heights: encodeHeights(heights) },
  photoUrl: "/demo/field-photo.jpg",
  sets: { heatwave: HEATWAVE_SHOWN, live: liveDates },
};
mkdirSync(join(process.cwd(), "data", "demo"), { recursive: true });
writeFileSync(join(process.cwd(), "data", "demo", "field.json"), JSON.stringify(field));

console.log(`\nfield.json ${(JSON.stringify(field).length / 1024).toFixed(0)} KB · photo ${(jpeg.length / 1024).toFixed(0)} KB · terrain ${lo.toFixed(1)}…${hi.toFixed(1)} m (zoom ${z}, ${tiles.size} tiles)`);
console.log("zones:", field.zones?.list.map((zn) => `${zn.id} ${zn.areaHa.toFixed(2)} ha`).join(", ") ?? "none");
field.stats.forEach((st, i) => {
  const irrigate = adviseZones({ latest: st, previous: i > 0 ? field.stats[i - 1] : null, decision: "irrigate" });
  const skip = adviseZones({ latest: st, previous: i > 0 ? field.stats[i - 1] : null, decision: "skip" });
  console.log(`${st.date} field ${st.field.ndvi}/${st.field.ndmi} · zones ${st.zones.map((q) => `${q.ndvi}/${q.ndmi}`).join(" | ")} · irrigate day: ${irrigate.advice.kind}${"zone" in irrigate.advice ? " " + String.fromCharCode(65 + irrigate.advice.zone) : ""} · skip day: ${skip.advice.kind}`);
});
