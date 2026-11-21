// Satellite metrics around a farm.   node scripts/smoke-satellite.mjs [baseUrl] [lat] [lon]
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const lat = Number(process.argv[3] ?? 36.4561);
const lon = Number(process.argv[4] ?? 10.7376);
const origin = new URL(base).origin;
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`); if (!c) failed++; };

const jar = new Map();
const call = async (path, init = {}) => {
  const res = await fetch(base + path, { redirect: "manual", ...init, headers: { Origin: origin, "Content-Type": "application/json", ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...init.headers } });
  for (const line of res.headers.getSetCookie?.() ?? []) { const [pair] = line.split(";"); const i = pair.indexOf("="); jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
  return res;
};
await call("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name: "Sat", email: `sat+${Date.now()}@example.com`, password: "sat-test-pass-123" }) });
await call("/api/farm", { method: "PUT", body: JSON.stringify({ name: "Sat", lat, lon, placeName: "test", crop: "olive", plantingDate: null, areaHa: 1, soilTexture: "loam", irrigationMethod: "drip", waterSource: "grid", basinM3: 0, pvKWp: 0, pumpHeadM: 15, wellSafeYieldM3h: 20, lastIrrigated: "unknown", lang: "en" }) });

const expect = { rain: [0, 400], soil: [0, 100], heat: [-30, 70], ndvi: [-0.2, 1] };
for (const metric of ["rain", "soil", "heat", "ndvi"]) {
  for (const pass of ["first (cold)", "second (cached)"]) {
    const t0 = Date.now();
    const r = await call(`/api/satellite?metric=${metric}`);
    const j = await r.json().catch(() => ({}));
    const ms = Date.now() - t0;
    if (pass.startsWith("first")) {
      ok(r.status === 200, `${metric} ${pass}`, `${ms} ms ${j.error ?? ""}`);
      if (r.status === 200) {
        const p = j.points ?? [];
        console.log(`      ${p.length} days, newest file ${j.newestFile}, pixel ${j.pixelKm?.toFixed(1)} km, unit "${j.unit}": ` + p.map((x) => (x.value === null ? "–" : x.value.toFixed(metric === "ndvi" ? 2 : 1))).join(" "));
        const v = j.latest?.value;
        ok(v === undefined || (v >= expect[metric][0] && v <= expect[metric][1]), `${metric} latest value is physically plausible`, `${v?.toFixed?.(2)} ${j.unit} on ${j.latest?.date}, ${j.latest?.distKm?.toFixed(0)} km from the farm`);
      }
    } else if (r.status === 200) ok(ms < 1500, `${metric} second call is served from cache`, `${ms} ms`);
  }
}
const bad = await call("/api/satellite?metric=gold");
ok(bad.status === 422, "unknown metric rejected", `HTTP ${bad.status}`);
const anon = await fetch(base + "/api/satellite?metric=rain", { headers: { Origin: origin } });
ok(anon.status === 401, "anonymous → 401", `HTTP ${anon.status}`);
console.log(failed ? `\n${failed} check(s) failed` : "\nSatellite checks passed");
process.exit(failed ? 1 : 0);
