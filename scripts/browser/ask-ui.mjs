// Ask tab on a phone: suggestion → answer → photo question.   node scripts/browser/ask-ui.mjs <base> <outDir> <image> [lang]
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", image, lang = "en"] = process.argv;
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
await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };
const api = (path, init) => page.evaluate(async (p, i) => { const r = await fetch(p, i); return { status: r.status }; }, path, init);
const J = (b) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

await page.goto(`${base}/sign-in`, { waitUntil: "networkidle0" });
await api("/api/auth/sign-up/email", J({ name: "Amel", email: `askui+${Date.now()}@example.com`, password: "ask-test-pass-1" }));
const planted = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
await api("/api/farm", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
  name: "Tomato", lat: 36.4561, lon: 10.7376, placeName: "Nabeul", crop: "tomato", plantingDate: planted, areaHa: 1, soilTexture: "sandy_loam",
  irrigationMethod: "drip", waterSource: "solar_basin", basinM3: 60, pvKWp: 3, pumpHeadM: 15, wellSafeYieldM3h: 20, lastIrrigated: "1-2d", lang }) });

await page.goto(`${base}/app`, { waitUntil: "networkidle0", timeout: 60000 });
await wait(2500);
await page.evaluate(() => { const b = [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent)[3]; b?.click(); }); // today, week, leaf, ask
await wait(1200);
ok(await page.evaluate(() => !!document.querySelector("form textarea")), "Ask tab shows the input bar");
const chips = await page.evaluate(() => document.querySelectorAll('section[aria-labelledby="ask"] > ul li button').length);
ok(chips >= 4, "suggested questions are shown", `${chips} chips`);
await page.screenshot({ path: `${out}/ask-${lang}-1-start.png`, fullPage: false });

// the bar must sit above the bottom tab bar, not under it
const geo = await page.evaluate(() => {
  const form = document.querySelector("form").getBoundingClientRect();
  const bar = [...document.querySelectorAll("nav")].find((n) => getComputedStyle(n).position === "fixed" && getComputedStyle(n).display !== "none").getBoundingClientRect();
  return { formBottom: Math.round(form.bottom), tabTop: Math.round(bar.top) };
});
ok(geo.formBottom <= geo.tabTop + 1, "input bar sits above the tab bar", JSON.stringify(geo));

// tap a suggestion
const t0 = Date.now();
await page.evaluate(() => document.querySelector('section[aria-labelledby="ask"] > ul li button')?.click());
await page.waitForFunction(() => document.querySelectorAll("ol li button[aria-pressed]").length >= 1, { timeout: 60000 }).catch(() => {});
ok(await page.evaluate(() => document.querySelectorAll("ol li button[aria-pressed]").length >= 1), "an answer with a Listen button appears", `${Date.now() - t0} ms`);
console.log("   ", (await page.evaluate(() => [...document.querySelectorAll("ol li p")].map((p) => p.innerText).join(" || "))).slice(0, 360));
await page.screenshot({ path: `${out}/ask-${lang}-2-answer.png`, fullPage: false });

// a question with a photo
const fileInput = await page.$('form input[type="file"]');
await fileInput.uploadFile(image);
await page.waitForSelector("form img", { timeout: 15000 });
ok(true, "photo preview appears next to the input");
await page.type("form textarea", lang === "ar" ? "شنوا هذا؟" : lang === "ja" ? "これは何ですか？" : "What is this on my tomato leaf?");
const before = await page.evaluate(() => document.querySelectorAll("ol li").length);
await page.click('form button[type="submit"]');
await page.waitForFunction((n) => document.querySelectorAll("ol li").length >= n + 2 && !document.querySelector('[role="status"]'), { timeout: 60000 }, before).catch(() => {});
const after = await page.evaluate(() => document.querySelectorAll("ol li").length);
ok(after >= before + 2, "photo question answered", `${before} → ${after} bubbles`);
const last = await page.evaluate(() => [...document.querySelectorAll("ol li p")].map((p) => p.innerText).slice(-2).join(" || "));
console.log("   ", last.slice(0, 420));
ok(/📷/.test(last), "the question is marked as sent with a photo");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(overflow <= 0, "no horizontal overflow", `${overflow}px`);
await page.screenshot({ path: `${out}/ask-${lang}-3-photo.png`, fullPage: false });

ok(errors.filter((e) => !/status of 4\d\d/.test(e)).length === 0, "no console errors", errors.slice(0, 2).join(" | ").slice(0, 300));
console.log(failed ? `\n${failed} check(s) failed` : "\nAsk UI OK");
await browser.close();
process.exit(failed ? 1 : 0);
