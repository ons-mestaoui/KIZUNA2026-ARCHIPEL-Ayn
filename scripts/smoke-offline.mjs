// The demo's "saved answers" mode: no AI call, no internet needed for these.   node scripts/smoke-offline.mjs [baseUrl]
//
// Start the server with DEMO_OFFLINE=1 (and DEMO_ENTRY=1 + DEMO_PASSWORD), e.g. in PowerShell:
//   $env:DEMO_OFFLINE = "1"; npm start
// then run this against it. It checks that the demo door, the Leaf check and Ask all answer from saved
// content, in all three languages, and that every such answer is marked as saved (the interface shows a
// "Saved demo answer" label, so nobody mistakes it for the live AI).
//
// To rehearse a real outage on the same machine, also start the server with a dead proxy so every outgoing
// request fails (Node 24+):  $env:NODE_USE_ENV_PROXY = "1"; $env:HTTPS_PROXY = "http://127.0.0.1:9";
//   $env:NO_PROXY = "localhost,127.0.0.1"
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(base).origin;
let failed = 0;
const ok = (c, label, extra = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
  if (!c) failed++;
};

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
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  return res;
};

let r = await call("/api/demo/enter", { headers: { "Sec-Fetch-Site": "none" } });
ok(r.status === 303 && jar.size > 0, "the demo door signs in", `HTTP ${r.status}`);
if (r.status !== 303) {
  console.log("\nThe demo is not switched on here: set DEMO_ENTRY=1 and DEMO_PASSWORD, then restart the server.");
  process.exit(1);
}

// a 1×1 JPEG: saved answers do not look at the picture, the route only checks that it is a data-URL image
const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
const script = { ar: /[؀-ۿ]/, ja: /[぀-ヿ一-鿿]/, en: /[A-Za-z]/ };
for (const lang of ["ar", "en", "ja"]) {
  r = await call("/api/diagnose", { method: "POST", body: JSON.stringify({ image: TINY_JPEG, lang }) });
  const j = await r.json().catch(() => ({}));
  ok(r.status === 200 && j.model === "saved" && j.cached === true && script[lang].test(j.result?.name ?? ""), `leaf photo → saved diagnosis (${lang})`, `HTTP ${r.status} model=${j.model ?? j.error} "${(j.result?.name ?? "").slice(0, 40)}"`);
}
if (jar.size && failed > 0) console.log("   (if model is not 'saved', the server was started without DEMO_OFFLINE=1)");

const asks = [
  ["en", "Will it rain this week?", /light rain/i],
  ["en", "Should I water tomorrow?", /Water only/i],
  ["en", "How should I run the solar pump?", /solar pump/i],
  ["en", "My leaves are turning yellow", /Leaf check/i],
  ["en", "What is the capital of France?", /saved demo mode/i],
  ["ar", "نسقي غدوة؟", /[؀-ۿ]/],
  ["ja", "雨は降りますか？", /雨/],
];
for (const [lang, message, expect] of asks) {
  r = await call("/api/ask", { method: "POST", body: JSON.stringify({ message, lang }) });
  const j = await r.json().catch(() => ({}));
  ok(r.status === 200 && j.model === "saved" && expect.test(j.reply ?? ""), `ask "${message}" → saved answer`, `HTTP ${r.status} ${(j.reply ?? j.error ?? "").slice(0, 50)}`);
}

r = await call("/api/ask");
const history = await r.json().catch(() => ({ items: [] }));
const answers = history.items.filter((m) => m.role === "assistant");
ok(answers.length >= asks.length && answers.every((m) => m.saved === true), "the chat history marks every answer as saved", `${answers.filter((m) => m.saved).length}/${answers.length}`);

console.log(failed ? `\n${failed} check(s) failed` : "\nSaved-answer checks passed");
process.exit(failed ? 1 : 0);
