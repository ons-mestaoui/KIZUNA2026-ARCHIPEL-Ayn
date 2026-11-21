// The demo: hidden doors, pour water, tabs, languages.   node scripts/browser/demo-ui.mjs <base> <outDir>
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = "."] = process.argv;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };

async function fresh(mobile = true, lang = "en") {
  const ctx = await browser.createBrowserContext(); // a clean browser: no cookies from earlier steps
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);
  return { page, errors, ctx };
}
const text = (p) => p.evaluate(() => document.body.innerText);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// 1. the landing page never mentions the demo
{
  const { page, ctx } = await fresh(false);
  await page.goto(`${base}/`, { waitUntil: "networkidle0" });
  ok(!/demo/i.test(await text(page)), "the landing page does not mention the demo");
  ok(!(await page.evaluate(() => [...document.querySelectorAll("a")].some((a) => /demo/i.test(a.href)))), "…and has no link to it");

  // 2. Shift+D
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 }).catch(() => {}), (async () => { await page.keyboard.down("Shift"); await page.keyboard.press("KeyD"); await page.keyboard.up("Shift"); })()]);
  await wait(1500);
  ok(page.url().endsWith("/demo"), "Shift+D opens the demo", page.url());
  await ctx.close();
}

// 3. long-press the logo on a phone
{
  const { page, ctx } = await fresh(true);
  await page.goto(`${base}/`, { waitUntil: "networkidle0" });
  const box = await (await page.$("header a")).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await wait(700);
  ok(!page.url().includes("/demo"), "a short press does nothing");
  await wait(1100);
  await page.mouse.up();
  await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 }).catch(() => {});
  await wait(1500);
  ok(page.url().endsWith("/demo"), "pressing and holding the logo opens the demo", page.url());
  await ctx.close();
}

// 4. /?demo=kizuna, then use the demo
const { page, errors, ctx } = await fresh(true, "en");
await page.goto(`${base}/?demo=kizuna`, { waitUntil: "networkidle0", timeout: 60000 });
await wait(3500);
ok(page.url().endsWith("/demo"), "/?demo=kizuna opens the demo", page.url());
let body = await text(page);
ok(/Demo/.test(body) && /Heatwave/.test(body), "demo badge and the heatwave scenario");
ok(/\d+ m³\s*needed today/.test(body), "heatwave + dry soil → water is needed", body.match(/\d+ m³\s*needed today/)?.[0]);
ok(await page.evaluate(() => !!document.querySelector("canvas")), "3D twin is on screen");
ok((await overflow(page)) <= 0, "no horizontal overflow on a phone", `${await overflow(page)}px`);
await page.screenshot({ path: `${out}/demo-1-start.png`, fullPage: true });

// pour water (twice) → the plan flips
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Pour water")?.click());
  await wait(2300);
}
body = await text(page);
ok(/No watering today/.test(body), "pouring water flips the plan to 'No watering today'");
await page.screenshot({ path: `${out}/demo-2-poured.png`, fullPage: true });

// the QR code
ok(await page.evaluate(() => [...document.querySelectorAll("img")].some((i) => i.src.startsWith("data:image/png"))), "a QR code to the sign-up page is shown");

// tabs
const tabs = await page.evaluate(() => [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent !== null).map((x) => x.textContent.trim()));
console.log("   tabs:", tabs.join(" | "));
ok(tabs.length === 4, "four demo tabs", tabs.join(", "));
for (const [i, label, probe] of [[1, "Leaf check", () => !!document.querySelector('input[type="file"][capture="environment"]')], [2, "Ask", () => !!document.querySelector("form textarea")], [3, "Satellite", () => document.querySelectorAll("article").length === 4]]) {
  await page.evaluate((n) => [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent !== null)[n]?.click(), i);
  await wait(1500);
  ok(await page.evaluate(probe), `${label} tab works inside the demo`);
}

// reset brings it back
await page.evaluate(() => [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent !== null)[0]?.click());
await wait(800);
await page.evaluate(() => document.querySelector('button[aria-label="Reset demo"]')?.click());
await wait(2500);
body = await text(page);
ok(/\d+ m³\s*needed today/.test(body), "Reset demo restores the dry-soil start");

// languages
for (const [lang, probe, label, button] of [["ar", /عرض تجريبي/, "Arabic", "العربية"], ["ja", /デモ/, "Japanese", "日本語"]]) {
  // use the real language switch (on a phone it sits at the top of the Twin panel)
  await page.evaluate((b) => [...document.querySelectorAll('[role="radiogroup"] button')].find((x) => x.textContent.trim() === b && x.offsetParent !== null)?.click(), button);
  await wait(3000);
  ok(probe.test(await text(page)), `${label} demo interface`);
  ok((await overflow(page)) <= 0, `${label}: no horizontal overflow`, `${await overflow(page)}px`);
  await page.screenshot({ path: `${out}/demo-3-${lang}.png`, fullPage: true });
}

// a normal farmer is sent away from /demo
await ctx.close();
{
  const f = await fresh(true, "en");
  await f.page.goto(`${base}/sign-in`, { waitUntil: "networkidle0" });
  await f.page.evaluate(async () => {
    await fetch("/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "F", email: `nodemo+${Date.now()}@example.com`, password: "nodemo-pass-123" }) });
    await fetch("/api/farm", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x", lat: 36.4, lon: 10.7, placeName: "x", crop: "olive", plantingDate: null, areaHa: 1, soilTexture: "loam", irrigationMethod: "drip", waterSource: "grid", basinM3: 0, pvKWp: 0, pumpHeadM: 15, wellSafeYieldM3h: 20, lastIrrigated: "unknown", lang: "en" }) });
  });
  await f.page.goto(`${base}/demo`, { waitUntil: "networkidle0" });
  await wait(3000);
  ok(f.page.url().endsWith("/app"), "a normal farmer who opens /demo is sent to /app", f.page.url());
  await f.ctx.close();
}

ok(errors.length === 0, "no console errors", errors.slice(0, 2).join(" | ").slice(0, 300));
console.log(failed ? `\n${failed} check(s) failed` : "\nDemo UI OK");
await browser.close();
process.exit(failed ? 1 : 0);
