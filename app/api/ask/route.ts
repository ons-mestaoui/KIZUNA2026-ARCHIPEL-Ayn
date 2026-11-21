import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import type { Lang } from "@/lib/i18n";
import { farmContext } from "@/lib/server/aiContext";
import { CHAT_MODELS, generateText } from "@/lib/server/gemini";
import { loadFarmState } from "@/lib/server/farmState";
import { DEMO_EMAIL, getFarm, getUser, unauthorized } from "@/lib/server/session";
import { cannedAnswer, demoOffline } from "@/lib/server/demoCanned";
import { DEMO_CAPS, refundQuota, takeQuota } from "@/lib/server/usage";

export const maxDuration = 60;

const PHOTO_TAG = "📷 "; // history keeps text only; this marks a message that came with a photo

const body = z.object({
  message: z.string().trim().min(1).max(800),
  image: z
    .string()
    .max(4_000_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  lang: z.enum(["en", "ar", "ja"]),
});

const UI_LANGUAGE: Record<Lang, string> = { en: "English", ar: "Tunisian Arabic (Derja)", ja: "Japanese" };

const system = (lang: Lang) => `You are "Goutte d'Or", a friendly, practical assistant for farmers. You help with irrigation, solar and other water pumps, crops, pests and the weather for THIS farm, using the farm facts below.

How to answer:
- Reply in the language the farmer wrote in. If they write Arabic (Arabic script or Latin letters such as "3arbi"), answer in Tunisian Arabic (Derja) in Arabic script, with simple everyday words. French gets French, Japanese gets Japanese, English gets English. If the language is unclear, use ${UI_LANGUAGE[lang]}.
- Keep it short: at most 5 sentences. No markdown, no bullet symbols, no emoji. It will be read aloud.
- For weather, water balance and the plan, use ONLY the farm facts. If something is not in the facts, say you do not know instead of guessing.
- Practical and safe: never give pesticide doses or brand names; for chemical treatment say to ask a licensed adviser (in Tunisia: the CRDA). If a plant looks sick and there is no photo yet, suggest the Leaf check photo feature or attaching a photo here.
- If a photo is attached, say what you see, then answer the question.
- Do not greet and do not repeat what you can or cannot do: answer the question directly.
- Only when the question has nothing to do with farming, water, pumps, crops or the weather, say in one sentence that you can only help with the farm.`;

/** Models love markdown; the answer is read aloud, so strip it. */
const plain = (s: string) => s.replace(/[*#`]+/g, "").replace(/\n{3,}/g, "\n\n").trim();

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const farm = await getFarm(user.id);
  if (!farm) return Response.json({ error: "no_farm" }, { status: 404 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422 });
  const { message, image, lang } = parsed.data;

  const demo = user.email === DEMO_EMAIL;
  const q = await takeQuota(user.id, "chats", demo ? DEMO_CAPS.chats : undefined);
  if (!q.ok) return Response.json({ error: "quota", cap: q.cap }, { status: 429 });

  // Presenter-controlled offline mode: a saved answer for the demo's few scripted topics.
  if (demo && demoOffline()) {
    const reply = cannedAnswer(message, lang);
    const [, assistant] = await db
      .insert(schema.chatMessage)
      .values([
        { farmId: farm.id, role: "user", content: (image ? PHOTO_TAG : "") + message },
        { farmId: farm.id, role: "assistant", content: reply },
      ])
      .returning({ id: schema.chatMessage.id, createdAt: schema.chatMessage.createdAt });
    return Response.json({ id: assistant.id, createdAt: assistant.createdAt.toISOString(), reply, model: "saved", cached: true });
  }

  try {
    const [recent, state] = await Promise.all([
      db.select().from(schema.chatMessage).where(eq(schema.chatMessage.farmId, farm.id)).orderBy(desc(schema.chatMessage.id)).limit(12),
      loadFarmState(farm).catch(() => null), // weather down → still answer, from the farm profile
    ]);
    const history = recent.reverse().map((m) => ({ role: m.role === "assistant" ? ("model" as const) : ("user" as const), parts: [{ text: m.content }] }));
    const [header, base64] = image ? image.split(",", 2) : [null, null];
    const { text, model } = await generateText({
      models: CHAT_MODELS,
      kind: demo ? "demo" : "public",
      system: `${system(lang)}\n\nFarm facts:\n${farmContext(state, farm)}`,
      contents: [
        ...history,
        {
          role: "user",
          parts: [...(image ? [{ inlineData: { mimeType: header!.slice(5, header!.indexOf(";")), data: base64! } }] : []), { text: message }],
        },
      ],
      timeoutMs: 12_000,
      deadlineMs: 30_000,
    });
    const reply = plain(text);

    const [, assistant] = await db
      .insert(schema.chatMessage)
      .values([
        { farmId: farm.id, role: "user", content: (image ? PHOTO_TAG : "") + message },
        { farmId: farm.id, role: "assistant", content: reply },
      ])
      .returning({ id: schema.chatMessage.id, createdAt: schema.chatMessage.createdAt });
    return Response.json({ id: assistant.id, createdAt: assistant.createdAt.toISOString(), reply, model });
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
  const farm = await getFarm(user.id);
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
  const farm = await getFarm(user.id);
  if (farm) await db.delete(schema.chatMessage).where(eq(schema.chatMessage.farmId, farm.id));
  return Response.json({ ok: true });
}
