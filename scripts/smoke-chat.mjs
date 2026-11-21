// Chat end to end, in four languages.   node scripts/smoke-chat.mjs [baseUrl]
// Prints the answers so a human can judge them; asserts script/language, persistence and isolation.
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(base).origin;
let failed = 0;
const ok = (c, label, extra = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
  if (!c) failed++;
};
const client = () => {
  const jar = new Map();
  return async (path, init = {}) => {
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
};
const A = client();
const B = client();
const farm = {
  name: "Olive", lat: 36.4561, lon: 10.7376, placeName: "Nabeul", crop: "olive", plantingDate: null, areaHa: 2, soilTexture: "loam", irrigationMethod: "drip",
  waterSource: "solar_basin", basinM3: 100, pvKWp: 6, pumpHeadM: 15, wellSafeYieldM3h: 40, lastIrrigated: "week+", lang: "en",
};
for (const [c, tag] of [[A, "a"], [B, "b"]]) {
  await c("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name: tag, email: `chat+${tag}+${Date.now()}@example.com`, password: "chat-test-pass-123" }) });
}
await A("/api/farm", { method: "PUT", body: JSON.stringify(farm) });
await B("/api/farm", { method: "PUT", body: JSON.stringify(farm) });

const questions = [
  ["نسقي غدوة؟", "ar", /[؀-ۿ]/, "Derja"],
  ["Est-ce qu'il va pleuvoir cette semaine ?", "en", /\b(pluie|pleu|semaine|jour|le|la|les|pas)\b/i, "French"],
  ["明日は水やりが必要ですか？", "ja", /[぀-ヿ一-鿿]/, "Japanese"],
  ["How can I make my solar pump last longer?", "en", /\b(pump|sun|pumping|the)\b/i, "English"],
];
for (const [q, lang, re, label] of questions) {
  const t0 = Date.now();
  const r = await A("/api/ask", { method: "POST", body: JSON.stringify({ message: q, lang }) });
  const j = await r.json().catch(() => ({}));
  ok(r.status === 200 && j.reply, `${label} question answered`, `${Date.now() - t0} ms, ${j.model ?? j.error}`);
  if (r.status === 200) {
    console.log(`      Q: ${q}\n      A: ${j.reply.replace(/\n+/g, " ").slice(0, 330)}`);
    ok(re.test(j.reply), `${label} answer is in ${label}`);
    ok(!/[*#`]/.test(j.reply), "no markdown in the answer");
    ok(j.reply.length < 900, "short enough to be read aloud", `${j.reply.length} chars`);
  } else console.log("      ", JSON.stringify(j).slice(0, 300));
}

let r = await A("/api/ask");
const hist = await r.json();
ok(hist.items?.length === questions.length * 2, "conversation is saved", `${hist.items?.length} messages`);
ok(hist.items?.[0]?.role === "user", "history is in order");

r = await B("/api/ask");
ok(((await r.json()).items ?? []).length === 0, "another farmer's conversation is separate");

r = await A("/api/ask", { method: "POST", body: JSON.stringify({ message: "", lang: "en" }) });
ok(r.status === 422, "empty message rejected", `HTTP ${r.status}`);
r = await client()("/api/ask", { method: "POST", body: JSON.stringify({ message: "hi", lang: "en" }) });
ok(r.status === 401, "anonymous → 401", `HTTP ${r.status}`);

r = await A("/api/ask", { method: "DELETE" });
r = await A("/api/ask");
ok(((await r.json()).items ?? []).length === 0, "new conversation clears the history");

console.log(failed ? `\n${failed} check(s) failed` : "\nChat checks passed");
process.exit(failed ? 1 : 0);
