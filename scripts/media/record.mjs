// Records the footage the landing page uses, from the real app (the pitch mode, run locally).
//   node scripts/media/record.mjs <clip> [base]       clip: orbit | day | still | all
// Frames land in browser-out/media/<clip>/ (gitignored); scripts/media/encode.mjs turns them into public/media/.
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const [, , which = "all", base = "http://localhost:3000"] = process.argv;
const OUT = "browser-out/media";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(lang = "en") {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("framenavigated", (f) => f === page.mainFrame() && console.log("  navigated:", f.url()));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 }); // sharp enough to crop in on the field
  await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);
  await page.goto(`${base}/api/demo/enter`, { waitUntil: "networkidle0", timeout: 90000 }); // the same door as /?demo=kizuna, without the landing page
  await page.waitForSelector("main canvas", { timeout: 60000 });
  await wait(9000); // fly-in + textures
  return { page, ctx };
}

/** A 16:10 window around the middle of the canvas, where the field and its kit orbit. */
const tight = (box) => ({ x: box.x + (box.width - 640) / 2 + 20, y: box.y + (box.height - 400) / 2 + 10, width: 640, height: 400 });

/** The field view alone: hides the controls laid over the canvas, keeps the zone letters and the equipment labels. */
const clean = (page) =>
  page.evaluate(() => {
    const root = document.querySelector("main canvas")?.closest(".overflow-hidden");
    [...(root?.children ?? [])].forEach((el, i) => { if (i >= 2) el.style.display = "none"; });
    const r = root.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });

/**
 * Deterministic capture: step the scene, wait for a render, take a still. ffmpeg stitches the stills
 * (the live 3D drops to ~5 fps while it is being screen-recorded, so a real-time recording is choppy).
 */
async function frames(page, name, crop, count, step, settleMs = 110) {
  const dir = `${OUT}/${name}`;
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  for (let i = 0; i < count; i++) {
    await step(i, count);
    await wait(settleMs);
    await page.screenshot({ path: `${dir}/${String(i).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92, clip: crop });
  }
  console.log(`captured ${count} frames of ${name} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

const clips = {
  // a slow orbit over the field and its kit: the hero loop (the encoder makes it ping-pong so it loops)
  async orbit() {
    const { page, ctx } = await open();
    const box = await clean(page);
    const from = [box.x + 640, box.y + 110];
    await page.mouse.move(...from);
    await page.mouse.down();
    await frames(page, "orbit", tight(box), 144, async (i) => {
      await page.mouse.move(from[0] + i * 0.7, from[1]);
    });
    await page.mouse.up();
    await ctx.close();
  },
  // the day: dawn to dusk with the panels, pump, basin and drip lines working
  async day() {
    const { page, ctx } = await open();
    const box = await clean(page);
    const slider = await page.evaluate(() => {
      const b = document.querySelector("[role=slider]").getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    await frames(page, "day", tight(box), 240, async (i, n) => {
      const hour = 4.5 + (i / (n - 1)) * 16.5; // 04:30 → 21:00
      await page.mouse.click(slider.x + (hour / 24) * slider.w, slider.y + slider.h / 2);
    });
    await ctx.close();
  },
  // one still, to frame the shot before the long captures
  async still() {
    const { page, ctx } = await open();
    const box = await clean(page);
    await page.screenshot({ path: `${OUT}/still.jpg`, type: "jpeg", quality: 92, clip: tight(box) });
    await ctx.close();
  },
};

const todo = which === "all" ? ["orbit", "day"] : [which];
for (const k of todo) {
  if (!clips[k]) throw new Error(`unknown clip ${k}`);
  await clips[k]();
}
await browser.close();
