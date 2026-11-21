// Drawing the field outline on a phone: tap the corners, fix a crossing, square from the area, save, see it on the map.
//   node scripts/browser/outline.mjs <base> <outDir> [lang]
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", lang = "en"] = process.argv;
const origin = new URL(base).origin;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
await browser.defaultBrowserContext().overridePermissions(origin, ["geolocation"]);
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && !/status of (4\d\d)|tile|\.jpg|\.png|ERR_/.test(m.text()) && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.setGeolocation({ latitude: 36.687, longitude: 10.573, accuracy: 20 });
await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);

const T = {
  en: { locate: "Use my location", start: "Outline my field", edit: "Edit outline", remove: "Remove outline", done: "Done", undo: "Undo", clear: "Clear", squareGo: "Make square", next: "Next", save: "Save and see", saved: /Field outlined/ },
  ar: { locate: "استخدم موقعي", start: "ارسم حدود حقلي", edit: "عدّل الحدود", remove: "احذف الحدود", done: "تم", undo: "تراجع", clear: "امسح", squareGo: "أنشئ مربعاً", next: "التالي", save: "احفظ", saved: /تم رسم الحقل/ },
  ja: { locate: "現在地を使う", start: "畑の輪郭を描く", edit: "輪郭を編集", remove: "輪郭を削除", done: "完了", undo: "元に戻す", clear: "消去", squareGo: "正方形を作る", next: "次へ", save: "保存して", saved: /畑の輪郭を設定済み/ },
}[lang];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => page.screenshot({ path: `${out}/outline-${lang}-${name}.png`, fullPage: true });
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };
const clickBtn = async (text) => {
  const done = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button, a, summary")].find((b) => b.textContent.trim().includes(t) && b.offsetParent !== null && !b.disabled);
    el?.click();
    return !!el;
  }, text);
  if (!done) console.log("   (no clickable:", text, ")");
  return done;
};
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const summary = () => page.evaluate(() => document.querySelector('section[aria-labelledby="outline-title"] p[aria-live]')?.textContent ?? "");
const hectares = async () => Number((await summary()).match(/(\d+\.\d+)/)?.[1] ?? NaN);
const alertText = () => page.evaluate(() => document.querySelector('section[aria-labelledby="outline-title"] [role="alert"]')?.textContent ?? "");
const mapRect = () => page.evaluate(() => { const el = document.querySelector(".leaflet-container"); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const tapCorners = async (offsets) => {
  const r = await mapRect();
  await wait(300);
  const r2 = await mapRect();
  for (const [dx, dy] of offsets) { await page.mouse.click(r2.x + r2.w / 2 + dx, r2.y + r2.h / 2 + dy); await wait(250); }
  return r;
};

// ── sign up and place the pin with the (mocked) GPS ─────────────────────────────────────────────────────────────
await page.goto(`${base}/sign-up`, { waitUntil: "networkidle0" });
await page.type('input[name="name"]', "Outline Tester");
await page.type('input[name="email"]', `outline+${lang}+${Date.now()}@example.com`);
await page.type('input[name="password"]', "outline-test-pass-1");
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
await wait(1500);
ok(page.url().includes("/onboarding"), "sign-up lands on onboarding");
await page.waitForSelector(".leaflet-container");

// without a pin the outline button explains what to do first
await clickBtn(T.start);
await wait(300);
ok((await alertText()).length > 10, "outlining before placing the pin explains what to do first", await alertText());

await clickBtn(T.locate);
await wait(3500); // fly + tiles
ok(await page.evaluate(() => !!document.querySelector(".leaflet-marker-icon.gd-pin, .gd-pin")), "the pin is on the map");

// ── draw a 120 px square (~115 m, a bit over a hectare at zoom 17) ───────────────────────────────────────────────
await clickBtn(T.start);
await wait(3000); // fly to zoom 17
await tapCorners([[-60, -60], [60, -60], [60, 60], [-60, 60]]);
await shot("1-drawn");
const ha1 = await hectares();
ok(await page.evaluate(() => document.querySelectorAll(".gd-corner").length === 4), "four corner handles are on the map");
ok(ha1 > 0.8 && ha1 < 2.2, "the area readout is about a hectare", await summary());
ok((await alertText()) === "", "a clean square raises no warning");
ok(await page.evaluate(() => !document.querySelector(".gd-pin")), "the pin gives way to the outline");
ok((await overflow()) <= 0, "no sideways scrolling while drawing", `${await overflow()}px`);

// ── a bow-tie is refused, undo fixes it ─────────────────────────────────────────────────────────────────────────
await clickBtn(T.clear);
await wait(200);
ok(await page.evaluate(() => document.querySelectorAll(".gd-corner").length === 0), "Clear removes the corners");
await tapCorners([[-60, -60], [60, 60], [60, -60], [-60, 60]]);
await wait(200);
ok((await alertText()).length > 10, "a self-crossing outline shows a warning", await alertText());
await shot("2-crossing");
await clickBtn(T.undo);
await wait(200);
ok((await alertText()) === "" && (await page.evaluate(() => document.querySelectorAll(".gd-corner").length)) === 3, "Undo removes the last corner and the warning goes away");

// ── square from my area (the default 1 ha) ───────────────────────────────────────────────────────────────────────
await clickBtn(T.squareGo);
await wait(400);
const ha2 = await hectares();
ok(Math.abs(ha2 - 1) < 0.02, "Square from my area makes 1.00 ha", await summary());
await clickBtn(T.done);
await wait(600);
ok(T.saved.test(await page.evaluate(() => document.body.innerText)), "Done shows the outlined field and its area");
ok(await page.evaluate(() => document.querySelectorAll(".leaflet-overlay-pane path").length >= 1), "the finished outline is drawn on the map");
await shot("3-done");

// ── the outline decides the area ─────────────────────────────────────────────────────────────────────────────────
await clickBtn(T.next);
await wait(700);
const area = await page.evaluate(() => { const i = document.querySelector('input[inputmode="decimal"]'); return { ro: i.readOnly, v: i.value }; });
ok(area.ro && Math.abs(Number(area.v) - 1) < 0.02, "the area field is read-only and comes from the outline", JSON.stringify(area));
await shot("4-area");
await clickBtn(T.next); await wait(500);
await clickBtn(T.next); await wait(500);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {}), clickBtn(T.save)]);
await wait(2000);
ok(page.url().endsWith("/app"), "saving lands on /app", page.url());

