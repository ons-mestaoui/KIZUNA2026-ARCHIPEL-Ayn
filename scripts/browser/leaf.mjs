// Leaf check on a phone: upload a photo, read the result, press Listen.   node scripts/browser/leaf.mjs <base> <outDir> <image> [lang]
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", image, lang = "en"] = process.argv;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };
const api = (path, init) => page.evaluate(async (p, i) => { const r = await fetch(p, i); return { status: r.status }; }, path, init);
const J = (b) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

await page.goto(`${base}/sign-in`, { waitUntil: "networkidle0" });
await api("/api/auth/sign-up/email", J({ name: "Amel", email: `leaf+${Date.now()}@example.com`, password: "leaf-test-pass-1" }));
const planted = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
await api("/api/farm", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
  name: "Tomato", lat: 36.4561, lon: 10.7376, placeName: "Nabeul", crop: "tomato", plantingDate: planted, areaHa: 1, soilTexture: "sandy_loam",
  irrigationMethod: "drip", waterSource: "solar_basin", basinM3: 60, pvKWp: 3, pumpHeadM: 15, wellSafeYieldM3h: 20, lastIrrigated: "1-2d", lang }) });

await page.goto(`${base}/app`, { waitUntil: "networkidle0", timeout: 60000 });
await wait(2500);
// open the Leaf tab (3rd tab in the bottom bar)
await page.evaluate(() => document.querySelectorAll("nav ul li button")[7 - 5]?.click()); // bottom bar buttons: today, week, leaf…
await wait(300);
const opened = await page.evaluate(() => !!document.querySelector('input[type="file"]'));
if (!opened) await page.evaluate(() => { const b = [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent)[2]; b?.click(); });
await wait(800);
ok(await page.evaluate(() => !!document.querySelector('input[type="file"][capture="environment"]')), "Leaf tab opens a camera input (capture=environment)");
await page.screenshot({ path: `${out}/leaf-${lang}-1-start.png`, fullPage: true });

const inputs = await page.$$('input[type="file"]');
const gallery = inputs[1];
const t0 = Date.now();
await gallery.uploadFile(image);
await page.waitForSelector("article", { timeout: 90000 }).catch(() => {});
const took = Date.now() - t0;
const hasResult = await page.evaluate(() => !!document.querySelector("article"));
ok(hasResult, "a diagnosis card appears", `${took} ms`);
await wait(500);
const text = await page.evaluate(() => document.querySelector("article")?.innerText ?? "");
console.log("   ", text.replace(/\n+/g, " | ").slice(0, 420));
ok(/Tuta|leafminer|مينور|سوسة|توتا|ハモグリ|イモムシ|害虫|Pest|آفة/i.test(text), "the cause is named");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(overflow <= 0, "no horizontal overflow", `${overflow}px`);
await page.screenshot({ path: `${out}/leaf-${lang}-2-result.png`, fullPage: true });

// Listen → /api/tts
const ttsHit = page.waitForResponse((r) => r.url().includes("/api/tts"), { timeout: 20000 }).catch(() => null);
await page.evaluate(() => { const b = [...document.querySelectorAll("article button")].find((x) => x.getAttribute("aria-pressed") !== null); b?.click(); });
const resp = await ttsHit;
ok(resp && resp.status() === 200, "Listen requests the voice", resp ? `HTTP ${resp.status()}, ${resp.headers()["content-type"]}` : "no request");

ok(errors.filter((e) => !/status of 4\d\d/.test(e)).length === 0, "no console errors", errors.slice(0, 2).join(" | ").slice(0, 300));
console.log(failed ? `\n${failed} check(s) failed` : "\nLeaf UI OK");
await browser.close();
process.exit(failed ? 1 : 0);
