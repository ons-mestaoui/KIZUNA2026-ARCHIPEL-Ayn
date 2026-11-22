// The demo's real field: the satellite view in 3D with the virtual sensor in it, and what happens with no internet.
//   node scripts/browser/demo-field.mjs <base> <outDir> [lang]
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", lang = "en"] = process.argv;
const origin = new URL(base).origin;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && !/status of (4\d\d|5\d\d)|ERR_|tile|\.jpg|\.png|Failed to load resource/.test(m.text()) && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };
const text = () => page.evaluate(() => document.body.innerText);
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const heroBox = () => page.evaluate(() => { const c = document.querySelector("main canvas"); const r = c?.closest(".overflow-hidden")?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; });
const shot = async (name, hero = true) => page.screenshot({ path: `${out}/demo-field-${lang}-${name}.png`, ...(hero ? { clip: await heroBox() } : {}) });
const clickText = (re) => page.evaluate((src) => { const r = new RegExp(src, "i"); const b = [...document.querySelectorAll("button")].find((x) => r.test(x.textContent.trim()) && x.offsetParent); b?.click(); return !!b; }, re.source);
const cardText = () => page.evaluate(() => document.querySelector("section[aria-labelledby='zone-card']")?.innerText ?? "");

// no signal for everything except the app itself: the demo must not need the internet for its field view
let offline = false;
await page.setRequestInterception(true);
page.on("request", (req) => (offline && !req.url().startsWith(origin) && !req.url().startsWith("data:") && !req.url().startsWith("blob:") ? req.abort("internetdisconnected") : req.continue()));

