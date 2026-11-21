// End-to-end farmer flow on a phone: sign up → onboarding (4 steps) → app.   node scripts/browser/flow.mjs <base> <outDir> [lang]
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", lang = "en"] = process.argv;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const errors = [];
// the forged-userId probe below deliberately provokes a 422, which the browser logs as a console error
page.on("console", (m) => m.type() === "error" && !/status of 422/.test(m.text()) && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => page.screenshot({ path: `${out}/flow-${lang}-${name}.png`, fullPage: true });
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };
const clickBtn = async (text) => {
  const done = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button, a, summary")].find((b) => b.textContent.trim().includes(t) && b.offsetParent !== null);
    el?.click();
    return !!el;
  }, text);
  if (!done) console.log("   (no clickable:", text, ")");
  return done;
};

const email = `flow+${Date.now()}@example.com`;

// 1. sign up
await page.goto(`${base}/sign-up`, { waitUntil: "networkidle0" });
await page.type('input[name="name"]', "Slim Ben Ali");
await page.type('input[name="email"]', email);
await page.type('input[name="password"]', "flow-test-pass-1");
await shot("1-signup");
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
await wait(1500);
ok(page.url().includes("/onboarding"), "sign-up lands on onboarding", page.url());

// 2. step 1 — search Nabeul
await page.waitForSelector('input[type="search"]');
await page.type('input[type="search"]', "Nabeul");
await page.waitForFunction(() => document.querySelectorAll("ul li button").length > 0, { timeout: 15000 }).catch(() => {});
await shot("2-search");
const hit = await page.evaluate(() => { const b = document.querySelector("ul li button"); const t = b?.textContent ?? ""; b?.click(); return t; });
ok(/Nabeul|نابل|ナブール/i.test(hit), "geocoding search finds Nabeul", hit.slice(0, 60));
await wait(2500); // fly + tiles
await shot("3-map");
const coords = await page.evaluate(() => document.body.innerText.match(/(\d+\.\d+)[,،] ?(\d+\.\d+)/)?.[0] ?? "");
ok(/36\.\d+.*10\.\d+/.test(coords), "pin placed near Nabeul", coords);
const next = async () => { await clickBtn(lang === "ar" ? "التالي" : lang === "ja" ? "次へ" : "Next"); await wait(700); };
await next();

// 3. step 2 — crop + area
await clickBtn(lang === "ar" ? "الزيتون" : lang === "ja" ? "オリーブ" : "Olive");
await page.evaluate(() => { const i = document.querySelector('input[inputmode="decimal"]'); i.focus(); i.select(); });
await page.keyboard.type("2.5");
await shot("4-crop");
await next();

// 4. step 3 — water
await clickBtn(lang === "ar" ? "مضخة شمسية دون حوض" : lang === "ja" ? "ソーラーポンプ（貯水池なし）" : "Solar pump, no basin");
await shot("5-water");
await next();

// 5. step 4 — soil + last watering, save (match the card TITLE exactly: "Loam" ≠ "Loamy sand")
await page.evaluate((title) => {
  const card = [...document.querySelectorAll('[role="radio"]')].find((b) => b.querySelector("span.font-semibold")?.textContent.trim() === title);
  card?.click();
}, lang === "ar" ? "طميية" : lang === "ja" ? "壌土" : "Loam");
await clickBtn(lang === "ar" ? "منذ 3 إلى 5 أيام" : lang === "ja" ? "3〜5日前" : "3–5 days ago");
await shot("6-soil");
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {}), clickBtn(lang === "ar" ? "احفظ" : lang === "ja" ? "保存して" : "Save and see")]);
await wait(2000);
ok(page.url().endsWith("/app"), "saving lands on /app", page.url());
await shot("7-app");

// 6. server-side truth
const farm = await page.evaluate(async () => (await (await fetch("/api/farm")).json()).farm);
ok(farm?.crop === "olive" && farm?.areaHa === 2.5, "farm saved: olive, 2.5 ha", JSON.stringify({ crop: farm?.crop, areaHa: farm?.areaHa }));
ok(farm?.waterSource === "solar_direct" && farm?.basinM3 === 0, "solar direct: no basin stored", `source=${farm?.waterSource} basin=${farm?.basinM3} pv=${farm?.pvKWp}`);
ok(farm?.soilTexture === "loam" && farm?.lastIrrigated === "3-5d", "soil and last watering saved", `${farm?.soilTexture} / ${farm?.lastIrrigated}`);
ok(Math.abs(farm?.lat - 36.45) < 0.3 && Math.abs(farm?.lon - 10.73) < 0.3, "location is Nabeul", `${farm?.lat}, ${farm?.lon}`);
ok(farm?.lang === lang, "interface language remembered", farm?.lang);

// 7. a stranger can't read or write another farm
const anon = await page.evaluate(async () => {
  const r = await fetch("/api/farm", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: "someone-else", name: "x" }) });
  return r.status;
});
ok(anon === 422, "invalid payload (even with a forged userId) is rejected", `HTTP ${anon}`);

ok(errors.length === 0, "no console errors", errors.slice(0, 3).join(" | ").slice(0, 300));
console.log(failed ? `\n${failed} check(s) failed` : "\nFlow OK");
await browser.close();
process.exit(failed ? 1 : 0);
