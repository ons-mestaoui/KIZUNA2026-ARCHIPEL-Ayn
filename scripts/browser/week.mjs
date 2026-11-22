// The Week tab as a forecast card: tabs, keyboard, dragging along the wave, every sky, reduced motion.
//   node scripts/browser/week.mjs <base> <outDir> [lang] [desktop]
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", lang = "en", device = "phone"] = process.argv;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`);
  if (!c) failed++;
};
const phone = device !== "desktop";
const rtl = lang === "ar";

const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && !/status of (4\d\d|5\d\d)|ERR_|Failed to load resource|tile/.test(m.text()) && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);

const api = (path, init) => page.evaluate(async (p, i) => { const r = await fetch(p, i); return { status: r.status }; }, path, init);
const J = (b) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
await page.goto(`${base}/sign-in`, { waitUntil: "networkidle0" });
await api("/api/auth/sign-up/email", J({ name: "Amel", email: `week+${Date.now()}@example.com`, password: "week-test-pass-1" }));
await api("/api/farm", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
  name: "Ferme test", lat: 36.4561, lon: 10.7376, placeName: "Nabeul", crop: "olive", plantingDate: null, areaHa: 2, soilTexture: "loam",
  irrigationMethod: "drip", waterSource: "solar_basin", basinM3: 100, pvKWp: 6, pumpHeadM: 15, wellSafeYieldM3h: 40, lastIrrigated: "week+", lang }) });
await page.goto(`${base}/app`, { waitUntil: "networkidle0", timeout: 90000 });
await wait(2500);
await page.evaluate(() => [...document.querySelectorAll("nav button")].filter((b) => b.offsetParent !== null)[1]?.click()); // today, week, …
await wait(3200); // the first show settles, the wave draws itself

const tabs = () => page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => ({ sel: t.getAttribute("aria-selected") === "true", label: t.getAttribute("aria-label") })));
const panelText = () => page.evaluate(() => document.getElementById("forecast-panel")?.innerText.replace(/\s+/g, " ").trim() ?? "");
const shot = (name) => page.screenshot({ path: `${out}/week-${device}-${lang}-${name}.png`, fullPage: false });
const scrollToCard = () => page.evaluate(() => document.getElementById("week")?.scrollIntoView({ block: "start" }));

await scrollToCard();
await wait(500);
let ts = await tabs();
ok(ts.length >= 7, "seven days to pick from", String(ts.length));
ok(ts.filter((t) => t.sel).length === 1 && ts[0].sel, "today is the one selected");
const first = await panelText();
ok(/\d/.test(first) && first.length > 20, "the panel shows the day's water and mood", first.slice(0, 90));
ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, "no sideways overflow");
ok(await page.evaluate(() => !!document.querySelector("#week") && document.querySelectorAll('[role="tabpanel"]').length === 1), "one panel, labelled by its tab");
await shot("1-first");

// tap a later day
const box = (i) => page.evaluate((n) => { const r = document.querySelectorAll('[role="tab"]')[n].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i);
const b3 = await box(3);
await page.mouse.click(b3.x, b3.y);
await wait(900);
ts = await tabs();
ok(ts[3].sel && ts.filter((t) => t.sel).length === 1, "tapping a day selects it");
const third = await panelText();
ok(third !== first, "…and the panel changes", third.slice(0, 60));
await shot("2-third");

// keyboard: the arrow that points toward the next day
await page.focus('[role="tab"][aria-selected="true"]');
await page.keyboard.press(rtl ? "ArrowLeft" : "ArrowRight");
await wait(500);
ts = await tabs();
ok(ts[4].sel, "the arrow keys move through the days", `${rtl ? "←" : "→"} → day 5`);
ok(await page.evaluate(() => document.activeElement?.getAttribute("role") === "tab" && document.activeElement.getAttribute("aria-selected") === "true"), "focus follows the selection");
await page.keyboard.press("Home");
await wait(300);
ok((await tabs())[0].sel, "Home goes to today");
await page.keyboard.press("End");
await wait(300);
ok((await tabs()).at(-1).sel, "End goes to the last day");

// drag along the wave from the first day to the last
const a = await box(0);
const z = await box(ts.length - 1);
await page.mouse.move(a.x, a.y);
await page.mouse.down();
for (let k = 1; k <= 12; k++) { await page.mouse.move(a.x + ((z.x - a.x) * k) / 12, a.y); await wait(30); }
await page.mouse.up();
await wait(700);
ok((await tabs()).at(-1).sel, "dragging along the wave scrubs through the week");

// the marker really sits on the chosen day's column
const marker = await page.evaluate(() => { const m = document.querySelector('[role="tablist"] > div[aria-hidden]'); const r = m?.getBoundingClientRect(); const t = document.querySelector('[role="tab"][aria-selected="true"]').getBoundingClientRect(); return r ? { mx: r.x + r.width / 2, tx: t.x + t.width / 2 } : null; });
ok(marker && Math.abs(marker.mx - marker.tx) < 6, "the marker rests on that day's column", marker ? `${Math.round(marker.mx)} vs ${Math.round(marker.tx)}` : "none");

// every sky (the real forecast shows one or two of them; the others are forced here to look at them)
if (lang === "en") {
  for (const mood of ["calm", "warm", "hot", "storm"]) {
    await page.evaluate((m) => document.querySelectorAll('section[aria-labelledby="week"] [aria-hidden="true"] > div').forEach((d) => { const bg = d.querySelector('[style*="sky-"]'); if (!bg) return; d.style.transition = "none"; d.style.opacity = bg.style.backgroundImage.includes(`sky-${m}`) ? "1" : "0"; }), mood);
    await wait(250);
    await shot(`3-sky-${mood}`);
  }
}

// reduced motion: still works, nothing is stuck invisible
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await page.reload({ waitUntil: "networkidle0" });
await wait(2000);
await page.evaluate(() => [...document.querySelectorAll("nav button")].filter((b) => b.offsetParent !== null)[1]?.click());
await wait(1500);
const rm = await page.evaluate(() => ({ tabs: document.querySelectorAll('[role="tab"]').length, op: getComputedStyle(document.getElementById("forecast-panel")).opacity }));
ok(rm.tabs >= 7 && Number(rm.op) === 1, "reduced motion: the card is fully shown straight away", JSON.stringify(rm));
await scrollToCard();
await shot("4-reduced");

ok(errors.length === 0, "no console errors", errors.slice(0, 2).join(" | ").slice(0, 300));
console.log(failed ? `\n${failed} check(s) failed` : "\nWeek forecast OK");
await browser.close();
process.exit(failed ? 1 : 0);
