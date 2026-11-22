import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import type { Lang } from "@/lib/i18n";
import { ARABIC, REMINDER } from "@/lib/script-guard";
import { farmContext } from "@/lib/server/aiContext";
import { fieldContext } from "@/lib/server/fieldContext";
import { CHAT_MODELS, generateText } from "@/lib/server/gemini";
import type { Part } from "@google/genai";
import { loadFarmState } from "@/lib/server/farmState";
import { DEMO_EMAIL, getFarm, getUser, unauthorized } from "@/lib/server/session";
import { cannedAnswer, demoOffline } from "@/lib/server/demoCanned";
import { DEMO_CAPS, refundQuota, takeQuota } from "@/lib/server/usage";
import { diagnoseCropVision } from "@/lib/server/cropVision";

export const maxDuration = 60;

const PHOTO_TAG = "📷 "; // history keeps text only; this marks a message that came with a photo
const VOICE_TAG = "🎙️ "; // marks a message that was sent as a voice message

const body = z
  .object({
    message: z.string().trim().max(1200).optional().default(""),
    image: z
      .string()
      .max(4_000_000)
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
    audio: z
      .string()
      .max(6_000_000)
      .regex(/^data:audio\/(webm|mp4|m4a|wav|ogg|mpeg|aac|x-m4a);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
    lang: z.enum(["en", "ar", "ja"]),
  })
  .refine((data) => data.message.length > 0 || !!data.audio || !!data.image, {
    message: "Either message, audio, or image must be provided",
  });

const UI_LANGUAGE: Record<Lang, string> = { en: "English", ar: "Tunisian Arabic (Derja)", ja: "Japanese" };

const system = (lang: Lang) => `You are "Goutte d'Or", a friendly, practical assistant for farmers. You help with irrigation, solar and other water pumps, crops, pests and the weather for THIS farm, using the farm facts below.

You have access to an in-house deep learning vision tool (MobileNetV3 trained specifically for tomato diseases and Tuta absoluta in Tunisia × Japan). When the farmer uploads a leaf photo or asks about crop symptoms, the tool output is provided in your context. Use it as ground truth to explain the problem, give safe practical cultural/biological steps, and link it to their watering situation.

How to answer:
- Reply in the language the farmer wrote or spoke in. The farmer can send typed messages or spoken voice messages. If they speak or write Arabic (Arabic script or Latin letters such as "3arbi"), answer in Tunisian Arabic (Derja) in Arabic script, with simple everyday words. French gets French, Japanese gets Japanese, English gets English. If the language is unclear, use ${UI_LANGUAGE[lang]}.
- Keep it short: at most 5 sentences. No markdown, no bullet symbols, no emoji. It will be read aloud.
- For weather, water balance and the plan, use ONLY the farm facts. If something is not in the facts, say you do not know instead of guessing.
- Practical and safe: never give pesticide doses or brand names; for chemical treatment say to ask a licensed adviser (in Tunisia: the CRDA). If a plant looks sick and there is no photo yet, suggest attaching a photo here.
- If a photo is attached and the vision tool diagnosed it, clearly state the diagnosed condition, summarize the practical actions to take, and reassure the farmer.
- Do not greet and do not repeat what you can or cannot do: answer the question directly.
- Only when the question has nothing to do with farming, water, pumps, crops or the weather, say in one sentence that you can only help with the farm.`;

/** Models love markdown; the answer is read aloud, so strip it. */
const plain = (s: string) => s.replace(/[*#`]+/g, "").replace(/\n{3,}/g, "\n\n").trim();

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const farm = await getFarm(user.id, request);
  if (!farm) return Response.json({ error: "no_farm" }, { status: 404 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422 });
  const { message, image, audio, lang } = parsed.data;

  const demo = user.email === DEMO_EMAIL;
  const q = await takeQuota(user.id, "chats", demo ? DEMO_CAPS.chats : undefined);
  if (!q.ok) return Response.json({ error: "quota", cap: q.cap }, { status: 429 });

  const defaultVoiceLabel = lang === "ar" ? "رسالة صوتية" : lang === "ja" ? "ボイスメッセージ" : "Voice message";
  const userContent = (audio ? VOICE_TAG : "") + (image ? PHOTO_TAG : "") + (message || defaultVoiceLabel);

  // Presenter-controlled offline mode: a saved answer for the demo's few scripted topics.
  if (demo && demoOffline()) {
    const reply = cannedAnswer(message || "water", lang);
    const [, assistant] = await db
      .insert(schema.chatMessage)
      .values([
        { farmId: farm.id, role: "user", content: userContent },
        { farmId: farm.id, role: "assistant", content: reply },
      ])
      .returning({ id: schema.chatMessage.id, createdAt: schema.chatMessage.createdAt });
    return Response.json({ id: assistant.id, createdAt: assistant.createdAt.toISOString(), reply, userContent, model: "saved", cached: true });
  }

  try {
    const [recent, state, latestDiagRows] = await Promise.all([
      db.select().from(schema.chatMessage).where(eq(schema.chatMessage.farmId, farm.id)).orderBy(desc(schema.chatMessage.id)).limit(12),
      loadFarmState(farm).catch(() => null), // weather down → still answer, from the farm profile
      db.select().from(schema.diagnosis).where(eq(schema.diagnosis.farmId, farm.id)).orderBy(desc(schema.diagnosis.id)).limit(1).catch(() => []),
    ]);

    let toolResultContext = "";
    const [header, base64] = image ? image.split(",", 2) : [null, null];
    const [audioHeader, audioBase64] = audio ? audio.split(",", 2) : [null, null];
    const audioMime = audioHeader ? audioHeader.slice(5, audioHeader.indexOf(";")) : "audio/webm";

    // If an image was submitted, invoke the in-house deep learning model as an expert tool!
    if (base64) {
      try {
        const vision = await diagnoseCropVision(base64, lang, { demo });
        await db
          .insert(schema.diagnosis)
          .values({
            farmId: farm.id,
            thumb: typeof image === "string" && image.length < 50_000 ? image : null,
            lang,
            resultJson: JSON.stringify(vision.diagnosis),
          })
          .catch(() => {});

        toolResultContext = `\n\n[Diagnostic Tool Output - Kizuna Crop Vision MobileNetV3]:
- Model: kizuna-mobilenetv3 (In-house PyTorch model trained for Mediterranean crops & Kizuna Hackathon)
- Detected Diagnosis: ${vision.diagnosis.name} (${vision.raw.prediction.class_raw})
- Confidence: ${vision.raw.prediction.confidence_pct}% (${vision.diagnosis.confidence})
- Severity Level: ${vision.raw.prediction.severity} (Licensed Expert Needed: ${vision.diagnosis.needsExpert ? "Yes" : "No"})
- Observed Symptoms: ${vision.raw.prediction.symptoms}
- Recommended Biological / IPM Treatments: ${vision.raw.prediction.biological_treatment}
- Local Tunisian Agronomic Guidance: ${vision.raw.prediction.tunisian_advice?.voice_script || vision.diagnosis.voice}
- Top Differential Candidates: ${vision.raw.top_3.map((x) => `${x.title} (${x.confidence_pct}%)`).join(", ")}
Tool Directive: The farmer uploaded a leaf photo which was just analyzed by our in-house MobileNetV3 deep learning vision model. Ground your answer directly in these tool results. State the diagnosis clearly, explain what it means, provide actionable biological/cultural steps, and advise on watering. Speak warmly in the requested language (Tunisian Derja in Arabic script if Arabic).`;
      } catch (err) {
        console.error("Crop vision tool execution error:", err);
      }
    }

    const latestDiagContext = latestDiagRows[0]
      ? (() => {
          try {
            const parsed = JSON.parse(latestDiagRows[0].resultJson) as { name: string; category: string; confidence: string };
            return `\nLatest leaf check on farm (${new Date(latestDiagRows[0].createdAt).toLocaleDateString()}): ${parsed.name} (${parsed.category}, confidence: ${parsed.confidence}).`;
          } catch {
            return "";
          }
        })()
      : "";

    const history = recent.reverse().map((m) => ({ role: m.role === "assistant" ? ("model" as const) : ("user" as const), parts: [{ text: m.content }] }));
    const fieldLine = await fieldContext(farm, state?.week[0]?.plan.grossM3 ? "irrigate" : "skip", { demo }); // satellite sentences, if a view is already cached
    const facts = `\n\nFarm facts:\n${farmContext(state, farm)}${fieldLine ? `\n${fieldLine}` : ""}${latestDiagContext}${toolResultContext}`;

    const userParts: Part[] = [];
    if (image && header && base64) {
      userParts.push({ inlineData: { mimeType: header.slice(5, header.indexOf(";")), data: base64 } });
    }
    if (audio && audioHeader && audioBase64) {
      userParts.push({ inlineData: { mimeType: audioMime, data: audioBase64 } });
    }
    if (message) {
      userParts.push({ text: message });
    } else if (audio) {
      userParts.push({
        text: "[The farmer sent this voice message. Listen carefully to what they say in the audio and answer directly in concise speech-ready sentences using the farm facts. If spoken in Arabic or Tunisian Derja, reply in Tunisian Derja in Arabic script.]",
      });
    }

    const contents = [
      ...history,
      {
        role: "user" as const,
        parts: userParts,
      },
    ];
    const ask = (extra: string, deadlineMs: number) =>
      generateText({ models: CHAT_MODELS, kind: demo ? "demo" : "public", system: `${system(lang)}${extra}${facts}`, contents, timeoutMs: 12_000, deadlineMs });

    let { text, model } = await ask("", 30_000);
    // A question written in Arabic letters must be answered in Arabic letters, not in Latin-letter Derja ("3la war9at").
    if ((message && ARABIC.test(message)) && !ARABIC.test(text)) {
      const again = await ask(REMINDER.ar, 15_000).catch(() => null);
      if (again && ARABIC.test(again.text)) ({ text, model } = again);
    }
    const reply = plain(text);

    const [, assistant] = await db
      .insert(schema.chatMessage)
      .values([
        { farmId: farm.id, role: "user", content: userContent },
        { farmId: farm.id, role: "assistant", content: reply },
      ])
      .returning({ id: schema.chatMessage.id, createdAt: schema.chatMessage.createdAt });
    return Response.json({ id: assistant.id, createdAt: assistant.createdAt.toISOString(), reply, userContent, model });
  } catch (e) {
    await refundQuota(user.id, "chats");
    const busy = /429|quota|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded|timeout|aborted/i.test(String(e));
    return Response.json({ error: busy ? "busy" : "ai_failed", detail: String(e).slice(0, 200) }, { status: busy ? 503 : 502 });
  }
}

// The conversation so far.
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const farm = await getFarm(user.id, request);
  if (!farm) return Response.json({ items: [] });
  const rows = await db.select().from(schema.chatMessage).where(eq(schema.chatMessage.farmId, farm.id)).orderBy(desc(schema.chatMessage.id)).limit(40);
  // In the presenter's offline mode every demo answer is a saved one (the demo is reset on each entry,
  // so the history never mixes saved and live answers); the interface labels them.
  const saved = user.email === DEMO_EMAIL && demoOffline();
  return Response.json({
    items: rows.reverse().map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      ...(saved && m.role === "assistant" ? { saved: true } : {}),
    })),
  });
}

// "New conversation".
export async function DELETE(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const farm = await getFarm(user.id, request);
  if (farm) await db.delete(schema.chatMessage).where(eq(schema.chatMessage.farmId, farm.id));
  return Response.json({ ok: true });
}
