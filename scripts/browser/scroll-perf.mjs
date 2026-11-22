// Scroll smoothness of the landing page: frame times while scrolling through the hero, with one suspect switched off at a time.
//   node scripts/browser/scroll-perf.mjs          (GPU=1 uses the real graphics card; without it, software rendering, which exaggerates costs)
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: process.env.GPU ? ["--use-angle=d3d11", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const VARIANTS = {
  baseline: "",
  "no ring rotation": ".ay-spin{animation:none!important}",
  "no rings at all": ".ay-iris-wrap{display:none!important}",
  "no nav blur": "header .backdrop-blur-md, header div{backdrop-filter:none!important}",
  "rings+nav off": ".ay-iris-wrap{display:none!important} header div{backdrop-filter:none!important}",
  "video hidden": "video{visibility:hidden!important}",
  "all three off": ".ay-iris-wrap{display:none!important} header div{backdrop-filter:none!important} video{visibility:hidden!important}",
};
for (const [name, css] of Object.entries(VARIANTS)) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
  if (css) await page.addStyleTag({ content: css });
  await new Promise((r) => setTimeout(r, 2500));
  const r = await page.evaluate(async () => {
    const times = [];
    let last = performance.now();
    const start = last;
    const total = 5000;
    await new Promise((res) => {
      const tick = (t) => {
        times.push(t - last); last = t;
        const k = (t - start) / total;
        window.scrollTo({ top: Math.min(1, k) * 1800, behavior: "instant" });
        if (k < 1) requestAnimationFrame(tick);
        else res();
      };
      requestAnimationFrame(tick);
    });
    times.shift();
    const s = [...times].sort((a, b) => a - b);
    return { frames: times.length, mean: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), worst: +s[s.length - 1].toFixed(1) };
  });
  console.log(name.padEnd(18), JSON.stringify(r));
  await page.close();
}
await browser.close();
