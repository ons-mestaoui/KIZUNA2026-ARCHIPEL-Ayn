// Screenshot harness: real mobile emulation + desktop, console errors, overflow check.
// node scripts/browser/shoot.mjs <url> <outDir> [script]   script = "default" | "pour" | "energy" | "night"
import puppeteer from "puppeteer-core";

const [, , url = "http://localhost:3000/", out = ".", script = "default"] = process.argv;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

const devices = [
  { name: "mobile", viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: "desktop", viewport: { width: 1440, height: 900, deviceScaleFactor: 1 } },
];

const clickText = async (page, text) => {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button")].find((b) => b.textContent.trim().includes(t) && b.offsetParent);
    el?.click();
    return !!el;
  }, text);
  if (!ok) console.log("  (no button:", text, ")");
};

for (const d of devices) {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  if (d.viewport.isMobile)
    await page.setUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
    );
  await page.setViewport(d.viewport);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  if (script === "pour") {
    await clickText(page, "Pour water");
    await new Promise((r) => setTimeout(r, 2200));
    await clickText(page, "Pour water");
    await new Promise((r) => setTimeout(r, 2200));
  } else if (script === "energy") {
    await clickText(page, "Energy");
    await new Promise((r) => setTimeout(r, 800));
  } else if (script === "noon") {
    await page.keyboard.press("Tab");
    await page.evaluate(() => {
      const s = document.querySelector('[role="slider"]');
      s.focus();
    });
    for (let i = 0; i < 26; i++) await page.keyboard.press("ArrowRight");
    await new Promise((r) => setTimeout(r, 1500));
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const canvas = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    return c ? `${c.clientWidth}x${c.clientHeight}` : "none";
  });
  const file = `${out}/${script}-${d.name}.png`;
  await page.screenshot({ path: file, fullPage: d.name === "mobile" });
  console.log(`${d.name}: canvas ${canvas}, horizontal overflow ${overflow}px, errors ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log("   ERR", e.slice(0, 300)));
  await page.close();
}
await browser.close();