const farm = await page.evaluate(async () => (await (await fetch("/api/farm")).json()).farm);
ok(Array.isArray(farm?.polygon) && farm.polygon.length === 4, "the outline is saved with its four corners", JSON.stringify(farm?.polygon)?.slice(0, 80));
ok(Math.abs(farm?.areaHa - 1) < 0.02, "the saved area is the measured one", String(farm?.areaHa));
ok(Math.abs(farm?.lat - 36.687) < 0.003 && Math.abs(farm?.lon - 10.573) < 0.003, "the saved location is the outline's centre", `${farm?.lat}, ${farm?.lon}`);

// ── the Satellite tab shows the outline ──────────────────────────────────────────────────────────────────────────
await page.evaluate(() => [...document.querySelectorAll("nav button")].filter((x) => x.offsetParent)[4]?.click());
await page.waitForSelector(".leaflet-container", { timeout: 15000 });
await wait(2500);
ok(await page.evaluate(() => document.querySelectorAll(".leaflet-overlay-pane path").length >= 1), "the Satellite tab map shows the field outline");
ok((await overflow()) <= 0, "no sideways scrolling in the Satellite tab", `${await overflow()}px`);
await shot("5-satellite");

// ── editing: the outline comes back, and can be removed ──────────────────────────────────────────────────────────
await page.goto(`${base}/onboarding`, { waitUntil: "networkidle0" });
await page.waitForSelector(".leaflet-container");
await wait(2500);
ok(await page.evaluate(() => document.querySelectorAll(".leaflet-overlay-pane path").length >= 1), "editing a farm shows its saved outline");
ok(T.saved.test(await page.evaluate(() => document.body.innerText)), "…with its area");
ok(await clickBtn(T.edit), "the Edit outline button is offered");
await wait(400);
ok(await page.evaluate(() => document.querySelectorAll(".gd-corner").length === 4), "editing shows draggable handles on the saved corners");
// drag the first corner and see the area change
const before = await hectares();
const h = await page.evaluate(() => { const r = document.querySelector(".gd-corner").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x - 40, h.y - 40, { steps: 8 }); await page.mouse.up();
await wait(400);
const after = await hectares();
ok(Math.abs(after - before) > 0.05, "dragging a corner changes the outline and its area", `${before} → ${after} ha`);
await clickBtn(T.done);
await wait(500);
await clickBtn(T.remove);
await wait(400);
ok(!T.saved.test(await page.evaluate(() => document.querySelector('section[aria-labelledby="outline-title"]')?.innerText ?? "")), "Remove outline takes it away");
await clickBtn(T.next); await wait(500);
const editable = await page.evaluate(() => !document.querySelector('input[inputmode="decimal"]').readOnly);
ok(editable, "without an outline the area is typed by hand again");
await clickBtn(T.next); await wait(500);
await clickBtn(T.next); await wait(500);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {}), clickBtn(T.save)]);
await wait(1500);
const farm2 = await page.evaluate(async () => (await (await fetch("/api/farm")).json()).farm);
ok(farm2?.polygon === null, "the removed outline is gone from the saved farm");

ok(errors.length === 0, "no console errors", errors.slice(0, 3).join(" | ").slice(0, 300));
console.log(failed ? `\n${failed} check(s) failed` : "\nOutline UI OK");
await browser.close();
process.exit(failed ? 1 : 0);
