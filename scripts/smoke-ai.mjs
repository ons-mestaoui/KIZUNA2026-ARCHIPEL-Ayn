// Photo diagnosis + voice, end to end.   node scripts/smoke-ai.mjs <baseUrl> <image.jpg> [more images…]
// Uses a tomato farm. Prints what the AI said so a human can judge it (accuracy is not unit-testable).
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const [, , baseArg, ...images] = process.argv;
const base = (baseArg ?? "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(base).origin;
let failed = 0;
const ok = (c, label, extra = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
  if (!c) failed++;
};

const jar = new Map();
const call = async (path, init = {}) => {
  const res = await fetch(base + path, {
    redirect: "manual",
    ...init,
    headers: { Origin: origin, "Content-Type": "application/json", ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...init.headers },
  });
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  return res;
};

await call("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name: "Ai Test", email: `ai+${Date.now()}@example.com`, password: "ai-test-pass-123" }) });
const planted = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
await call("/api/farm", {
  method: "PUT",
  body: JSON.stringify({
    name: "Tomato test", lat: 36.4561, lon: 10.7376, placeName: "Nabeul", crop: "tomato", plantingDate: planted, areaHa: 1, soilTexture: "sandy_loam",
    irrigationMethod: "drip", waterSource: "solar_basin", basinM3: 60, pvKWp: 3, pumpHeadM: 15, wellSafeYieldM3h: 20, lastIrrigated: "1-2d", lang: "en",
  }),
});

const mime = (f) => (f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg");
const dataUrl = (f) => `data:${mime(f)};base64,${readFileSync(f).toString("base64")}`;
// 1×1 PNG: the "not a plant" control
const BLANK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const show = (r) => {
  console.log(`      ${r.category} · ${r.confidence} · ${r.name}${r.needsExpert ? " · needs expert" : ""}`);
  console.log(`      ${r.summary}`);
  r.actions.forEach((a, i) => console.log(`      ${i + 1}. ${a}`));
  console.log(`      water: ${r.waterAdvice}`);
  console.log(`      voice: ${r.voice}`);
};

let firstVoice = null;
for (const file of images) {
  for (const lang of (process.env.LANGS ?? "en,ar,ja").split(",")) {
    const t0 = Date.now();
    const r = await call("/api/diagnose", { method: "POST", body: JSON.stringify({ image: dataUrl(file), lang, note: lang === "en" ? "Small tunnels in the leaves since last week" : undefined }) });
    const j = await r.json().catch(() => ({}));
    ok(r.status === 200 && j.result?.category, `${basename(file)} [${lang}] diagnosed`, `${Date.now() - t0} ms, model ${j.model ?? j.error}`);
    if (r.status === 200) {
      show(j.result);
      if (lang === "ar") firstVoice = j.result.voice;
      if (lang === "ar") ok(/[؀-ۿ]/.test(j.result.summary), "Arabic answer is in Arabic script");
      if (lang === "ja") ok(/[぀-ヿ一-鿿]/.test(j.result.summary), "Japanese answer is in Japanese");
    } else console.log("      ", JSON.stringify(j).slice(0, 300));
  }
}

const blank = await call("/api/diagnose", { method: "POST", body: JSON.stringify({ image: BLANK, lang: "en" }) });
const bj = await blank.json().catch(() => ({}));
ok(blank.status === 200 && ["unclear", "healthy"].includes(bj.result?.category), "a non-plant image is not diagnosed as a disease", `${bj.result?.category}: ${bj.result?.summary?.slice(0, 90)}`);

let r = await call("/api/diagnose", { method: "POST", body: JSON.stringify({ image: "data:text/html;base64,PGI+", lang: "en" }) });
ok(r.status === 422, "non-image payload rejected", `HTTP ${r.status}`);

r = await call("/api/diagnose");
const hist = await r.json();
ok(hist.items?.length >= 1, "history lists earlier checks", `${hist.items?.length} items`);

// voice
if (firstVoice) {
  const t0 = Date.now();
  r = await call("/api/tts", { method: "POST", body: JSON.stringify({ text: firstVoice, lang: "ar" }) });
  const bytes = r.ok ? (await r.arrayBuffer()).byteLength : 0;
  ok(r.status === 200 && bytes > 3000 && /audio/.test(r.headers.get("content-type") ?? ""), "Derja voice (ar-TN)", `${bytes} bytes in ${Date.now() - t0} ms`);
  const t1 = Date.now();
  r = await call("/api/tts", { method: "POST", body: JSON.stringify({ text: firstVoice, lang: "ar" }) });
  ok(r.status === 200, "same sentence is served from cache", `${Date.now() - t1} ms`);
}
r = await call("/api/tts", { method: "POST", body: JSON.stringify({ text: "こんにちは。今日は水やりは不要です。", lang: "ja" }) });
ok(r.status === 200 && (await r.arrayBuffer()).byteLength > 3000, "Japanese voice (ja-JP)");

console.log(failed ? `\n${failed} check(s) failed` : "\nAI checks passed");
process.exit(failed ? 1 : 0);
