// node scripts/browser/pages.mjs <baseUrl> <outDir> "<path>:<lang>,<path>:<lang>,..." [mobile|desktop]
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", spec = "/:en", device = "mobile"] = process.argv;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

const vp =
  device === "mobile"
    ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { width: 1440, height: 900, deviceScaleFactor: 1 };

for (const item of spec.split(",")) {
  const [path, lang] = item.split(":");
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewport(vp);
  await page.evaluateOnNewDocument((l) => {
    try {
      localStorage.setItem("gd-lang", l);
    } catch {}
  }, lang);
  await page.goto(base + path, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  const info = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dir: document.documentElement.dir,
    lang: document.documentElement.lang,
    font: getComputedStyle(document.body).fontFamily.slice(0, 60),
  }));
  const name = `${path.replace(/[^a-z0-9]+/gi, "_") || "home"}-${lang}-${device}.png`;
  await page.screenshot({ path: `${out}/${name}`, fullPage: true });
  console.log(`${path} [${lang}] ${device}: dir=${info.dir} lang=${info.lang} overflow=${info.overflow}px errors=${errors.length} → ${name}`);
  errors.slice(0, 4).forEach((e) => console.log("   ERR", e.slice(0, 240)));
  await page.close();
}
await browser.close();