await page.goto(`${base}/?demo=kizuna`, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForSelector("main canvas", { timeout: 30000 });
await wait(7500);
ok(page.url().endsWith("/demo"), "the demo opens");

const hero = await heroBox();
ok(!!hero && hero.height > 250, "the Field view is the demo's opening hero", JSON.stringify(hero));
await shot("1-start");
const chips = await page.evaluate(() => [...document.querySelectorAll("main button[aria-label]")].filter((b) => /^(Zone|المنطقة|区画)/.test(b.getAttribute("aria-label"))).length);
ok(chips === 3, "three zones are lettered", `${chips} chips`);
const bodyText = await text();
const pin = () => page.evaluate(() => [...document.querySelectorAll("main span[title]")].map((e) => e.textContent.replace(/\s+/g, " ").trim()).find((t) => /^\d+ ?%$/.test(t)) ?? "");
ok((await pin()) === "22 %", "the virtual soil sensor is marked in the field with its reading", await pin());
ok(/Heatwave on 21 Jul|موجة الحر|熱波/.test(bodyText), "the heatwave is marked between the two passes");
ok(/Relief ×|التضاريس ×|起伏 ×/.test(bodyText), "the real terrain shows (heights are in the bundle)");
ok((await overflow()) <= 0, "no sideways scrolling on a phone", `${await overflow()}px`);

// the zone card follows the plan: a thirsty day orders the water, a watered day only asks for a look
const first = await cardText();
console.log("   card:", first.replace(/\n+/g, " | ").slice(0, 170));
ok(/Water zone C first|اسقِ المنطقة ج أولاً|区画Cから先に水やり/.test(first), "on the dry heatwave day: water the weakest, driest zone first");
ok(/already looked this way on 18 Jul|كانت تبدو هكذا|18 ?Jul|7月18日/.test(first), "…and it admits that zone looked the same on the earlier pass (so it may be canopy, not thirst)");
for (let i = 0; i < 2; i++) { await clickText(/^(Pour water|اسكب الماء|水をかける)$/); await wait(2300); }
await wait(800);
const second = await cardText();
ok(/Check zone C first|افحص المنطقة ج أولاً|区画Cを先に確認/.test(second) && !/Water zone C first/.test(second), "after pouring water the same zone is only 'check first'", second.replace(/\n+/g, " | ").slice(0, 90));
ok(Number.parseInt(await pin(), 10) > 40, "the sensor reading in the field follows the pour", await pin());
await shot("2-poured");

// layers and passes
for (const [name, idx] of [["3-green", 1], ["4-water", 2], ["5-photo", 3]]) {
  await page.evaluate((i) => [...document.querySelectorAll('main [role="group"]')].find((g) => g.querySelectorAll("button").length >= 3 && /(Zones|المناطق|区画)/.test(g.textContent))?.querySelectorAll("button")[i]?.click(), idx);
  await wait(900);
  await shot(name);
}
await page.evaluate(() => [...document.querySelectorAll('main [role="group"]')].find((g) => g.querySelectorAll("button").length >= 3 && /(Zones|المناطق|区画)/.test(g.textContent))?.querySelectorAll("button")[0]?.click());
await page.evaluate(() => [...document.querySelectorAll('main [role="group"][aria-label]')].find((g) => g.querySelectorAll("button").length === 2 && /\d/.test(g.textContent))?.querySelectorAll("button")[0]?.click()); // the earlier pass
await wait(900);
// (the zone card no longer prints the pass date: the pass chip on the map says which pass is on show)
const pressedPass = await page.evaluate(() => [...document.querySelectorAll('main [role="group"][aria-label] button[aria-pressed="true"]')].map((b) => b.textContent.trim()).find((t) => /\d/.test(t)) ?? "");
ok(/18 Jul/.test(pressedPass) || lang !== "en", "the earlier pass can be selected", pressedPass);
await shot("6-before");

// the "live" scenario switches to the two latest passes
await clickText(/^(Today's forecast|توقعات اليوم|今日の予報)$/);
await wait(2500);
const liveDates = await page.evaluate(() => [...document.querySelectorAll('main [role="group"][aria-label] button')].map((b) => b.textContent.trim()).filter((t) => /\d/.test(t)));
console.log("   live passes:", liveDates.join(" | "));
ok(liveDates.length === 2 && !liveDates.some((d) => /Jul|يوليو|7月/.test(d)), "the live scenario shows the latest two passes, not the July ones");
await clickText(/^(Heatwave|موجة حرّ|猛暑)/);
await wait(1500);

// Model view and back
ok(await clickText(/^(Model|النموذج|モデル)$/), "the Model switch is offered");
await wait(2500);
await shot("7-model");
await clickText(/^(Field|الحقل|畑)$/);
await wait(4000);

// Satellite tab: the field's history from the snapshot
await page.evaluate(() => [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent)[3]?.click());
await wait(2500);
ok(await page.evaluate(() => document.querySelectorAll("article svg[role=img]").length >= 2), "the Satellite tab shows the field's own history");
await page.evaluate(() => [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent)[0]?.click());
await wait(1000);

// ── no internet at all ──────────────────────────────────────────────────────────────────────────────────────────
offline = true;
await page.reload({ waitUntil: "networkidle0", timeout: 60000 });
await page.waitForSelector("main canvas", { timeout: 30000 });
await wait(7500);
const offChips = await page.evaluate(() => [...document.querySelectorAll("main button[aria-label]")].filter((b) => /^(Zone|المنطقة|区画)/.test(b.getAttribute("aria-label"))).length);
ok(offChips === 3, "with no internet the field view still opens with its three zones", `${offChips} chips`);
ok(/Relief ×|التضاريس ×|起伏 ×/.test(await text()), "…and the terrain, from the bundle");
ok(/Water zone C first|Check zone C first|المنطقة ج|区画C/.test(await cardText()), "…and the zone card");
await shot("8-offline");
offline = false;

ok(errors.length === 0, "no console errors", errors.slice(0, 3).join(" | ").slice(0, 400));
console.log(failed ? `\n${failed} check(s) failed` : "\nDemo field OK");
await browser.close();
process.exit(failed ? 1 : 0);
