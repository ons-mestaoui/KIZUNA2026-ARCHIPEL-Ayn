// What do the JAXA Earth API collections look like?   node scripts/probe-jaxa.mjs
// Walks each collection's STAC tree to a recent day and prints the COG assets, scale factors, nodata and size.
const ROOT = "https://s3.ap-northeast-1.wasabisys.com/je-pds/cog/v1";
const IDS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "JAXA.EORC_GSMaP_standard.Gauge.00Z-23Z.v6_daily",
      "JAXA.G-Portal_GCOM-C.SGLI_standard.L3-LST.daytime.v3_global_daily",
      "JAXA.G-Portal_GCOM-C.SGLI_standard.L3-NDVI.daytime.v3_global_daily",
      "JAXA.G-Portal_GCOM-W.AMSR2_standard.L3-SMC.daytime.v3_global_daily",
    ];
const j = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u.slice(-60)}`); return r.json(); };
const childs = (c) => (c.links ?? []).filter((l) => l.rel === "child" || l.rel === "item").map((l) => l.href.replace(/^\.\//, ""));

for (const id of IDS) {
  console.log("\n== " + id);
  try {
    const base = `${ROOT}/${id}`;
    const col = await j(`${base}/collection.json`);
    const months = childs(col);
    console.log("  months:", months.length, "latest", months.at(-1));
    // walk down the LAST branch (most recent) until we reach an item with assets, trying a couple of days back
    let path = months.at(-1).replace(/\/catalog\.json$/, "");
    let cat = await j(`${base}/${path}/catalog.json`);
    let days = childs(cat);
    console.log("  days in latest month:", days.length, "last", days.slice(-3).join(", "));
    const dayDir = days.at(-2).replace(/\/catalog\.json$/, "");
    path = `${path}/${dayDir}`;
    for (let depth = 0; depth < 6; depth++) {
      const c = await j(`${base}/${path}/catalog.json`.replace(/\.json\.json$/, ".json"));
      const kids = childs(c);
      if (!kids.length) break;
      const next = kids[0];
      if (next.endsWith(".json") && !next.endsWith("catalog.json")) {
        const item = await j(`${base}/${path}/${next}`);
        const [name, a] = Object.entries(item.assets)[0];
        const href = new URL(a.href, `${base}/${path}/${next}`).href;
        const head = await fetch(href, { method: "HEAD" });
        const rs = a["je:rasters"] ?? {};
        console.log(`  item ${next}: band ${name}, bbox ${JSON.stringify(item.bbox)}, ${(+head.headers.get("content-length") / 1e6).toFixed(2)} MB, dn2value ${JSON.stringify(rs.dn2value)}, dn ${JSON.stringify({ ...rs.dn, error: undefined })}, unit ${rs.value?.unit}`);
        console.log("  file:", href.replace(base, "…"));
        break;
      }
      path = `${path}/${next.replace(/\/catalog\.json$/, "")}`;
      console.log("  →", next);
    }
  } catch (e) {
    console.log("  ERROR", String(e).slice(0, 200));
  }
}
