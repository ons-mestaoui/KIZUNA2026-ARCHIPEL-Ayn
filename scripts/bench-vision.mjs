// Which Gemini model answers a leaf photo fastest?   node scripts/bench-vision.mjs <image.jpg> [thinking]
// Prints latency and success per model. Uses a handful of free-tier calls.
import { readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

try {
  process.loadEnvFile(".env.local");
} catch {}
const [, , file, mode = "default"] = process.argv;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const data = readFileSync(file).toString("base64");

const MODELS = (process.env.BENCH_MODELS ?? "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash,gemini-2.5-flash-lite")
  .split(",");

const schema = {
  type: "object",
  properties: { category: { type: "string", enum: ["water_stress", "nutrient_deficiency", "pest", "disease", "healthy", "unclear"] }, name: { type: "string" }, summary: { type: "string" } },
  required: ["category", "name", "summary"],
};

for (const model of MODELS) {
  const config = { systemInstruction: "You are an agronomy helper. Look at the photo and say what is most likely wrong with the plant. Answer in English.", responseMimeType: "application/json", responseJsonSchema: schema };
  if (mode === "nothink") config.thinkingConfig = /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: "MINIMAL" };
  const t0 = Date.now();
  try {
    const r = await ai.models.generateContent({ model, contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data } }, { text: "Farm: tomato, Tunisia. Diagnose this photo." }] }], config });
    const j = JSON.parse(r.text);
    const th = r.usageMetadata?.thoughtsTokenCount ?? 0;
    console.log(`${model.padEnd(24)} ${String(Date.now() - t0).padStart(6)} ms  OK   ${j.category} · ${j.name.slice(0, 40)}  (thought tokens ${th})`);
  } catch (e) {
    console.log(`${model.padEnd(24)} ${String(Date.now() - t0).padStart(6)} ms  ERR  ${String(e).replace(/\s+/g, " ").slice(0, 140)}`);
  }
}
