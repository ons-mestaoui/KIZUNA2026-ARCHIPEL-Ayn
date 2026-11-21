// Auth smoke test against any deployment.   node scripts/smoke-auth.mjs [baseUrl]
// Covers: public landing, guarded routes redirect, sign-up, session, guarded route with cookie,
// wrong password, sign-out. Run it against http://localhost:3000 and again against the Vercel URL.
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(base).origin;
let failed = 0;

const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
  if (!cond) failed++;
};

const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const absorb = (res) => {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (!value || /max-age=0/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
};
const call = async (path, init = {}) => {
  const res = await fetch(base + path, {
    redirect: "manual",
    ...init,
    headers: { Origin: origin, "Content-Type": "application/json", ...(jar.size ? { Cookie: cookieHeader() } : {}), ...init.headers },
  });
  absorb(res);
  return res;
};

const email = `smoke+${Date.now()}@example.com`;
const password = "smoke-test-pass-123";

let r = await call("/");
ok(r.status === 200, "landing page is public", `HTTP ${r.status}`);

r = await call("/app");
ok([302, 303, 307, 308].includes(r.status) && (r.headers.get("location") ?? "").includes("/sign-in"), "/app redirects to sign-in without a session", `HTTP ${r.status} → ${r.headers.get("location")}`);

r = await call("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name: "Smoke Test", email, password }) });
const up = await r.json().catch(() => ({}));
ok(r.status === 200 && up?.user?.email === email, "sign-up creates the user", `HTTP ${r.status} ${up?.code ?? ""}`);
ok(jar.size > 0, "sign-up sets a session cookie", [...jar.keys()].join(", "));

r = await call("/api/auth/get-session");
const sess = await r.json().catch(() => null);
ok(sess?.user?.email === email, "get-session returns the signed-in user");

r = await call("/app");
ok(r.status === 200, "/app is reachable with a session", `HTTP ${r.status}`);

r = await call("/api/health");
const health = await r.json().catch(() => ({}));
ok(r.status === 200 && health.ok === true, "database round-trip (/api/health)", `${health?.db?.ms ?? "?"} ms, remoteDb=${health?.config?.remoteDb}`);

r = await call("/api/health/deep", { headers: { Cookie: "" } });
ok(r.status === 401, "deep health refuses anonymous callers", `HTTP ${r.status}`);

if (process.argv.includes("--deep")) {
  r = await call("/api/health/deep");
  const deep = await r.json().catch(() => ({}));
  for (const k of ["ai", "tts", "jaxa", "copernicus"]) ok(deep?.[k]?.ok === true, `${k} works from this host`, `${deep?.[k]?.ms ?? "?"} ms — ${deep?.[k]?.detail ?? ""}`);
}

r = await call("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name: "Dup", email, password }) });
ok(r.status >= 400 && r.status < 500, "duplicate e-mail is rejected", `HTTP ${r.status}`);

r = await call("/api/auth/sign-out", { method: "POST", body: "{}" });
ok(r.status === 200, "sign-out works", `HTTP ${r.status}`);
r = await call("/api/auth/get-session");
const after = await r.json().catch(() => null);
ok(!after?.user, "session is gone after sign-out");

r = await call("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password: "wrong-password-xx" }) });
ok(r.status === 401, "wrong password → 401", `HTTP ${r.status}`);

r = await call("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
ok(r.status === 200, "sign-in with the right password works", `HTTP ${r.status}`);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll auth checks passed");
process.exit(failed ? 1 : 0);
