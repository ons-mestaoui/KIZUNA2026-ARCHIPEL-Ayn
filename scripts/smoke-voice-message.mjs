// Verify that /api/ask accepts and handles voice messages (audio data URL) properly.
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(base).origin;

function client() {
  const jar = new Map();
  const absorb = (res) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || /max-age=0/i.test(line)) jar.delete(k);
      else jar.set(k, v);
    }
  };
  return async (path, init = {}) => {
    const res = await fetch(base + path, {
      redirect: "manual",
      ...init,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
        ...init.headers,
      },
    });
    absorb(res);
    return res;
  };
}

function makeWavBase64() {
  const sampleRate = 8000;
  const numSamples = 4000; // 0.5s audio
  const buffer = Buffer.alloc(44 + numSamples);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + numSamples, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(numSamples, 40);
  buffer.fill(128, 44);
  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}

async function run() {
  const c = client();
  const email = `voice-farmer-${Date.now()}@example.com`;
  const password = "smoke-test-pass-123";

  // 1. Sign up
  const su = await c("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name: "Voice Farmer", email, password }),
  });
  if (!su.ok) throw new Error(`Sign up failed: ${su.status}`);
  console.log("PASS  Farmer signed up");

  // 2. Create Farm
  const f = await c("/api/farm", {
    method: "PUT",
    body: JSON.stringify({
      name: "Voice Test Farm",
      lat: 36.4561,
      lon: 10.7376,
      placeName: "Nabeul",
      crop: "olive",
      plantingDate: null,
      areaHa: 1.5,
      soilTexture: "loam",
      irrigationMethod: "drip",
      waterSource: "solar_basin",
      basinM3: 50,
      pvKWp: 5,
      pumpHeadM: 10,
      wellSafeYieldM3h: 20,
      lastIrrigated: "today",
      lang: "ar",
    }),
  });
  if (!f.ok) {
    const err = await f.json();
    console.error("farm error:", err);
    throw new Error(`Farm creation failed: ${f.status}`);
  }
  console.log("PASS  Farm created");

  const wavDataUrl = makeWavBase64();

  // 3. Send Voice Message without text
  console.log("Sending pure voice message to /api/ask...");
  const askRes = await c("/api/ask", {
    method: "POST",
    body: JSON.stringify({
      audio: wavDataUrl,
      lang: "ar",
    }),
  });

  if (!askRes.ok) {
    const errText = await askRes.text();
    throw new Error(`Voice message failed: ${askRes.status} ${errText}`);
  }

  const askJson = await askRes.json();
  console.log("PASS  Voice message answered successfully:", askJson.reply.slice(0, 80));
  if (!askJson.userContent || !askJson.userContent.startsWith("🎙️")) {
    throw new Error(`Expected voice tag in userContent, got: ${askJson.userContent}`);
  }
  console.log("PASS  User content tagged with microphone badge:", askJson.userContent);

  // 4. Send Voice Message with accompanied note
  console.log("Sending voice message with note...");
  const askWithNoteRes = await c("/api/ask", {
    method: "POST",
    body: JSON.stringify({
      message: "وقتاش نشغل البومبا اليوم؟",
      audio: wavDataUrl,
      lang: "ar",
    }),
  });
  if (!askWithNoteRes.ok) throw new Error("Voice message with note failed");
  const askWithNoteJson = await askWithNoteRes.json();
  console.log("PASS  Voice message with note answered:", askWithNoteJson.reply.slice(0, 80));
  if (!askWithNoteJson.userContent.includes("وقتاش نشغل البومبا اليوم؟") || !askWithNoteJson.userContent.startsWith("🎙️")) {
    throw new Error(`Expected note and voice tag in userContent: ${askWithNoteJson.userContent}`);
  }
  console.log("PASS  User content preserves voice tag and transcription/note:", askWithNoteJson.userContent);

  // 5. Verify conversation history GET /api/ask
  const histRes = await c("/api/ask");
  if (!histRes.ok) throw new Error("History fetch failed");
  const hist = await histRes.json();
  if (hist.items.length < 4) throw new Error(`Expected at least 4 messages, got ${hist.items.length}`);
  const userVoiceMsg = hist.items.find((m) => m.role === "user" && m.content.startsWith("🎙️"));
  if (!userVoiceMsg) throw new Error("Voice message missing from history");
  console.log("PASS  Voice message persisted in chat history with voice badge:", userVoiceMsg.content);

  console.log("\nAll voice message checks passed successfully!");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
