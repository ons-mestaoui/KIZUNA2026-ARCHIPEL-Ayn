// A farmer in a field with no signal, on a shared phone.   node scripts/browser/offline-farmer.mjs <base> <outDir>
//  1. sign up, create a farm, open the app → the plan is saved on the device
//  2. the plan request fails (simulated) → the saved plan shows with a "No connection" banner
//  3. sign-in as SOMEONE ELSE on the same device, whose first request fails → must NOT see farmer A's plan
//  4. sign-out clears the saved plan
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3001", out = "."] = process.argv;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => { try { if (!localStorage.getItem("gd-lang")) localStorage.setItem("gd-lang", "en"); } catch {} });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };
const J = (b, method = "POST") => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const api = (path, init) => page.evaluate(async (p, i) => { const r = await fetch(p, i); return { status: r.status }; }, path, init);

// make /api/state fail on demand, like a field with no signal
let blockState = false;
await page.setRequestInterception(true);
page.on("request", (req) => (blockState && req.url().includes("/api/state") ? req.abort("internetdisconnected") : req.continue()));

const farm = (name, lat, lon, placeName) => ({
  name, lat, lon, placeName, crop: "citrus", areaHa: 2, soilTexture: "loam", irrigationMethod: "drip", waterSource: "solar_basin",
  basinM3: 60, pvKWp: 3, pumpHeadM: 15, wellSafeYieldM3h: 20, lastIrrigated: "1-2d", lang: "en",
});
const body = () => page.evaluate(() => document.body.innerText);
const cached = () => page.evaluate(() => localStorage.getItem("gd-state-v1"));

// ---- 1. farmer A ----
const stamp = Date.now();
await page.goto(`${base}/sign-in`, { waitUntil: "networkidle0" });
await api("/api/auth/sign-up/email", J({ name: "Amel", email: `fa+${stamp}@example.com`, password: "farmer-a-pass-1" }));
await api("/api/farm", J(farm("Amel's citrus", 36.4561, 10.7376, "Nabeul"), "PUT"));
await page.goto(`${base}/app`, { waitUntil: "networkidle0", timeout: 60000 });
await wait(2500);
ok(!!(await cached()), "the plan is saved on the device after a normal load");
const online = await body();
ok(!/No connection/i.test(online), "no banner while online");

// ---- 2. no signal ----
blockState = true;
await page.reload({ waitUntil: "networkidle0", timeout: 60000 });
await wait(2500);
const offline = await body();
ok(/No connection\. Showing the plan saved/i.test(offline), "with no signal: banner 'No connection. Showing the plan saved …'", offline.replace(/\s+/g, " ").match(/No connection[^.]*\.[^.]*\./)?.[0] ?? "");
ok(/Nabeul|Amel/i.test(offline) || /water|irrigat/i.test(offline), "…and the saved plan is still on screen");
await page.screenshot({ path: `${out}/offline-farmer-1-banner.png` });

// ---- 3. a different person signs in on the same device while offline-ish ----
blockState = false;
await page.evaluate(() => fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
// (the previous farmer did NOT press the sign-out button, so the saved plan is still on the device)
ok(!!(await cached()), "scenario: the previous farmer's plan is still saved on the device");
await page.goto(`${base}/sign-in`, { waitUntil: "networkidle0" });
// farmer B exists already, with a farm somewhere else
await api("/api/auth/sign-up/email", J({ name: "Bilel", email: `fb+${stamp}@example.com`, password: "farmer-b-pass-1" }));
await api("/api/farm", J(farm("Bilel's olives", 33.8869, 9.5375, "Tunisia, far south"), "PUT"));
await api("/api/auth/sign-out", J({}));
await page.goto(`${base}/sign-in`, { waitUntil: "networkidle0" });
await wait(500);
await page.type('input[name="email"]', `fb+${stamp}@example.com`);
await page.type('input[name="password"]', "farmer-b-pass-1");
blockState = true; // B's first plan request fails
await Promise.all([page.waitForFunction(() => location.pathname === "/app", { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
await wait(3000);
const bView = await body();
ok(new URL(page.url()).pathname === "/app", "farmer B signs in and lands on /app", page.url());
const leakedBanner = /No connection\. Showing the plan saved/i.test(bView);
const leakedName = /Amel|Nabeul/i.test(bView);
ok(!leakedBanner && !leakedName, "B does NOT see farmer A's saved plan", leakedBanner || leakedName ? `LEAK: ${leakedBanner ? "A's saved plan shown with the offline banner" : ""} ${leakedName ? "A's name/place on screen" : ""}`.trim() : "clean");
await page.screenshot({ path: `${out}/offline-farmer-2-other-user.png` });

// ---- 4. sign-out button clears it ----
blockState = false;
await page.reload({ waitUntil: "networkidle0", timeout: 60000 });
await wait(2500);
ok(!!(await cached()), "B's own plan is saved after a normal load");
await page.evaluate(() => [...document.querySelectorAll("header button")].filter((x) => x.offsetParent).at(-1)?.click()); // the gear in the header opens the Farm tab
await wait(800);
const hadSignOut = await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => /sign out/i.test(b.innerText)));
ok(hadSignOut, "the Farm tab has a Sign out button");
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /sign out/i.test(b.innerText))?.click());
await page.waitForFunction(() => location.pathname === "/", { timeout: 15000 }).catch(() => {});
ok(new URL(page.url()).pathname === "/", "sign-out returns to the landing page", page.url());
ok((await cached()) === null, "sign-out removes the saved plan from the device");

ok(errors.filter((e) => !/status of [45]\d\d|Failed to load resource|ERR_|net::/.test(e)).length === 0, "no unexpected console errors", errors.slice(0, 2).join(" | ").slice(0, 300));
console.log(failed ? `\n${failed} check(s) failed` : "\nOffline farmer OK");
await browser.close();
process.exit(failed ? 1 : 0);
