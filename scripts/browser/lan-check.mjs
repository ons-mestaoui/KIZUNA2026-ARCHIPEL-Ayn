// What a phone on the Wi-Fi sees: open the app through the laptop's LAN address (not localhost).
//   node scripts/browser/lan-check.mjs <base>        e.g. http://172.17.7.252:3000
// Checks that the page HYDRATES (the language switch works, so the dev server did not block /_next assets)
// and that an account can be created from that origin (Better Auth trusted origins).
import puppeteer from "puppeteer-core";

const [, , base = "http://localhost:3000"] = process.argv;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (c, label, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); if (!c) failed++; };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const problems = [];
page.on("console", (m) => (m.type() === "error" || /cross.origin|blocked/i.test(m.text())) && problems.push(m.text().slice(0, 150)));
page.on("pageerror", (e) => problems.push(String(e).slice(0, 150)));
page.on("requestfailed", (r) => problems.push(`failed: ${r.url().slice(0, 90)} ${r.failure()?.errorText}`));
page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url().slice(0, 90)}`));
await page.setViewport({ width: 1280, height: 800 });

await page.goto(base, { waitUntil: "networkidle0", timeout: 60000 });
await wait(2000);
ok(new URL(page.url()).origin === new URL(base).origin, "the page loads from this address", page.url());
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /العربية/.test(b.innerText))?.click());
await wait(1000);
const dir = await page.evaluate(() => document.documentElement.dir);
ok(dir === "rtl", "the page hydrates (language switch → Arabic, right-to-left)", `dir="${dir}"`);

const res = await page.evaluate(async () => {
  const r = await fetch("/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "LAN", email: `lan+${Date.now()}@example.com`, password: "lan-test-pass-123" }) });
  return { status: r.status, body: await r.text() };
});
ok(res.status === 200, "an account can be created from this address", `HTTP ${res.status} ${res.status === 200 ? "" : res.body.slice(0, 80)}`);

if (problems.length) console.log("   problems seen:\n   - " + [...new Set(problems)].slice(0, 6).join("\n   - "));
console.log(failed ? `\n${failed} check(s) failed` : "\nLAN access OK");
await browser.close();
process.exit(failed ? 1 : 0);
