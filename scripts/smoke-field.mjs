// Satellite field view smoke test against any deployment.   node scripts/smoke-field.mjs [baseUrl]
// Needs the Copernicus keys on the server. Checks: outline validation, the server (not the client) deciding area and
// centre, the live Sentinel-2 payload, privacy between farmers, and that no secret ever appears in a response.
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(base).origin;
let failed = 0;
const ok = (c, label, extra = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
  if (!c) failed++;
};

function client() {
  const jar = new Map();
  return async (path, init = {}) => {
    const res = await fetch(base + path, {
      redirect: "manual",
      ...init,
      headers: { Origin: origin, "Content-Type": "application/json", ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...init.headers },
    });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || /max-age=0/i.test(line)) jar.delete(k);
      else jar.set(k, v);
    }
    return res;
  };
}
const json = async (r) => r.json().catch(() => ({}));

const farmBody = (over = {}) => ({
  name: "Satellite smoke farm",
  lat: 36.0, // deliberately wrong: with an outline the server must take the centre from it
  lon: 10.0,
  placeName: "Menzel Bouzelfa",
  crop: "citrus",
  plantingDate: null,
  areaHa: 99, // deliberately wrong too
  soilTexture: "sandy_loam",
  irrigationMethod: "drip",
  waterSource: "solar_basin",
  basinM3: 80,
  pvKWp: 3,
  pumpHeadM: 15,
  wellSafeYieldM3h: 20,
  lastIrrigated: "3-5d",
  lang: "en",
  ...over,
});

// a 100 m × 100 m square on a citrus block near Menzel Bouzelfa (0.0011° of longitude ≈ 100 m at 36.7°N, 0.0009° of latitude)
const C = [10.573, 36.687];
const square = (dx = 0.0011, dy = 0.0009) => [
  [C[0] - dx / 2, C[1] + dy / 2],
  [C[0] + dx / 2, C[1] + dy / 2],
  [C[0] + dx / 2, C[1] - dy / 2],
  [C[0] - dx / 2, C[1] - dy / 2],
];

