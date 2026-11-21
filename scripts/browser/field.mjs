// The real field in 3D, in the farmer app.   node scripts/browser/field.mjs <base> <outDir> [lang]
// Signs up, gives the farm an outline on an orchard block (the satellite view is live Copernicus data), and checks the
// Today tab: the hero, layers, passes, zone chips, the Field | Model switch, layout on a phone and on a desktop.
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", lang = "en"] = process.argv;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && !/status of (4\d\d|5\d\d)|ERR_|tile|\.jpg|\.png/.test(m.text()) && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };
const J = (b, method = "POST") => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const heroBox = () => page.evaluate(() => { const c = document.querySelector("main canvas"); const r = c?.closest(".overflow-hidden")?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; });
const shot = async (name, hero = false) => {
  const clip = hero ? await heroBox() : null;
  await page.screenshot({ path: `${out}/field-${lang}-${name}.png`, ...(clip ? { clip } : { fullPage: false }) });
};

// the farm: 1 ha square on an orchard block 1.2 km west of the Menzel Bouzelfa town centre
const C = [10.5729, 36.687];
const polygon = [[C[0] - 0.00055, C[1] + 0.00045], [C[0] + 0.00055, C[1] + 0.00045], [C[0] + 0.00055, C[1] - 0.00045], [C[0] - 0.00055, C[1] - 0.00045]];

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`${base}/sign-in`, { waitUntil: "networkidle0" });
const farm = await page.evaluate(async (j) => {
  await fetch("/api/auth/sign-up/email", j.up);
  const r = await fetch("/api/farm", j.farm);
  return (await r.json()).farm;
}, {
  up: J({ name: "Field Tester", email: `field+${lang}+${Date.now()}@example.com`, password: "field-test-pass-1" }),
  farm: J({ name: "Citrus block", lat: C[1], lon: C[0], placeName: "Menzel Bouzelfa", crop: "citrus", plantingDate: null, areaHa: 1, soilTexture: "sandy_loam", irrigationMethod: "drip", waterSource: "solar_basin", basinM3: 80, pvKWp: 3, pumpHeadM: 15, wellSafeYieldM3h: 20, lastIrrigated: "3-5d", lang, polygon }, "PUT"),
});
ok(farm?.polygon?.length === 4, "the farm has its outline");

// ── phone ───────────────────────────────────────────────────────────────────────────────────────────────────────
await page.goto(`${base}/app`, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForSelector("main canvas", { timeout: 30000 });
await wait(7000); // data + tiles + the fly-in
const hero = await heroBox();
ok(!!hero && hero.height > 250, "the Field view is on screen", JSON.stringify(hero));
await shot("1-phone-zones");
await shot("1-phone-zones-hero", true);
await page.screenshot({ path: `${out}/field-${lang}-1b-phone-page.png`, fullPage: true });
const card = await page.$("section[aria-labelledby='zone-card']");
ok(!!card, "the zone card is under the decision");
if (card) { await card.evaluate((el) => el.scrollIntoView({ block: "center" })); await wait(300); await card.screenshot({ path: `${out}/field-${lang}-1c-phone-card.png` }); await page.evaluate(() => scrollTo(0, 0)); }
const chips = await page.evaluate(() => [...document.querySelectorAll("main button[aria-label]")].filter((b) => /^(Zone|المنطقة|区画)/.test(b.getAttribute("aria-label"))).length);
ok(chips >= 2, "the zones are lettered on the field", `${chips} chips`);
const layers = await page.evaluate(() => [...document.querySelectorAll('main [role="group"] button')].map((b) => b.textContent.trim()).filter(Boolean));
console.log("   buttons:", layers.join(" | "));
ok((await overflow()) <= 0, "no sideways scrolling on a phone", `${await overflow()}px`);

// the decision headline stays above the fold while the field is on show
const above = await page.evaluate(() => { const h = document.querySelector("#decision"); const r = h?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, vh: innerHeight } : null; });
ok(!!above && above.bottom < above.vh, "today's decision is visible without scrolling", JSON.stringify(above));

for (const [name, idx] of [["2-phone-green", 1], ["3-phone-water", 2], ["4-phone-photo", 3]]) {
  await page.evaluate((i) => document.querySelectorAll('main [role="group"][aria-label] > button')[0] && [...document.querySelectorAll('main [role="group"]')].find((g) => g.querySelectorAll("button").length >= 3 && /(Zones|المناطق|区画|Greenness|الاخضرار|緑度)/.test(g.textContent))?.querySelectorAll("button")[i]?.click(), idx);
  await wait(900);
  await shot(name + "-hero", true);
}
await page.evaluate(() => [...document.querySelectorAll('main [role="group"]')].find((g) => /(Zones|المناطق|区画)/.test(g.textContent) && g.querySelectorAll("button").length >= 3)?.querySelectorAll("button")[0]?.click());
await wait(600);

