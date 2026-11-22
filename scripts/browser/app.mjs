// The farmer app on a phone (and desktop): Today, Week, Farm, log water, languages.   node scripts/browser/app.mjs <base> <outDir> [source]
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", source = "solar_basin"] = process.argv;
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = source === "solar_basin" ? "" : `-${source}`;
const shot = (name, full = true) => page.screenshot({ path: `${out}/app${tag}-${name}.png`, fullPage: full });
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };
const clickText = async (text, sel = "button, a, summary, [role=radio]") => {
  const done = await page.evaluate((t, s) => {
    const el = [...document.querySelectorAll(s)].find((b) => b.textContent.trim().includes(t) && b.offsetParent !== null);
    el?.click();
    return !!el;
  }, text, sel);
  if (!done) console.log("   (not found:", text, ")");
  return done;
};
const text = () => page.evaluate(() => document.body.innerText);
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const api = (path, init) => page.evaluate(async (p, i) => { const r = await fetch(p, i); return { status: r.status, body: await r.json().catch(() => null) }; }, path, init);
const J = (b) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

// sign up through the API inside the browser (cookies land in this browser)
await page.goto(`${base}/sign-in`, { waitUntil: "networkidle0" });
const email = `app+${Date.now()}@example.com`;
await api("/api/auth/sign-up/email", J({ name: "Amel", email, password: "app-test-pass-1" }));
const farm = {
  name: "Ferme test", lat: 36.4561, lon: 10.7376, placeName: "Nabeul", crop: "olive", plantingDate: null, areaHa: 2,
  soilTexture: "loam", irrigationMethod: "drip", waterSource: source, basinM3: source === "solar_basin" ? 100 : 0,
  pvKWp: source.startsWith("solar") ? 6 : 0, pumpHeadM: 15, wellSafeYieldM3h: 40, lastIrrigated: "week+", lang: "en",
};
if (source !== "solar_basin" && !source.startsWith("solar")) farm.pvKWp = 0;
ok((await api("/api/farm", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(farm) })).status === 200, `farm saved (${source})`);
await api("/api/soil-check", J({ feel: "dry" }));

// Today
await page.goto(`${base}/app`, { waitUntil: "networkidle0", timeout: 60000 });
await wait(3500);
let body = await text();
ok(/needed today|No watering today|Your crop needs water/.test(body), "Today shows a decision", body.match(/(\d+ m³\s*needed today|No watering today|Your crop needs water)/)?.[0]);
ok(await page.evaluate(() => !!document.querySelector("canvas")), "3D twin is on screen");
const c = await page.evaluate(() => { const e = document.querySelector("canvas"); return `${e.clientWidth}x${e.clientHeight}`; });
console.log("   canvas", c, "overflow", await overflow());
ok((await overflow()) === 0, "no horizontal overflow on a phone");
await shot("1-today");

// squeeze + log water
if (/needed today/.test(body)) {
  ok(await clickText("Yes, as planned"), "log the planned water");
  await wait(2500);
  body = await text();
  ok(/Saved: \d+ m³ watered today/.test(body), "water logged and shown", body.match(/Saved: \d+ m³ watered today/)?.[0]);
  await clickText("Undo");
  await wait(2000);
  ok(!/Saved: \d+ m³/.test(await text()), "undo works");
}
await clickText("Holds its shape");
await wait(2000);
ok(/The plan is updated|Thanks/.test(await text()), "squeeze test acknowledged");
await shot("2-today-after");

// Week
await clickText("Week");
await wait(1500);
body = await text();
ok(/Next 7 days/.test(body), "Week tab");
ok((await page.evaluate(() => document.querySelectorAll('[role="tab"]').length)) >= 7, "seven days to pick from");
await clickText("Fri", "[role=tab]");
await wait(600);
await shot("3-week");

// Farm
await page.evaluate(() => document.querySelector('button[aria-label="Your farm"]')?.click());
await wait(1000);
ok(/Ferme test/.test(await text()) && /Olive/.test(await text()), "Farm tab shows the farm");
await shot("4-farm");

// languages: Arabic + Japanese
for (const [lang, probe, label] of [["ar", /خطة|اليوم|الأسبوع/, "Arabic"], ["ja", /今日|週間/, "Japanese"]]) {
  await page.evaluate((l) => localStorage.setItem("gd-lang", l), lang);
  await page.goto(`${base}/app`, { waitUntil: "networkidle0", timeout: 60000 });
  await wait(3500);
  const info = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang }));
  ok(probe.test(await text()) && info.lang === lang, `${label} interface`, JSON.stringify(info));
  ok((await overflow()) <= 0, `${label}: no horizontal overflow`, `${await overflow()}px`);
  await shot(`5-${lang}`);
}

// desktop
await page.evaluate(() => localStorage.setItem("gd-lang", "en"));
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto(`${base}/app`, { waitUntil: "networkidle0", timeout: 60000 });
await wait(3500);
await shot("6-desktop", false);

ok(errors.length === 0, "no console errors", errors.slice(0, 3).join(" | ").slice(0, 400));
console.log(failed ? `\n${failed} check(s) failed` : "\nApp OK");
await browser.close();
process.exit(failed ? 1 : 0);
