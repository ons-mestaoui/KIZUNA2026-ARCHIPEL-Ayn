// Multi-plot smoke test: create multiple plots, switch between them, log independently, delete.
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

const plotData = (name, crop, areaHa) => ({
  name,
  lat: 36.4561,
  lon: 10.7376,
  placeName: "Nabeul",
  crop,
  plantingDate: null,
  areaHa,
  soilTexture: "loam",
  irrigationMethod: "drip",
  waterSource: "solar_basin",
  basinM3: 100,
  pvKWp: 6,
  pumpHeadM: 15,
  wellSafeYieldM3h: 40,
  lastIrrigated: "3-5d",
  lang: "en",
});

const A = client();
const email = `farmer+plots+${Date.now()}@example.com`;
let r = await A("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name: "Plot Farmer", email, password: "smoke-test-pass-123" }) });
ok(r.status === 200, "farmer signs up");

// 1. Create first plot via PUT
r = await A("/api/farm", { method: "PUT", body: JSON.stringify(plotData("Verger Nord", "olive", 2)) });
const p1 = (await json(r)).farm;
ok(r.status === 200 && p1?.name === "Verger Nord", "Plot 1 created via PUT", `id: ${p1?.id}`);

// 2. Create second plot via POST
r = await A("/api/farm", { method: "POST", body: JSON.stringify(plotData("Parcelle Sud", "citrus", 3.5)) });
const p2 = (await json(r)).farm;
ok(r.status === 200 && p2?.name === "Parcelle Sud", "Plot 2 created via POST", `id: ${p2?.id}`);
ok(p1.id !== p2.id, "Both plots have distinct IDs");

// 3. GET /api/farm returns both plots and active plot is Plot 2
r = await A("/api/farm");
const farmRes = await json(r);
ok(farmRes.farms?.length === 2, "Farmer has 2 plots", `found: ${farmRes.farms?.length}`);
ok(farmRes.farm?.id === p2.id, "Active plot is Plot 2 after creation");

// 4. GET /api/state reflects active plot
r = await A("/api/state");
let stateRes = await json(r);
ok(stateRes.farm?.name === "Parcelle Sud" && stateRes.farm?.crop === "citrus", "State reflects active plot (Parcelle Sud)");
ok(stateRes.farms?.length === 2, "State includes all plots");

// 5. Switch to Plot 1
r = await A("/api/farm/switch", { method: "POST", body: JSON.stringify({ farmId: p1.id }) });
ok(r.status === 200, "Switched to Plot 1 (Verger Nord)");

r = await A("/api/state");
stateRes = await json(r);
ok(stateRes.farm?.id === p1.id && stateRes.farm?.name === "Verger Nord", "Active plot in state is now Verger Nord");

// 6. Log water on Plot 1
r = await A("/api/irrigation", { method: "POST", body: JSON.stringify({ m3: 30, source: "manual" }) });
const logP1 = await json(r);
ok(r.status === 200 && Number.isInteger(logP1.id), "Logged 30 m³ on Plot 1");

r = await A("/api/state");
stateRes = await json(r);
ok(stateRes.logsToday?.some((l) => l.id === logP1.id), "Plot 1 has today's log");

// 7. Switch back to Plot 2 and check isolation
r = await A("/api/farm/switch", { method: "POST", body: JSON.stringify({ farmId: p2.id }) });
ok(r.status === 200, "Switched back to Plot 2");

r = await A("/api/state");
stateRes = await json(r);
ok(stateRes.farm?.id === p2.id, "Active plot is Plot 2");
ok(!stateRes.logsToday?.some((l) => l.id === logP1.id), "Plot 2 does not have Plot 1's irrigation log (isolation verified)");

// 8. Delete Plot 2
r = await A(`/api/farm?id=${p2.id}`, { method: "DELETE" });
const delRes = await json(r);
ok(r.status === 200 && delRes.ok === true, "Plot 2 deleted successfully");
ok(delRes.activeId === p1.id, "Active plot fell back to Plot 1");

// 9. Cannot delete last plot
r = await A(`/api/farm?id=${p1.id}`, { method: "DELETE" });
ok(r.status === 400, "Cannot delete last remaining plot (HTTP 400)");

if (failed === 0) {
  console.log("\nAll multi-plot checks passed successfully!");
} else {
  console.error(`\n${failed} checks failed.`);
  process.exit(1);
}
