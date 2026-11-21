// The demo's door, reset and isolation.   node scripts/smoke-demo.mjs [baseUrl]
// Reads DEMO_PASSWORD from .env.local to also try the normal sign-in form's route.
try {
  process.loadEnvFile(".env.local");
} catch {}
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(base).origin;
let failed = 0;
const ok = (c, label, extra = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
  if (!c) failed++;
};
const client = () => {
  const jar = new Map();
  const call = async (path, init = {}) => {
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
  call.jar = jar;
  return call;
};

const demo = client();
let r = await demo("/api/demo/enter");
ok(r.status === 303 && r.headers.get("location") === "/demo", "the entry signs in and redirects to /demo", `HTTP ${r.status} → ${r.headers.get("location")}`);
ok(demo.jar.size > 0, "…and hands over a session cookie", [...demo.jar.keys()].join(", "));

r = await demo("/demo");
ok(r.status === 200, "/demo opens for the demo session", `HTTP ${r.status}`);
r = await demo("/api/auth/get-session");
const sess = await r.json();
ok(sess?.user?.email === "demo@goutte-dor.app", "the session is the demo account");

r = await demo("/api/farm");
const farm = (await r.json()).farm;
ok(farm?.crop === "citrus" && farm?.waterSource === "solar_basin" && farm?.basinM3 === 80, "the demo farm is the Cap Bon citrus parcel", `${farm?.crop}, ${farm?.waterSource}, ${farm?.basinM3} m³`);

// make a mess, then reset
await demo("/api/irrigation", { method: "POST", body: JSON.stringify({ m3: 25, source: "manual" }) });
await demo("/api/soil-check", { method: "POST", body: JSON.stringify({ feel: "wet" }) });
let st = await (await demo("/api/state")).json();
ok(st.logsToday?.length === 1 && st.lastCheck?.feel === "wet", "the demo can be changed (water logged, soil checked)");

r = await demo("/api/demo/reset", { method: "POST" });
ok(r.status === 200, "reset works for the demo account", `HTTP ${r.status}`);
st = await (await demo("/api/state")).json();
ok(st.logsToday?.length === 0 && st.lastCheck === null, "reset clears logs and soil checks");

// entering again also resets
await demo("/api/irrigation", { method: "POST", body: JSON.stringify({ m3: 10, source: "manual" }) });
const again = client();
await again("/api/demo/enter");
st = await (await again("/api/state")).json();
ok(st.logsToday?.length === 0, "entering again starts from a clean demo");

// the normal sign-in form works with the demo e-mail too
if (process.env.DEMO_PASSWORD) {
  const form = client();
  r = await form("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email: "demo@goutte-dor.app", password: process.env.DEMO_PASSWORD }) });
  ok(r.status === 200, "signing in with the demo e-mail works", `HTTP ${r.status}`);
  r = await form("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email: "demo@goutte-dor.app", password: "wrong-password-123" }) });
  ok(r.status === 401, "…and a wrong password does not", `HTTP ${r.status}`);
}

// a page on another site must not be able to trigger the entry (an <img> or a link would be enough)
r = await fetch(base + "/api/demo/enter", { redirect: "manual", headers: { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate" } });
ok(r.status === 403, "a cross-site request to the entry is refused", `HTTP ${r.status}`);
r = await fetch(base + "/api/demo/enter", { redirect: "manual", headers: { "Sec-Fetch-Site": "same-origin" } });
ok(r.status === 303, "…while a same-site one works", `HTTP ${r.status}`);

// the QR code must open on a phone: on a laptop demo the page asks for the laptop's Wi-Fi address
r = await demo("/api/demo/lan");
const lan = await r.json().catch(() => ({}));
const viaLoopback = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(base).hostname);
const lanOk = viaLoopback ? lan.origin === null || /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+:?\d*$/.test(lan.origin ?? "") : lan.origin === null;
ok(r.status === 200 && lanOk, viaLoopback ? "on localhost the demo hands out the laptop's Wi-Fi address for the QR code" : "away from localhost no network details are handed out", `HTTP ${r.status} origin=${lan.origin}`);

// a normal farmer cannot touch the demo
const farmer = client();
await farmer("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name: "F", email: `demo-iso+${Date.now()}@example.com`, password: "demo-iso-pass-123" }) });
r = await farmer("/api/demo/reset", { method: "POST" });
ok(r.status === 403, "a normal farmer cannot reset the demo", `HTTP ${r.status}`);
r = await client()("/api/demo/reset", { method: "POST" });
ok(r.status === 401, "anonymous cannot reset the demo", `HTTP ${r.status}`);
r = await farmer("/api/demo/lan");
ok(r.status === 403, "a normal farmer gets no network details", `HTTP ${r.status}`);
r = await client()("/api/demo/lan");
ok(r.status === 401, "anonymous gets no network details", `HTTP ${r.status}`);

console.log(failed ? `\n${failed} check(s) failed` : "\nDemo checks passed");
process.exit(failed ? 1 : 0);
