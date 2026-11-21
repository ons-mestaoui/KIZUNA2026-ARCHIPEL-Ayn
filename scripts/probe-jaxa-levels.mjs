// How fine are the finer tile levels, and how big are their files?   node scripts/probe-jaxa-levels.mjs <collection-id> [lat] [lon]
import { fromArrayBuffer } from "geotiff";

const ROOT = "https://s3.ap-northeast-1.wasabisys.com/je-pds/cog/v1";
const [, , id = "JAXA.G-Portal_GCOM-C.SGLI_standard.L3-LST.daytime.v3_global_daily", latArg = "36.4561", lonArg = "10.7376"] = process.argv;
const lat = Number(latArg), lon = Number(lonArg);
const j = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u.slice(-70)}`); return r.json(); };
const kids = (c) => (c.links ?? []).filter((l) => l.rel === "child" || l.rel === "item").map((l) => l.href.replace(/^\.\//, "").replace(/\/catalog\.json$/, ""));

const base = `${ROOT}/${id}`;
const col = await j(`${base}/collection.json`);
const month = kids(col).at(-1);
const days = kids(await j(`${base}/${month}/catalog.json`));
const day = days.at(-2);
const dayPath = `${month}/${day}`;
const levels = kids(await j(`${base}/${dayPath}/catalog.json`));
console.log("day", dayPath, "levels:", levels.join(", "));

for (const lv of levels) {
  // find the tile that contains the point by walking the tree
  let path = `${dayPath}/${lv}`;
  for (let depth = 0; depth < 8; depth++) {
    const names = kids(await j(`${base}/${path}/catalog.json`).catch(() => ({ links: [] })));
    if (!names.length) break;
    // directory names look like E000.00-E090.00 (lon range) — pick the one containing lon; items look like N00.00-N90.00.json
    const pick = names.find((n) => {
      const m = n.match(/^([EW])(\d+\.\d+)-([EW])(\d+\.\d+)$/);
      if (!m) return false;
      const a = (m[1] === "W" ? -1 : 1) * Number(m[2]);
      const b = (m[3] === "W" ? -1 : 1) * Number(m[4]);
      return lon >= Math.min(a, b) && lon <= Math.max(a, b);
    });
    if (!pick) {
      // reached the latitude items
      const item = names.find((n) => { const m = n.replace(".json", "").match(/^([NS])(\d+\.\d+)-([NS])(\d+\.\d+)$/); if (!m) return false; const a = (m[1] === "S" ? -1 : 1) * Number(m[2]); const b = (m[3] === "S" ? -1 : 1) * Number(m[4]); return lat >= Math.min(a, b) && lat <= Math.max(a, b); }) ?? names[0];
      const it = await j(`${base}/${path}/${item}`);
      const [, a] = Object.entries(it.assets)[0];
      const href = new URL(a.href, `${base}/${path}/${item}`).href;
      const t0 = Date.now();
      const res = await fetch(href);
      const buf = await res.arrayBuffer();
      const img = await (await fromArrayBuffer(buf)).getImage();
      const [rx] = img.getResolution();
      console.log(`level ${lv}: ${item.replace(".json", "")}  ${(buf.byteLength / 1e6).toFixed(2)} MB in ${Date.now() - t0} ms, ${img.getWidth()}×${img.getHeight()} px, pixel ${Math.abs(rx)}° ≈ ${(Math.abs(rx) * 111.32 * Math.cos((lat * Math.PI) / 180)).toFixed(1)} km`);
      break;
    }
    path = `${path}/${pick}`;
  }
}
