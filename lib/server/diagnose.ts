import "server-only";
import { CATEGORIES, type Diagnosis, diagnosisSchema } from "@/lib/diagnosis-schema";
import type { Lang } from "@/lib/i18n";
import { REMINDER, inScript } from "@/lib/script-guard";
import { VISION_FAST, VISION_STRONG, type KeyKind, generateJson } from "./gemini";

// JSON Schema handed to Gemini (response schema).
const jsonSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...CATEGORIES] },
    name: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    summary: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: { type: "string" } },
    waterAdvice: { type: "string" },
    needsExpert: { type: "boolean" },
    voice: { type: "string" },
  },
  required: ["category", "name", "confidence", "summary", "evidence", "actions", "waterAdvice", "needsExpert", "voice"],
};

const LANGUAGE: Record<Lang, string> = {
  en: "English, in simple everyday words",
  ar: "Tunisian Arabic (Derja) written in Arabic script, in simple everyday words a farmer uses; keep scientific names in Latin letters",
  ja: "Japanese, polite and simple (です・ます調), using common agricultural terms",
};

const system = (lang: Lang) => `You are an agronomy helper for small farmers. You look at ONE photo of a plant (leaf, fruit or whole plant) and say what is most likely wrong, and what to do.

Rules:
- First check that the photo really shows a plant part. If it does not, or it is too blurry, dark or far away: category "unclear", and in "summary" say what photo you need (a sharp, well-lit, close photo of the affected leaf, with the whole plant in a second photo).
- Pick exactly ONE category: water_stress, nutrient_deficiency, pest, disease, healthy or unclear.
- "name": the most likely cause in plain words, e.g. "Tuta absoluta (tomato leafminer)", "Iron deficiency", "Powdery mildew", "Water stress".
- Be honest about uncertainty. Set "confidence" low, medium or high. If a lab test or a local agricultural adviser is needed to be sure (in Tunisia: the CRDA / agricultural extension officer), set "needsExpert" true.
- "evidence": 2 to 4 things you can actually SEE in the photo. Do not describe things you cannot see.
- "actions": 2 to 4 concrete, safe steps, in order. Prefer cultural and biological measures (remove affected leaves, pheromone or sticky traps, beneficial insects, Bacillus thuringiensis, balanced fertilisation, mulch, improving drainage or irrigation). NEVER give pesticide doses or brand names. If chemical treatment may be needed, tell the farmer to ask a licensed adviser and to respect the pre-harvest interval.
- "waterAdvice": one sentence linking the diagnosis to this farm's water situation, using ONLY the farm facts given below. Do not invent numbers. If the cause is not about water, say whether the current watering plan should change.
- "voice": one or two short sentences the farmer will HEAR read aloud: the cause and the single most important step. No lists, no symbols, no emoji.
- Write EVERY text field in ${LANGUAGE[lang]}.`;

export interface DiagnoseInput {
  imageBase64: string; // raw base64 (no data: prefix)
  mimeType: string;
  note?: string;
  context: string;
  lang: Lang;
  kind: KeyKind;
}

// How long a farmer waits for the optional second opinion. Measured on the free tier: the big models often
// answer 429 (daily quota) or take 30 s, and every "medium confidence" diagnosis (about half of the English and
// Japanese ones) paid the full wait, 13 to 20 s in all, for an answer that rarely arrived. 6 s keeps the
// chance of an upgrade on a good day and a diagnosis in about 8 s on a bad one.
const SECOND_OPINION_MS = 6_000;

/**
 * Stage 1: a fast model (≈2 s). If it is highly confident — or the photo is simply unusable — that is
 * the answer. Stage 2: otherwise ask a stronger model for a second opinion, but never wait more than
 * SECOND_OPINION_MS for it; on failure keep the fast answer.
 */
export async function diagnose(input: DiagnoseInput): Promise<{ diagnosis: Diagnosis; model: string }> {
  const plain = system(input.lang);
  const firm = plain + REMINDER[input.lang]; // used when an answer comes back in the wrong script
  const right = (d: Diagnosis) => inScript(input.lang, d.summary, d.voice);
  const common = {
    kind: input.kind,
    system: plain,
    schema: jsonSchema,
    parse: (raw: unknown) => diagnosisSchema.parse(raw),
    parts: [
      { inlineData: { mimeType: input.mimeType, data: input.imageBase64 } },
      {
        text: `Farm facts:\n${input.context}\n\n${input.note ? `The farmer says: "${input.note.slice(0, 300)}"\n\n` : ""}Look at the photo and answer in the JSON format.`,
      },
    ],
  };

  let fast = await generateJson({ ...common, models: VISION_FAST, timeoutMs: 12_000, deadlineMs: 25_000 });
  if (!right(fast.data)) {
    // The fast model sometimes writes Derja in Latin letters ("3la war9at") or Japanese in romaji: one firmer try.
    const again = await generateJson({ ...common, system: firm, models: VISION_FAST, timeoutMs: 12_000, deadlineMs: 15_000 }).catch(() => null);
    if (again && right(again.data)) fast = again;
  }
  if (right(fast.data) && (fast.data.confidence === "high" || fast.data.category === "unclear")) return { diagnosis: fast.data, model: fast.model };

  try {
    const strong = await generateJson({ ...common, system: firm, models: VISION_STRONG, timeoutMs: SECOND_OPINION_MS, deadlineMs: SECOND_OPINION_MS });
    if (right(strong.data)) return { diagnosis: strong.data, model: strong.model };
  } catch {
    /* keep the fast answer */
  }
  return { diagnosis: fast.data, model: fast.model };
}
