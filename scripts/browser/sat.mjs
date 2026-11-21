// Satellite tab on a phone.   node scripts/browser/sat.mjs <base> <outDir> [lang]
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", lang = "en"] = process.argv;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };
const J = (b) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

await page.goto(`${base}/sign-in`, { waitUntil: "networkidle0" });
await page.evaluate(async (j) => { await fetch("/api/auth/sign-up/email", j.up); await fetch("/api/farm", j.farm); }, {
  up: J({ name: "S", email: `sat+${Date.now()}@example.com`, password: "sat-test-pass-1" }),
  farm: { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Nabeul", lat: 36.4561, lon: 10.7376, placeName: "Nabeul", crop: "olive", plantingDate: null, areaHa: 1, soilTexture: "loam", irrigationMethod: "drip", waterSource: "solar_basin", basinM3: 60, pvKWp: 3, pumpHeadM: 15, wellSafeYieldM3h: 20, lastIrrigated: "1-2d", lang }) },
});
await page.goto(`${base}/app`, { waitUntil: "networkidle0", timeout: 60000 });
await wait(2500);
await page.evaluate(() => [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent)[4]?.click()); // today, week, leaf, ask, satellite
await page.waitForFunction(() => document.querySelectorAll("article").length === 4 && !document.querySelector('article[aria-busy="true"]'), { timeout: 60000 }).catch(() => {});
await wait(2500); // map tiles
const cards = await page.evaluate(() => [...document.querySelectorAll("article")].map((a) => a.innerText.replace(/\n+/g, " | ").slice(0, 150)));
cards.forEach((c) => console.log("   ", c));
ok(cards.length === 4, "four metric cards", `${cards.length}`);
ok(await page.evaluate(() => document.querySelectorAll("article svg[role=img]").length >= 3), "sparklines are drawn");
ok(await page.evaluate(() => !!document.querySelector(".leaflet-container")), "map is on screen");
ok(await page.evaluate(() => !document.querySelector(".leaflet-marker-draggable")), "the map pin is read-only");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(overflow <= 0, "no horizontal overflow", `${overflow}px`);
await page.screenshot({ path: `${out}/sat-${lang}.png`, fullPage: true });
ok(errors.filter((e) => !/status of 4\d\d/.test(e)).length === 0, "no console errors", errors.slice(0, 2).join(" | ").slice(0, 300));
console.log(failed ? `\n${failed} check(s) failed` : "\nSatellite UI OK");
await browser.close();
process.exit(failed ? 1 : 0);
