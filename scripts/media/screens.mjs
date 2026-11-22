// Phone screens of the app for the landing page's Languages section, in each UI language.
//   node scripts/media/screens.mjs [base]        writes public/media/screen-<plan|ask|space>-<en|ar|ja>.webp
// They come from the pitch mode (real heatwave data and the real Sentinel-2 field) with its "Demo" badge hidden.
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const base = process.argv[2] ?? "http://localhost:3000";
const OUT = "public/media";
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const lang of ["en", "ar", "ja"]) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);
  await page.goto(`${base}/api/demo/enter`, { waitUntil: "networkidle0", timeout: 90000 });
  await wait(9000);

  const tidy = () =>
    page.evaluate(() => {
      document.querySelector("nextjs-portal")?.remove(); // the dev-server badge
      // the pitch mode's own "Demo" badge: the page it sits on is shown as a product screenshot
      for (const el of document.querySelectorAll("header span, header div")) if (el.children.length === 0 && /^(demo|デモ|عرض تجريبي|تجريبي)$/i.test(el.textContent.trim())) el.style.visibility = "hidden";
    });
  const save = async (name) => {
    await tidy();
    const png = await page.screenshot({ type: "png" });
    const info = await sharp(png).webp({ quality: 80 }).toFile(`${OUT}/screen-${name}-${lang}.webp`);
    console.log(`${name}-${lang}`, Math.round(info.size / 1024), "KB");
  };
  const tab = (i) =>
    page.evaluate((n) => [...document.querySelectorAll("nav button")].filter((b) => b.offsetParent)[n]?.click(), i);

  await save("plan");
  await tab(2); // Ask
  await wait(1800);
  // English: the empty chat with its suggested questions (the live answer comes back in Tunisian Latin script there)
  if (lang !== "en") await page.evaluate(() => {
    const b = [...document.querySelectorAll("main button")].find((x) => x.offsetParent && !x.closest("nav, header") && x.textContent.trim().length > 12);
    b?.click();
  });
  await wait(5000);
  await save("ask");
  await tab(3); // Satellite
  await wait(5000);
  await save("space");
  await ctx.close();
}
await browser.close();
