// "Wi-Fi off" rehearsal for the demo. The server under test runs with DEMO_OFFLINE=1, an invalid Gemini key and
// all outbound HTTP blackholed, so every answer must come from the saved demo content and the bundled snapshots.
//   node scripts/browser/offline.mjs <base> <outDir> <leafImage>
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3002", out = ".", image] = process.argv;
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- part 1: the API, as the demo account ----------
const jar = new Map();
const call = async (path, init = {}) => {
  const res = await fetch(base + path, {
    redirect: "manual",
    ...init,
    headers: { Origin: base, "Content-Type": "application/json", ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...init.headers },
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    jar.set(kv.slice(0, i), kv.slice(i + 1));
  }
  return res;
};

let r = await call("/api/demo/enter", { headers: { "Sec-Fetch-Site": "none" } });
ok(r.status === 303 && jar.size > 0, "demo door signs in (no network needed)", `HTTP ${r.status}`);

const TINY_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
const script = { ar: /[\u0600-\u06FF]/, ja: /[\u3040-\u30ff\u4e00-\u9fff]/, en: /[A-Za-z]/ };
for (const lang of ["ar", "en", "ja"]) {
  r = await call("/api/diagnose", { method: "POST", body: JSON.stringify({ image: TINY_JPEG, lang }) });
  const j = await r.json().catch(() => ({}));
  ok(r.status === 200 && j.model === "saved" && j.cached === true && script[lang].test(j.result?.name ?? ""), `leaf photo → saved answer (${lang})`, `HTTP ${r.status} model=${j.model} "${(j.result?.name ?? j.error ?? "").slice(0, 40)}"`);
}

const asks = [
  ["en", "Will it rain this week?", /light rain/i],
  ["en", "Should I water tomorrow?", /Water only/i],
  ["en", "How should I run the solar pump?", /solar pump/i],
  ["en", "My leaves are turning yellow", /Leaf check/i],
  ["en", "What is the capital of France?", /saved demo mode/i],
  ["ar", "نسقي غدوة؟", /[\u0600-\u06FF]/],
  ["ja", "雨は降りますか？", /雨/],
];
for (const [lang, message, expect] of asks) {
  r = await call("/api/ask", { method: "POST", body: JSON.stringify({ message, lang }) });
  const j = await r.json().catch(() => ({}));
  ok(r.status === 200 && j.model === "saved" && expect.test(j.reply ?? ""), `ask "${message}" → saved answer`, `HTTP ${r.status} ${(j.reply ?? j.error ?? "").slice(0, 60)}`);
}

r = await call("/api/weather");
const w = await r.json().catch(() => ({}));
ok(r.status === 200 && w.stale === true && !!w.scenario, "weather falls back to the bundled snapshot", `HTTP ${r.status} stale=${w.stale}`);

for (const path of ["/api/state", "/api/satellite?metric=rain", "/api/satellite?metric=soil"]) {
  const t0 = Date.now();
  r = await call(path);
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  // a clear "unavailable" (503), never an empty 200 that would look like "no data" and could be cached
  ok(Date.now() - t0 < 30000 && r.status === 503 && !!body?.error, `${path} says "unavailable" with no network`, `HTTP ${r.status} in ${Date.now() - t0} ms: ${text.slice(0, 70).replace(/\s+/g, " ")}`);
}

// the saved label must survive a reload of the chat (history comes back from the server)
r = await call("/api/ask");
const hist = await r.json().catch(() => ({ items: [] }));
const answersInHistory = hist.items.filter((m) => m.role === "assistant");
ok(answersInHistory.length >= 7 && answersInHistory.every((m) => m.saved === true), "chat history marks every demo answer as saved", `${answersInHistory.length} answers, ${answersInHistory.filter((m) => m.saved).length} marked`);

// ---------- part 2: the browser, through the hidden door ----------
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => {
  try { localStorage.setItem("gd-lang", "en"); } catch {}
  // record what the browser's own voice is asked to say (headless Chrome has no real voices)
  window.__spoken = [];
  try { speechSynthesis.speak = (u) => { window.__spoken.push({ text: u.text, lang: u.lang }); }; } catch {}
});
// the server voice is unreachable in this rehearsal
await page.setRequestInterception(true);
page.on("request", (req) => (req.url().includes("/api/tts") ? req.abort("failed") : req.continue()));

