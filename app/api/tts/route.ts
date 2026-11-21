import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { getUser, unauthorized } from "@/lib/server/session";
import { VOICES, synthesize } from "@/lib/server/tts";

export const maxDuration = 30;

const body = z.object({ text: z.string().trim().min(1).max(600), lang: z.enum(["en", "ar", "ja", "fr"]) });

// Same sentence → same audio: remember it in memory and in the OS temp folder (the only writable
// place on Vercel), so repeated plays and the demo's scripted lines cost nothing.
const memory = new Map<string, Buffer>();
const cacheDir = path.join(os.tmpdir(), "gd-tts");

const perUserToday = new Map<string, number>();
const DAILY_LIMIT = 120;

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422 });
  const { text, lang } = parsed.data;

  const voice = (process.env[`TTS_VOICE_${lang.toUpperCase()}`] as string | undefined) ?? VOICES[lang];
  const key = createHash("sha1").update(`${voice}\n${text}`).digest("hex");
  const headers = { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" };

  let audio = memory.get(key);
  if (!audio) {
    try {
      audio = await readFile(path.join(cacheDir, `${key}.mp3`));
    } catch {
      /* not on disk yet */
    }
  }
  if (!audio) {
    const day = `${user.id}:${new Date().toISOString().slice(0, 10)}`;
    const used = (perUserToday.get(day) ?? 0) + 1;
    if (used > DAILY_LIMIT) return Response.json({ error: "quota" }, { status: 429 });
    perUserToday.set(day, used);
    try {
      audio = await synthesize(text, voice);
      await mkdir(cacheDir, { recursive: true }).then(() => writeFile(path.join(cacheDir, `${key}.mp3`), audio!)).catch(() => {});
    } catch (e) {
      // the client falls back to the browser's own speech synthesis
      return Response.json({ error: "tts_unavailable", detail: String(e).slice(0, 160) }, { status: 502 });
    }
  }
  memory.set(key, audio);
  if (memory.size > 80) memory.delete(memory.keys().next().value as string);
  return new Response(new Uint8Array(audio), { headers });
}
