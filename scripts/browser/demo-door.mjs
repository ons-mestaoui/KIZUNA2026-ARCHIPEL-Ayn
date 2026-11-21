// The demo's QR code and its e-mail door.   node scripts/browser/demo-door.mjs <base> <outDir> [lanBase]
//   base    = how the presenter opens the demo, e.g. http://localhost:3000
//   lanBase = optional: the laptop's Wi-Fi address as a phone would use it, e.g. http://192.168.1.20:3000
// Reads DEMO_PASSWORD from the project's .env.local (never printed).
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", lanBase = ""] = process.argv;
try { process.loadEnvFile(process.env.ENV_FILE ?? ".env.local"); } catch {}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const errors = [];
async function openDemo(origin) {
  const page = await browser.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem("gd-lang", "en"); } catch {} });
  await page.goto(`${origin}/?demo=kizuna`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => location.pathname === "/demo", { timeout: 30000 }).catch(() => {});
  await wait(3500);
  return page;
}
const qrTarget = (page) => page.evaluate(() => document.querySelector('section[aria-labelledby="join"] img')?.alt ?? "");
const privateIp = /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+:\d+\/sign-up$/;

// ---- the QR code, opened through localhost (how a presenter would) ----
let page = await openDemo(base);
ok(new URL(page.url()).pathname === "/demo", "the demo opens", page.url());
await page.evaluate(() => document.querySelector('section[aria-labelledby="join"]')?.scrollIntoView());
await wait(1500);
let target = await qrTarget(page);
const viaLoopback = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(base).hostname);
if (viaLoopback) ok(privateIp.test(target), "opened on localhost, the QR code points at the laptop's Wi-Fi address", target);
else ok(target === `${new URL(base).origin}/sign-up`, "the QR code points at the address the page was opened from", target);
ok(!/localhost|127\.0\.0\.1/.test(target) || !viaLoopback, "…never at localhost, which a phone cannot open");
const hasImage = await page.evaluate(() => { const i = document.querySelector('section[aria-labelledby="join"] img'); return !!i && i.naturalWidth > 100; });
ok(hasImage, "the QR image is rendered");
await page.screenshot({ path: `${out}/door-1-qr.png` });
await page.close();

// ---- opened through the LAN address (a second device, or the presenter using the Wi-Fi address) ----
if (lanBase) {
  page = await openDemo(lanBase);
  target = await qrTarget(page);
  ok(target === `${new URL(lanBase).origin}/sign-up`, "opened on the Wi-Fi address, the QR code uses that address", target);
  await page.close();
}

// ---- the e-mail door starts a fresh demo ----
page = await openDemo(base);
const api = (path, init) => page.evaluate(async (p, i) => { const r = await fetch(p, i); return { status: r.status, body: await r.json().catch(() => ({})) }; }, path, init);
const logged = await api("/api/irrigation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ m3: 12, source: "manual" }) });
ok(logged.status === 200, "the demo farm is changed (12 m³ logged)", `HTTP ${logged.status}`);
let st = await api("/api/state");
ok(st.body.logsToday?.length === 1, "…and the change is visible", `${st.body.logsToday?.length} logged`);

await page.evaluate(() => document.querySelector('button[aria-label="Leave demo"]')?.click());
await page.waitForFunction(() => location.pathname === "/", { timeout: 15000 }).catch(() => {});
ok(new URL(page.url()).pathname === "/", "leaving the demo returns to the landing page", page.url());

if (!process.env.DEMO_PASSWORD) {
  console.log("SKIP  e-mail door (no DEMO_PASSWORD in .env.local)");
} else {
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle0" });
  await page.type('input[name="email"]', "demo@goutte-dor.app");
  await page.type('input[name="password"]', process.env.DEMO_PASSWORD);
  await Promise.all([page.waitForFunction(() => location.pathname === "/demo", { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
  await wait(3000);
  ok(new URL(page.url()).pathname === "/demo", "signing in with the demo e-mail opens the demo", page.url());
  st = await api("/api/state");
  ok(st.body.logsToday?.length === 0, "…and it starts from a fresh demo farm", `${st.body.logsToday?.length} logged`);
  await page.screenshot({ path: `${out}/door-2-email.png` });
}

ok(errors.filter((e) => !/status of [45]\d\d|Failed to load resource|ERR_|net::/.test(e)).length === 0, "no unexpected console errors", errors.slice(0, 2).join(" | ").slice(0, 300));
console.log(failed ? `\n${failed} check(s) failed` : "\nDemo door OK");
await browser.close();
process.exit(failed ? 1 : 0);
