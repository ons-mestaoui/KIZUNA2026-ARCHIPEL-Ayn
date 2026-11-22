// The farm's kit in the field view (solar panels, pump house, well, basin, drip lines) and the Play button.
//   node scripts/browser/equipment.mjs <base> <outDir> [lang] [desktop]
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", lang = "en", device = "phone"] = process.argv;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && !/status of (4\d\d|5\d\d)|ERR_|tile|\.jpg|\.png|Failed to load resource/.test(m.text()) && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.setViewport(device === "desktop" ? { width: 1440, height: 900, deviceScaleFactor: 1 } : { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };
const heroBox = () => page.evaluate(() => { const c = document.querySelector("main canvas"); const r = c?.closest(".overflow-hidden")?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; });
const shot = async (name) => page.screenshot({ path: `${out}/equipment-${device}-${lang}-${name}.png`, clip: await heroBox() });
const readout = () => page.evaluate(() => document.querySelector("[role=slider]")?.previousElementSibling?.textContent.replace(/\s+/g, " ").trim() ?? "");
const labels = () => page.evaluate(() => [...document.querySelectorAll(".twin-chip")].map((e) => e.textContent.trim()).filter(Boolean));
const at = async (hour) => {
  const r = await page.evaluate(() => { const b = document.querySelector("[role=slider]").getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  await page.mouse.click(r.x + (hour / 24) * r.w, r.y + r.h / 2);
  await wait(1500);
};

await page.goto(`${base}/?demo=kizuna`, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForSelector("main canvas", { timeout: 30000 });
await wait(7500);

const names = await labels();
ok(names.length >= 2, "the pad's labels are there", names.join(" | "));
await at(2);
await shot("night");
for (const h of [7, 10, 13, 16]) {
  await at(h);
  console.log(`   ${String(h).padStart(2, "0")}:00`, "|", (await readout()).slice(0, 80), "|", (await labels()).join(" / "));
  await shot(`h${h}`);
}

// Play moves the clock while the real field is showing (it used to run only in the diagram view)
await at(6);
const before = await readout();
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Play the day|شغّل|再生/.test(b.getAttribute("aria-label") ?? ""))?.click());
await wait(3500);
const after = await readout();
ok(before.slice(0, 5) !== after.slice(0, 5), "Play advances the clock in the field view", `${before.slice(0, 5)} → ${after.slice(0, 5)}`);
await shot("playing");
ok(errors.length === 0, "no console errors", errors.slice(0, 2).join(" | ").slice(0, 300));
console.log(failed ? `\n${failed} check(s) failed` : "\nEquipment OK");
await browser.close();
process.exit(failed ? 1 : 0);