async function signUp(call, tag) {
  const r = await call("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name: tag, email: `field+${tag}+${Date.now()}@example.com`, password: "smoke-test-pass-123" }) });
  return r.status === 200;
}

const anon = client();
ok((await anon("/api/field")).status === 401, "anonymous: no satellite view");

const A = client();
ok(await signUp(A, "a"), "farmer A signs up");
ok((await A("/api/field")).status === 404, "no farm yet → 404");

// a bow-tie is not a field
let r = await A("/api/farm", { method: "PUT", body: JSON.stringify(farmBody({ polygon: [square()[0], square()[2], square()[1], square()[3]] })) });
ok(r.status === 422, "an outline that crosses itself is refused", `HTTP ${r.status}`);
r = await A("/api/farm", { method: "PUT", body: JSON.stringify(farmBody({ polygon: [[10.573, 36.687], [10.5731, 36.687], [10.5732, 36.687]] })) });
ok(r.status === 422, "a sliver with no area is refused", `HTTP ${r.status}`);
r = await A("/api/farm", { method: "PUT", body: JSON.stringify(farmBody({ polygon: square(0.1, 0.1) })) });
ok(r.status === 422, "an outline kilometres wide is refused", `HTTP ${r.status}`);

// a pin-only farm has no satellite view
r = await A("/api/farm", { method: "PUT", body: JSON.stringify(farmBody({ lat: 36.687, lon: 10.573, areaHa: 1 })) });
ok(r.status === 200, "a farm with only a pin saves");
r = await A("/api/field");
ok(r.status === 404 && (await json(r)).error === "no_polygon", "pin only → 404 no_polygon");

// with an outline the server decides the centre and the area
r = await A("/api/farm", { method: "PUT", body: JSON.stringify(farmBody({ polygon: square() })) });
const saved = (await json(r)).farm;
ok(r.status === 200 && saved?.polygon?.length === 4, "a farm with an outline saves");
ok(Math.abs(saved.lon - C[0]) < 1e-4 && Math.abs(saved.lat - C[1]) < 1e-4, "the server took the centre from the outline, not from the body", `${saved?.lat}, ${saved?.lon}`);
ok(Math.abs(saved.areaHa - 1) < 0.05, "…and the area (about 1 ha, not the 99 the client claimed)", String(saved?.areaHa));
const got = (await json(await A("/api/farm"))).farm;
ok(JSON.stringify(got.polygon) === JSON.stringify(saved.polygon), "the outline comes back as saved");

// the live Sentinel-2 payload
const t0 = Date.now();
r = await A("/api/field");
const f = await json(r);
ok(r.status === 200, "GET /api/field", `HTTP ${r.status} in ${Date.now() - t0} ms ${r.status !== 200 ? JSON.stringify(f) : ""}`);
if (r.status === 200) {
  ok(f.version === 1 && f.source === "live", "payload is version 1, live");
  ok(f.frames.length >= 1 && f.frames.length <= 2, "one or two clear passes", f.frames.map((x) => `${x.date} ${Math.round(x.clear * 100)}%`).join(", "));
  ok(f.grid.w * f.grid.h > 0 && typeof f.frames[0].ndvi === "string" && Buffer.from(f.frames[0].ndvi, "base64").length === f.grid.w * f.grid.h, "greenness grid has one byte per pixel");
  ok(f.stats.length === f.frames.length && f.stats.at(-1).field.ndvi > 0.1 && f.stats.at(-1).field.ndvi < 1, "field-level greenness is plausible", JSON.stringify(f.stats.at(-1).field));
  ok(f.series.length >= 3, "a history of passes comes with it", `${f.series.length} passes`);
  ok(f.box.west < Math.min(...f.polygon.map((p) => p[0])) && f.box.east > Math.max(...f.polygon.map((p) => p[0])), "the scene box contains the outline");
  ok(Number.isFinite(f.sideM) && f.sideM >= 500, "the scene is at least 500 m", `${f.sideM} m`);
  ok(!f.zones || (f.zones.list.length >= 2 && Math.abs(f.zones.list.reduce((s, z) => s + z.areaHa, 0) - saved.areaHa) < 0.06), "zones (when any) add up to the field's area", f.zones ? f.zones.list.map((z) => `${z.id}:${z.areaHa}`).join(" ") : "no zones: an even or small field");
  const text = JSON.stringify(f);
  ok(!/CDSE|client_secret|Bearer |access_token/i.test(text), "no key, token or secret in the payload");
  const t1 = Date.now();
  const again = await A("/api/field");
  ok(again.status === 200 && Date.now() - t1 < 800, "the second request is served from the cache", `${Date.now() - t1} ms`);
}

// privacy: another farmer sees only their own field
const B = client();
ok(await signUp(B, "b"), "farmer B signs up");
ok((await B("/api/field")).status === 404, "B has no farm, so no field (A's is not leaked)");
r = await B("/api/farm", { method: "PUT", body: JSON.stringify(farmBody({ polygon: square().map(([x, y]) => [x + 0.02, y]) })) });
const fb = await json(await B("/api/field"));
ok(r.status === 200 && (fb.polygon ? Math.abs(fb.polygon[0][0] - (square()[0][0] + 0.02)) < 1e-4 : false), "B's field is B's own outline");

// removing the outline removes the satellite view
r = await A("/api/farm", { method: "PUT", body: JSON.stringify(farmBody({ lat: 36.687, lon: 10.573, areaHa: 1, polygon: null })) });
ok(r.status === 200 && (await json(r)).farm.polygon === null, "an outline can be removed");
ok((await A("/api/field")).status === 404, "…and then there is no satellite view");

console.log(failed ? `\n${failed} check(s) failed` : "\nField smoke test OK");
process.exit(failed ? 1 : 0);
