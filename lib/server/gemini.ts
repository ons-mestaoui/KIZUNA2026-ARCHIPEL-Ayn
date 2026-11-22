import "server-only";
import { GoogleGenAI, type Content, type GenerateContentParameters, type GenerateContentResponse, type Part } from "@google/genai";

/**
 * Two keys protect the shared free quota: judges and farmers use GEMINI_API_KEY, the demo account
 * uses GEMINI_API_KEY_DEMO (a teammate's key) so the pitch can't be starved by public traffic.
 */
export type KeyKind = "public" | "demo";

const clients = new Map<string, GoogleGenAI>();

export function gemini(kind: KeyKind = "public"): GoogleGenAI {
  const key = (kind === "demo" && process.env.GEMINI_API_KEY_DEMO) || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  let c = clients.get(key);
  if (!c) clients.set(key, (c = new GoogleGenAI({ apiKey: key })));
  return c;
}

const list = (v: string | undefined, fallback: string) =>
  (v ?? fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Model IDs come from env so they can be changed without a deploy of code.
export const CHAT_MODELS = list(process.env.GEMINI_MODELS_CHAT, "gemini-3.5-flash-lite,gemini-3.8-flash,gemini-3.1-flash-lite");
// Vision runs in two stages: a fast model answers in ~2 s; a stronger model (slower, and often
// overloaded on the free tier) is only asked for a second opinion when the fast one isn't sure.
export const VISION_FAST = list(process.env.GEMINI_MODELS_VISION_FAST, "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemma-4-31b-it");
export const VISION_STRONG = list(process.env.GEMINI_MODELS_VISION_STRONG, "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash");

/** Quota / overload / transient errors → try the next model in the chain. */
export function isRetryable(e: unknown): boolean {
  return /429|RESOURCE_EXHAUSTED|quota|rate.?limit|503|UNAVAILABLE|overloaded|500|INTERNAL|timeout/i.test(String(e));
}

/** Pull the first JSON object out of a model answer (Gemma may wrap it in ```json fences or add prose). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in the answer");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Ask for ONE JSON object, validated by `parse`. Tries each model in turn: quota / overload errors,
 * models that reject JSON mode or system prompts (Gemma), and answers that don't validate all fall
 * through to the next model. Gemini models get a response schema; Gemma gets the rules inside the prompt.
 */
export async function generateJson<T>(opts: {
  models: string[];
  kind: KeyKind;
  system: string;
  parts: Part[];
  schema: object;
  parse: (raw: unknown) => T;
  /** Per-model deadline. The free tier's big models sometimes queue for a minute or more. */
  timeoutMs?: number;
  /** Deadline for the whole chain; no new model is tried once it is nearly spent. */
  deadlineMs?: number;
}): Promise<{ data: T; model: string; tried: string[] }> {
  const tried: string[] = [];
  const started = Date.now();
  let lastError: unknown;
  for (const model of opts.models) {
    const remaining = opts.deadlineMs ? opts.deadlineMs - (Date.now() - started) : Infinity;
    if (remaining < 1500) break;
    tried.push(model);
    const gemma = /^gemma/i.test(model);
    try {
      const response = await gemini(opts.kind).models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: gemma
              ? [{ text: `${opts.system}\n\nReply with ONE JSON object only (no markdown) matching this JSON Schema:\n${JSON.stringify(opts.schema)}` }, ...opts.parts]
              : opts.parts,
          },
        ],
        config: {
          abortSignal: AbortSignal.timeout(Math.min(opts.timeoutMs ?? 15_000, remaining)),
          ...(gemma ? {} : { systemInstruction: opts.system, responseMimeType: "application/json", responseJsonSchema: opts.schema }),
        },
      });
      return { data: opts.parse(extractJson(response.text ?? "")), model, tried };
    } catch (e) {
      lastError = e;
      const retry = isRetryable(e) || /JSON|schema|system|instruction|not supported|INVALID_ARGUMENT|SyntaxError|ZodError|no JSON/i.test(String(e));
      if (!retry) break; // auth / safety / bad request that another model won't fix
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * A plain-text answer (chat). Same fallback rules as generateJson: overload, timeouts, empty answers and
 * models without system-prompt support (Gemma) move on to the next model.
 */
export async function generateText(opts: {
  models: string[];
  kind: KeyKind;
  system: string;
  contents: Content[];
  timeoutMs?: number;
  deadlineMs?: number;
}): Promise<{ text: string; model: string; tried: string[] }> {
  const tried: string[] = [];
  const started = Date.now();
  let lastError: unknown;
  for (const model of opts.models) {
    const remaining = opts.deadlineMs ? opts.deadlineMs - (Date.now() - started) : Infinity;
    if (remaining < 1500) break;
    tried.push(model);
    const gemma = /^gemma/i.test(model);
    try {
      // Gemma has no system prompt: put the rules in front of the first user turn instead.
      const contents = gemma
        ? opts.contents.map((c, i) => (i === 0 ? { ...c, parts: [{ text: `${opts.system}\n\n---\n` }, ...(c.parts ?? [])] } : c))
        : opts.contents;
      const response = await gemini(opts.kind).models.generateContent({
        model,
        contents,
        config: {
          abortSignal: AbortSignal.timeout(Math.min(opts.timeoutMs ?? 15_000, remaining)),
          ...(gemma ? {} : { systemInstruction: opts.system }),
        },
      });
      const text = (response.text ?? "").trim();
      if (!text) throw new Error("empty answer");
      return { text, model, tried };
    } catch (e) {
      lastError = e;
      if (!(isRetryable(e) || /empty answer|system|instruction|not supported|INVALID_ARGUMENT/i.test(String(e)))) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function generateWithFallback(
  models: string[],
  kind: KeyKind,
  params: Omit<GenerateContentParameters, "model">,
): Promise<{ response: GenerateContentResponse; model: string; tried: string[] }> {
  const tried: string[] = [];
  let lastError: unknown;
  for (const model of models) {
    tried.push(model);
    try {
      const response = await gemini(kind).models.generateContent({
        ...params,
        model,
        config: { abortSignal: AbortSignal.timeout(15_000), ...params.config },
      });
      return { response, model, tried };
    } catch (e) {
      lastError = e;
      if (!isRetryable(e)) break; // bad request, safety, auth… → another model won't help
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