await page.goto(`${base}/?demo=kizuna`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => location.pathname === "/demo", { timeout: 30000 }).catch(() => {});
await wait(3500);
ok(new URL(page.url()).pathname === "/demo", "?demo=kizuna lands on /demo", page.url());

const navButtons = () => page.evaluate(() => [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent).length);
ok((await navButtons()) >= 4, "four demo tabs are visible", `${await navButtons()} buttons`);
const tap = (i) => page.evaluate((n) => [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent)[n]?.click(), i);
const twinText = await page.evaluate(() => document.body.innerText);
ok(/water|irrigat/i.test(twinText) && !/application error|something went wrong/i.test(twinText), "twin tab shows the plan from the bundled snapshot");
await page.screenshot({ path: `${out}/offline-1-twin.png` });

await tap(1); // Leaf check
await wait(800);
const inputs = await page.$$('input[type="file"]');
ok(inputs.length >= 2, "Leaf tab has its camera and gallery inputs");
await inputs[1]?.uploadFile(image);
await page.waitForSelector("article", { timeout: 30000 }).catch(() => {});
const leafText = await page.evaluate(() => document.querySelector("article")?.innerText ?? "");
ok(leafText.length > 40, "a diagnosis card appears with no network", leafText.replace(/\s+/g, " ").slice(0, 80));
ok(/Saved demo answer/i.test(await page.evaluate(() => document.body.innerText)), "the card is labelled 'Saved demo answer'");
await page.screenshot({ path: `${out}/offline-2-leaf.png`, fullPage: true });

await tap(2); // Ask
await wait(1000);
await page.evaluate(() => document.querySelector('section[aria-labelledby="ask"] > ul li button')?.click());
await page.waitForFunction(() => document.querySelectorAll("ol li button[aria-pressed]").length >= 1, { timeout: 30000 }).catch(() => {});
const answered = await page.evaluate(() => document.querySelectorAll("ol li button[aria-pressed]").length);
ok(answered >= 1, "a suggested question is answered with no network", `${answered} answers`);
ok(/Saved demo answer/i.test(await page.evaluate(() => document.body.innerText)), "the answer is labelled 'Saved demo answer'");
await page.screenshot({ path: `${out}/offline-3-ask.png` });

// leave the Ask tab and come back: the history is reloaded from the server and must still be labelled
await tap(0);
await wait(500);
await tap(2);
await page.waitForFunction(() => document.querySelectorAll("ol li").length >= 2, { timeout: 15000 }).catch(() => {});
ok(/Saved demo answer/i.test(await page.evaluate(() => document.body.innerText)), "the label is still there after leaving and re-opening Ask");

// Listen with the server voice down → the browser's own voice reads the saved answer
await page.evaluate(() => document.querySelector("ol li button[aria-pressed]")?.click());
await wait(1500);
const spoken = await page.evaluate(() => window.__spoken);
ok(spoken.length === 1 && /Water only/i.test(spoken[0].text) && spoken[0].lang === "en-GB", "Listen falls back to the browser voice when the server voice is down", JSON.stringify(spoken[0] ?? null).slice(0, 110));

await tap(3); // Satellite
await page.waitForFunction(() => document.querySelectorAll("article button").length >= 4, { timeout: 30000 }).catch(() => {});
const satText = await page.evaluate(() => document.body.innerText);
const retries = await page.evaluate(() => [...document.querySelectorAll("article button")].filter((b) => /try again/i.test(b.innerText)).length);
ok(page.url().includes("/demo") && !/application error|something went wrong/i.test(satText), "Satellite tab does not crash with no network");
ok(/Could not reach the satellite data/i.test(satText) && retries === 4, "each satellite card says it could not reach the data, with a retry button", `${retries} retry buttons`);
ok(!/clouds or satellite gaps/i.test(satText), "…and does not blame clouds");
await page.screenshot({ path: `${out}/offline-4-satellite.png`, fullPage: true });

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(overflow <= 0, "no horizontal overflow", `${overflow}px`);
const real = errors.filter((e) => !/status of [45]\d\d|Failed to load resource|ERR_|net::/.test(e));
ok(real.length === 0, "no unexpected console errors", real.slice(0, 2).join(" | ").slice(0, 300));
if (errors.length) console.log(`   (${errors.length} expected network errors ignored)`);

console.log(failed ? `\n${failed} check(s) failed` : "\nOffline rehearsal OK");
await browser.close();
process.exit(failed ? 1 : 0);
