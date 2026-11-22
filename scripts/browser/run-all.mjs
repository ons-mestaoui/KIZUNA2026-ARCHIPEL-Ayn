// Runs every browser suite against one running server and prints one verdict line per suite.
//   node scripts/browser/run-all.mjs [baseUrl] [--photo=leaf.jpg] [--lan=http://192.168.1.20:3000]
//
// The suites drive a real Chrome on a phone-sized screen (mobile emulation, touch) and on a desktop, in English,
// Arabic (right-to-left) and Japanese, and fail on console errors or sideways scrolling. Needs Chrome
// (set CHROME_PATH if it is not at the usual Windows location) and `npm install`. Screenshots go to browser-out/.
//   --photo   a photo of a tomato leaf with Tuta absoluta damage: adds the Leaf check and Ask suites, which
//             call the live AI (they use up a little of the free quota)
//   --lan     the laptop's address as a phone would use it: adds the "phone on the Wi-Fi" suites
//
// Not included, because they need the server started in a special way:
//   offline.mjs  the Wi-Fi-off rehearsal: start the server with DEMO_OFFLINE=1 (see the README)
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000").replace(/\/$/, "");
const photo = flag("photo");
const lan = flag("lan");
const out = "browser-out";
mkdirSync(out, { recursive: true });

const suites = [
  ["landing (en, phone)", "landing.mjs", [base, out, "en", "phone"]],
  ["landing (ar, phone)", "landing.mjs", [base, out, "ar", "phone"]],
  ["landing (ja, phone)", "landing.mjs", [base, out, "ja", "phone"]],
  ["landing (en, desktop)", "landing.mjs", [base, out, "en", "desktop"]],
  ["landing (ar, desktop)", "landing.mjs", [base, out, "ar", "desktop"]],
  ["landing (ja, desktop)", "landing.mjs", [base, out, "ja", "desktop"]],
  ["onboarding (en)", "flow.mjs", [base, out, "en"]],
  ["onboarding (ar)", "flow.mjs", [base, out, "ar"]],
  ["onboarding (ja)", "flow.mjs", [base, out, "ja"]],
  ["refused save explained", "save-refused.mjs", [base, out]],
  ["kit in the field view + Play", "equipment.mjs", [base, out]],
  ["field outline (en)", "outline.mjs", [base, out, "en"]],
  ["field outline (ar)", "outline.mjs", [base, out, "ar"]],
  ["field outline (ja)", "outline.mjs", [base, out, "ja"]],
  ["field view (en)", "field.mjs", [base, out, "en"]],
  ["field view (ar)", "field.mjs", [base, out, "ar"]],
  ["field view (ja)", "field.mjs", [base, out, "ja"]],
  ["farmer app, solar + basin", "app.mjs", [base, out, "solar_basin"]],
  ["farmer app, grid water", "app.mjs", [base, out, "grid"]],
  ["satellite tab", "sat.mjs", [base, out]],
  ["no signal + shared phone", "offline-farmer.mjs", [base, out]],
  ["demo", "demo-ui.mjs", [base, out]],
  ["demo field (en)", "demo-field.mjs", [base, out, "en"]],
  ["demo field (ar)", "demo-field.mjs", [base, out, "ar"]],
  ["demo field (ja)", "demo-field.mjs", [base, out, "ja"]],
  ["demo QR + e-mail door", "demo-door.mjs", [base, out, ...(lan ? [lan] : [])]],
  ...(lan ? [["phone on the Wi-Fi", "lan-check.mjs", [lan]]] : []),
  ...(photo
    ? [
        ["leaf check (en)", "leaf.mjs", [base, out, photo, "en"]],
        ["leaf check (ar)", "leaf.mjs", [base, out, photo, "ar"]],
        ["leaf check (ja)", "leaf.mjs", [base, out, photo, "ja"]],
        ["ask (en)", "ask-ui.mjs", [base, out, photo, "en"]],
        ["ask (ar)", "ask-ui.mjs", [base, out, photo, "ar"]],
      ]
    : []),
];

let bad = 0;
console.log(`Browser suites against ${base}\n`);
for (const [label, file, argv] of suites) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [join(here, file), ...argv], { encoding: "utf8", timeout: 240_000 });
  const lines = `${run.stdout ?? ""}\n${run.stderr ?? ""}`.split("\n");
  const passed = lines.filter((l) => l.startsWith("PASS")).length;
  const failures = lines.filter((l) => l.startsWith("FAIL"));
  const crashed = run.status !== 0 && failures.length === 0; // e.g. Chrome not found, a timeout
  if (failures.length || crashed) bad++;
  console.log(`${failures.length || crashed ? "FAIL" : "ok  "}  ${label.padEnd(28)} ${String(passed).padStart(2)} checks  ${((Date.now() - started) / 1000).toFixed(0)} s`);
  for (const f of failures) console.log(`        ${f.trim().slice(0, 150)}`);
  if (crashed) console.log(`        ${(run.error?.message ?? lines.filter(Boolean).slice(-3).join(" | ")).slice(0, 200)}`);
}
console.log(bad ? `\n${bad} suite(s) failed` : "\nAll browser suites passed");
process.exit(bad ? 1 : 0);
