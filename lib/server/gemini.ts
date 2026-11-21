import "server-only";
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";

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
export const CHAT_MODELS = list(process.env.GEMINI_MODELS_CHAT, "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemma-4-31b-it");
export const VISION_MODELS = list(
  process.env.GEMINI_MODELS_VISION,
  "gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemma-4-31b-it",
);

/** Quota / overload / transient errors → try the next model in the chain. */
export function isRetryable(e: unknown): boolean {
  return /429|RESOURCE_EXHAUSTED|quota|rate.?limit|503|UNAVAILABLE|overloaded|500|INTERNAL|timeout/i.test(String(e));
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
      const response = await gemini(kind).models.generateContent({ ...params, model });
      return { response, model, tried };
    } catch (e) {
      lastError = e;
      if (!isRetryable(e)) break; // bad request, safety, auth… → another model won't help
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