// turn the view: drag across the field, and the slab's cut faces come into sight
const hb = await heroBox();
if (hb) {
  const cx = hb.x + hb.width * 0.82, cy = hb.y + hb.height * 0.62; // clear of the zone chips and the controls
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx - 170, cy - 40, { steps: 14 }); await page.mouse.up();
  await wait(1200);
  await shot("2b-phone-turned-hero", true);
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 120, { steps: 10 }); await page.mouse.up();
  await wait(1200);
  await shot("2c-phone-low-hero", true);
}

// switch to the Model view and back
const switchTo = (idx) => page.evaluate((i) => { const g = [...document.querySelectorAll('main [role="group"]')].find((x) => x.querySelectorAll("button").length === 2 && /(Field|Model|الحقل|النموذج|畑|モデル)/.test(x.textContent)); g?.querySelectorAll("button")[i]?.click(); return !!g; }, idx);
ok(await switchTo(1), "the Model switch is offered");
await wait(2500);
ok(await page.evaluate(() => !!document.querySelector("main canvas")), "the Model view shows the diorama");
await shot("5-phone-model-hero", true);
await switchTo(0);
await wait(5000);
ok(await page.evaluate(() => [...document.querySelectorAll("main button[aria-label]")].some((b) => /^(Zone|المنطقة|区画)/.test(b.getAttribute("aria-label")))), "back to the Field view");

// ── the Satellite tab: the field's own history sits above the regional cards ────────────────────────────────────────
await page.evaluate(() => [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent)[4]?.click());
await page.waitForFunction(() => document.querySelectorAll("article").length >= 5 && !document.querySelector('article[aria-busy="true"]'), { timeout: 60000 }).catch(() => {});
await wait(1500);
const trend = await page.evaluate(() => { const a = document.querySelector("article"); return { text: a?.innerText.replace(/\n+/g, " | ").slice(0, 160) ?? "", spark: a?.querySelectorAll("svg[role=img]").length ?? 0 }; });
ok(trend.spark === 2, "the Satellite tab opens with the field's greenness and leaf-water history", trend.text);
ok((await overflow()) <= 0, "no sideways scrolling in the Satellite tab", `${await overflow()}px`);
await page.screenshot({ path: `${out}/field-${lang}-7-satellite.png`, fullPage: false });
await page.evaluate(() => [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent)[0]?.click()); // back to Today
await wait(1500);

// ── desktop ─────────────────────────────────────────────────────────────────────────────────────────────────────
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector("main canvas", { timeout: 30000 });
await wait(7000);
await shot("6-desktop");
ok((await overflow()) <= 0, "no sideways scrolling on a desktop", `${await overflow()}px`);

// ── no signal: the saved copy of the view is shown, and sign-out removes it ─────────────────────────────────────────
let blocked = false;
await page.setRequestInterception(true);
page.on("request", (req) => (blocked && (req.url().includes("/api/field") || req.url().includes("arcgisonline.com")) ? req.abort("internetdisconnected") : req.continue()));
ok(!!(await page.evaluate(() => localStorage.getItem("gd-field-v1"))), "the satellite view is saved on the device after a normal load");
blocked = true;
await page.reload({ waitUntil: "networkidle0", timeout: 60000 });
await page.waitForSelector("main canvas", { timeout: 30000 });
await wait(5000);
const savedNote = await page.evaluate(() => document.querySelector('main [role="status"]')?.textContent ?? "");
ok(/saved on|النسخة المحفوظة|保存したコピー/.test(savedNote), "with no signal the saved view shows with a notice", savedNote.slice(0, 90));
ok(await page.evaluate(() => [...document.querySelectorAll("main button[aria-label]")].some((b) => /^(Zone|المنطقة|区画)/.test(b.getAttribute("aria-label")))), "…and its zones are still lettered");
await shot("8-offline-hero", true);
blocked = false;
await page.evaluate(() => [...document.querySelectorAll("header button")].filter((x) => x.offsetParent).at(-1)?.click()); // the gear opens the Farm tab
await wait(800);
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /sign out|تسجيل الخروج|ログアウト/i.test(b.innerText))?.click());
await page.waitForFunction(() => location.pathname === "/", { timeout: 15000 }).catch(() => {});
ok((await page.evaluate(() => localStorage.getItem("gd-field-v1"))) === null, "sign-out removes the saved satellite view from the device");

ok(errors.length === 0, "no console errors", errors.slice(0, 3).join(" | ").slice(0, 400));
console.log(failed ? `\n${failed} check(s) failed` : "\nField view OK");
await browser.close();
process.exit(failed ? 1 : 0);
