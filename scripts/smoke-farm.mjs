// Farm API smoke test against any deployment.   node scripts/smoke-farm.mjs [baseUrl]
// Two farmers: state, 7-day plan, logging water, squeeze test, undo, and that nobody can touch the other's data.
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(base).origin;
let failed = 0;
const ok = (c, label, extra = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
  if (!c) failed++;
};

function client() {
  const jar = new Map();
  const absorb = (res) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || /max-age=0/i.test(line)) jar.delete(k);
      else jar.set(k, v);
    }
  };
  return async (path, init = {}) => {
    const res = await fetch(base + path, {
      redirect: "manual",
      ...init,
      headers: { Origin: origin, "Content-Type": "application/json", ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...init.headers },
    });
    absorb(res);
    return res;
  };
}
const json = async (r) => r.json().catch(() => ({}));

const farmBody = (over = {}) => ({
  name: "Smoke farm",
  lat: 36.4561,
  lon: 10.7376,
  placeName: "Nabeul",
  crop: "olive",
  plantingDate: null,
  areaHa: 2,
  soilTexture: "loam",
  irrigationMethod: "drip",
  waterSource: "solar_basin",
  basinM3: 100,
  pvKWp: 6,
  pumpHeadM: 15,
  wellSafeYieldM3h: 40,
  lastIrrigated: "3-5d",
  lang: "en",
  ...over,
});

const signUp = async (call, tag) => {
  const r = await call("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name: tag, email: `farm+${tag}+${Date.now()}@example.com`, password: "smoke-test-pass-123" }) });
  return r.status === 200;
};

const A = client();
const B = client();

ok(await signUp(A, "a"), "farmer A signs up");
ok(await signUp(B, "b"), "farmer B signs up");

let r = await A("/api/state");
ok(r.status === 404, "no farm yet → /api/state is 404", `HTTP ${r.status}`);

r = await A("/api/farm", { method: "PUT", body: JSON.stringify(farmBody()) });
const saved = (await json(r)).farm;
ok(r.status === 200 && saved?.crop === "olive", "farm saved", `HTTP ${r.status}`);

r = await A("/api/state");
const s = await json(r);
ok(r.status === 200, "/api/state works (live Open-Meteo forecast)", `HTTP ${r.status} ${s.error ?? ""}`);
if (r.status === 200) {
  ok(s.week?.length === 7, "7-day plan", `${s.week?.length} days: ${s.week?.map((d) => d.plan.decision[0]).join("")}`);
  ok(s.week?.[0]?.plan?.date === s.today, "week starts today (farm-local)", `${s.today}, tz ${s.tz}, hour ${s.localHour?.toFixed(1)}`);
  ok(s.week?.[0]?.plan?.source === "solar_basin", "plan knows the water source");
  ok(s.depletionMm >= 0 && s.week[0].plan.tawMm > 0, "depletion within range", `${s.depletionMm} of ${s.week[0].plan.tawMm} mm`);
  ok(s.daily?.length >= 7, "daily weather summary", `${s.daily?.length} days`);
  const before = s.depletionMm;

  // log some water → depletion drops
  r = await A("/api/irrigation", { method: "POST", body: JSON.stringify({ m3: 40, source: "manual" }) });
  const log = await json(r);
  ok(r.status === 200 && Number.isInteger(log.id), "log 40 m³", `id ${log.id}`);
  const s2 = await json(await A("/api/state"));
  ok(s2.depletionMm < before, "logging water lowers depletion", `${before} → ${s2.depletionMm} mm`);
  ok(s2.logsToday?.some((l) => l.id === log.id), "today's log is listed");

  // B cannot delete A's log
  r = await B("/api/irrigation?id=" + log.id, { method: "DELETE" });
  const s3 = await json(await A("/api/state"));
  ok(s3.logsToday?.some((l) => l.id === log.id), "another farmer cannot delete my log", `B's DELETE → HTTP ${r.status}`);

  // undo
  await A("/api/irrigation?id=" + log.id, { method: "DELETE" });
  const s4 = await json(await A("/api/state"));
  ok(Math.abs(s4.depletionMm - before) < 0.2, "undo restores the estimate", `${s4.depletionMm} ≈ ${before}`);

  // squeeze test re-anchors
  await A("/api/soil-check", { method: "POST", body: JSON.stringify({ feel: "dry" }) });
  const dry = await json(await A("/api/state"));
  await A("/api/soil-check", { method: "POST", body: JSON.stringify({ feel: "wet" }) });
  const wet = await json(await A("/api/state"));
  ok(dry.depletionMm > wet.depletionMm + 20, "squeeze test dry vs wet re-anchors the estimate", `dry ${dry.depletionMm} / wet ${wet.depletionMm} mm`);
  ok(wet.lastCheck?.feel === "wet", "last check is remembered");
}

r = await A("/api/irrigation", { method: "POST", body: JSON.stringify({ m3: -5 }) });
ok(r.status === 422, "negative amount rejected", `HTTP ${r.status}`);
r = await A("/api/soil-check", { method: "POST", body: JSON.stringify({ feel: "soggy" }) });
ok(r.status === 422, "unknown soil feel rejected", `HTTP ${r.status}`);

r = await B("/api/state");
ok(r.status === 404, "farmer B still has no farm (A's data is not visible)", `HTTP ${r.status}`);
r = await client()("/api/state");
ok(r.status === 401, "anonymous → 401", `HTTP ${r.status}`);

// every water source yields a real plan through the API
for (const src of ["solar_direct", "grid", "diesel", "network"]) {
  await A("/api/farm", { method: "PUT", body: JSON.stringify(farmBody({ waterSource: src, basinM3: 0 })) });
  await A("/api/soil-check", { method: "POST", body: JSON.stringify({ feel: "dry" }) });
  const st = await json(await A("/api/state"));
  const p = st.week?.[0]?.plan;
  ok(p?.source === src && (p?.decision === "skip" || p?.grossM3 > 0 || p?.limitedBy), `${src}: real plan`, `${p?.decision} ${p?.grossM3} m³ ${p?.limitedBy ? "limited by " + p.limitedBy : ""}`);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll farm checks passed");
process.exit(failed ? 1 : 0);
