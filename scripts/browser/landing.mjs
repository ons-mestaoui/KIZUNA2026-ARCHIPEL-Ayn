// The public landing page: layout in every language, the hidden pitch-mode doors, accessibility and reduced motion.
//   node scripts/browser/landing.mjs <base> <outDir> [lang] [desktop]
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = ".", lang = "en", device = "phone"] = process.argv;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`);
  if (!c) failed++;
};
const phone = device !== "desktop";
const viewport = phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1 };

async function open({ reduced = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && !/status of (4\d\d|5\d\d)|ERR_|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewport(viewport);
  if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluateOnNewDocument((l) => { try { localStorage.setItem("gd-lang", l); } catch {} }, lang);
  await page.goto(`${base}/`, { waitUntil: "networkidle0", timeout: 90000 });
  await wait(1800);
  return { page, ctx, errors };
}
const scrollTo = async (page, y) => { await page.evaluate((v) => window.scrollTo({ top: v, behavior: "instant" }), y); await wait(900); };
const shot = (page, name) => page.screenshot({ path: `${out}/landing-${device}-${lang}-${name}.png` });

// 1. the page, scrolled through
{
  const { page, ctx, errors } = await open();
  const vh = viewport.height;
  const info = await page.evaluate(() => ({
    dir: document.documentElement.dir,
    lang: document.documentElement.lang,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    h1: document.querySelector("h1")?.textContent ?? "",
    height: document.documentElement.scrollHeight,
  }));
  ok(info.overflow <= 0, "no sideways overflow at the top", `${info.overflow}px`);
  ok(info.lang === lang && info.dir === (lang === "ar" ? "rtl" : "ltr"), "language and direction applied", `${info.lang}/${info.dir}`);
  ok(info.h1.length > 10, "the headline is there", info.h1.slice(0, 60));
  await shot(page, "00-top");
  for (const [i, f] of [0.35, 0.75, 1.15, 1.6, 2.0].entries()) {
    await scrollTo(page, f * vh);
    await shot(page, `${String(i + 1).padStart(2, "0")}-stage-${f}`);
  }
  for (const id of ["day", "languages", "honest", "about"]) {
    const y = await page.evaluate((s) => document.getElementById(s)?.getBoundingClientRect().top + window.scrollY, id);
    ok(y !== null && y !== undefined && !Number.isNaN(y), `section #${id} exists`);
    await scrollTo(page, y);
    await shot(page, `sec-${id}`);
  }
  const team = await page.evaluate(() => [...document.querySelectorAll("#about img")].map((i) => ({ ok: i.complete && i.naturalWidth > 0, alt: i.alt })));
  await page.evaluate(() => document.querySelector("#about ul")?.scrollIntoView({ block: "center" }));
  await wait(800);
  await shot(page, "sec-team");
  ok(team.length === 4 && team.every((t) => t.ok), "four team portraits load", team.map((t) => t.alt).join(" | ").slice(0, 120));
  ok(team.every((t) => t.alt.length > 8), "each portrait has a descriptive alt text");
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await wait(800);
  await shot(page, "sec-end");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 0, "no sideways overflow after scrolling the whole page", `${overflow}px`);
  ok(errors.length === 0, "no console errors", errors.slice(0, 2).join(" | ").slice(0, 300));
  await ctx.close();
}

// 2. the pitch mode stays hidden, and its doors still work
{
  const { page, ctx } = await open();
  const text = await page.evaluate(() => document.body.innerText);
  ok(!/demo/i.test(text), "no visible text mentions the pitch mode");
  ok(!(await page.evaluate(() => [...document.querySelectorAll("a")].some((a) => /demo/i.test(a.getAttribute("href") ?? "")))), "no link points to it");
  const first = await page.evaluate(() => { const a = document.querySelector("header a"); return a ? a.getAttribute("href") + "|" + a.getAttribute("aria-label") : null; });
  ok(first === "/|Ayn", "the logo is the first link in the header", first ?? "none");
  await ctx.close();
}

// 3. keyboard: the skip link comes first and works; the menu (phone) opens, traps focus, closes with Esc
{
  const { page, ctx } = await open();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => ({ href: document.activeElement?.getAttribute("href"), text: document.activeElement?.textContent }));
  ok(focused.href === "#main", "the first Tab stop is the skip link", focused.text ?? "");
  await page.keyboard.press("Enter");
  await wait(400);
  ok(await page.evaluate(() => document.activeElement?.id === "main"), "the skip link moves focus to the main content");
  if (phone) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const btn = await page.$('header button[aria-controls="ay-sheet"]');
    await btn.click();
    await wait(900);
    ok(await page.evaluate(() => !!document.querySelector('#ay-sheet[role="dialog"][aria-modal="true"]')), "the menu opens as a modal dialog");
    ok(await page.evaluate(() => document.getElementById("ay-sheet").contains(document.activeElement)), "focus moves into the menu");
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    ok(await page.evaluate(() => document.getElementById("ay-sheet").contains(document.activeElement)), "Tab stays inside the menu");
    await shot(page, "menu");
    await page.keyboard.press("Escape");
    await wait(2000);
    ok(await page.evaluate(() => !document.getElementById("ay-sheet")), "Esc closes the menu");
    ok(await page.evaluate(() => document.activeElement?.getAttribute("aria-controls") === "ay-sheet"), "focus returns to the menu button");
  } else {
    const links = await page.evaluate(() => [...document.querySelectorAll('header nav a')].map((a) => a.getAttribute("href")));
    ok(links.length === 4 && links.every((h) => h.startsWith("#")), "four anchor links in the nav", links.join(" "));
    await page.click('header nav a[href="#languages"]');
    await wait(5000);
    const cur = await page.evaluate(() => document.querySelector('header nav a[aria-current="location"]')?.getAttribute("href"));
    ok(cur === "#languages", "the nav marks the section being read", cur ?? "none");
  }
  await ctx.close();
}

// 4. "Watch it work": a modal that plays and closes
{
  const { page, ctx } = await open();
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Watch it work|شاهده يعمل|動くところを見る/.test(b.textContent))?.click());
  await wait(1200);
  const st = await page.evaluate(() => { const d = document.querySelector("dialog"); const v = d?.querySelector("video"); return { open: !!d?.open, video: !!v, controls: !!v?.controls }; });
  ok(st.open && st.video && st.controls, "the tour opens in a dialog with a video and controls");
  await shot(page, "tour");
  await page.keyboard.press("Escape");
  await wait(1500);
  ok(await page.evaluate(() => !document.querySelector("dialog")?.open && !document.querySelector("dialog video")), "Esc closes it and removes the video");
  await ctx.close();
}

// 5. reduced motion: nothing autoplays, nothing is pinned, everything is still readable
{
  const { page, ctx, errors } = await open({ reduced: true });
  const st = await page.evaluate(() => ({
    playing: [...document.querySelectorAll("video")].filter((v) => !v.paused).length,
    height: document.documentElement.scrollHeight,
    h2: !!document.querySelector("#field h2"),
  }));
  ok(st.playing === 0, "no video autoplays under reduced motion", String(st.playing));
  ok(st.h2, "the field section is plain content under reduced motion");
  await shot(page, "reduced-top");
  await scrollTo(page, viewport.height * 1.2);
  await shot(page, "reduced-field");
  ok(errors.length === 0, "no console errors", errors.slice(0, 2).join(" | ").slice(0, 200));
  await ctx.close();
}

console.log(failed ? `\n${failed} check(s) failed` : "\nLanding OK");
await browser.close();
process.exit(failed ? 1 : 0);
