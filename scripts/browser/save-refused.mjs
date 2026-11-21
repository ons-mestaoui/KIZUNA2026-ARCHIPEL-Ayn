// When the server refuses a value on save, the wizard says which one and goes to the step that holds it.
//   node scripts/browser/save-refused.mjs <base> <outDir>
// (a field of more than ~50 ha used to be estimated past the server's limits and failed with a bare HTTP 422)
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000", out = "."] = process.argv;
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
await page.evaluateOnNewDocument(() => { try { localStorage.setItem("gd-lang", "en"); } catch {} });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };
const clickBtn = (text) => page.evaluate((t) => { const el = [...document.querySelectorAll("button, a")].find((b) => b.textContent.trim().includes(t) && b.offsetParent !== null && !b.disabled); el?.click(); return !!el; }, text);
const body = () => page.evaluate(() => document.body.innerText);

// refuse the first save the way the server does for a value out of range
let refuse = true;
await page.setRequestInterception(true);
page.on("request", (req) => {
  if (refuse && req.method() === "PUT" && req.url().endsWith("/api/farm")) {
    refuse = false;
    return req.respond({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "invalid", issues: [{ path: ["wellSafeYieldM3h"], message: "Too big: expected number to be <=1000" }] }) });
  }
  req.continue();
});

await page.goto(`${base}/sign-up`, { waitUntil: "networkidle0" });
await page.type('input[name="name"]', "Refused Tester");
await page.type('input[name="email"]', `refused+${Date.now()}@example.com`);
await page.type('input[name="password"]', "refused-test-pass-1");
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
await wait(1500);
await page.waitForSelector(".leaflet-container");
await clickBtn("Use my location");
await wait(3000);
for (let i = 0; i < 3; i++) { await clickBtn("Next"); await wait(600); }
ok(/Step 4 of 4/.test(await body()), "on the last step");
await clickBtn("Save and see");
await wait(2000);
const text = await body();
ok(/Step 3 of 4/.test(text), "a refused pump value sends the farmer back to the water step", text.match(/Step \d of 4/)?.[0]);
ok(/Check the pump details/.test(text), "…and says what to check", text.match(/Check the pump details[^.]*\./)?.[0]);
await page.screenshot({ path: `${out}/save-refused.png`, fullPage: true });

// fixing nothing and trying again goes through (the refusal was a one-off)
await clickBtn("Next"); await wait(600);
await clickBtn("Next"); await wait(600);
await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {}), clickBtn("Save and see")]);
await wait(2000);
ok(page.url().endsWith("/app"), "the next save lands on /app", page.url());

ok(errors.length === 0, "no console errors", errors.slice(0, 2).join(" | ").slice(0, 300));
console.log(failed ? `\n${failed} check(s) failed` : "\nRefused-save UI OK");
await browser.close();
process.exit(failed ? 1 : 0);
