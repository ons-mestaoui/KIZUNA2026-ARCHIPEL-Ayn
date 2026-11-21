import { connection } from "next/server";
import { squareFromArea } from "@/lib/field/geo";
import { cdse } from "@/lib/server/copernicus";
import { generateWithFallback, CHAT_MODELS } from "@/lib/server/gemini";
import { DATASETS, readSeries } from "@/lib/server/jaxa";
import { getUser, unauthorized } from "@/lib/server/session";
import { synthesize, voiceFor } from "@/lib/server/tts";

export const maxDuration = 30;

type Probe = { ok: boolean; ms: number; detail?: string };

async function probe(fn: () => Promise<string>): Promise<Probe> {
  const t0 = Date.now();
  try {
    const detail = await fn(); // await first, THEN read the clock
    return { ok: true, ms: Date.now() - t0, detail };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, detail: String(e).slice(0, 200) };
  }
}

// Signed-in only (these calls use shared free quota): does each external dependency work from THIS host?
// Run it on localhost and on the Vercel URL — Edge TTS in particular may be blocked from datacenter IPs.
export async function GET(request: Request) {
  await connection();
  if (!(await getUser(request))) return unauthorized();

  const [ai, tts, jaxa, copernicus] = await Promise.all([
    probe(async () => {
      const { response, model } = await generateWithFallback(CHAT_MODELS, "public", {
        contents: "Reply with the single word: ok",
      });
      return `${model}: ${(response.text ?? "").trim().slice(0, 40)}`;
    }),
    probe(async () => {
      const voice = voiceFor("ar"); // the voice the farmers will actually hear
      const mp3 = await synthesize("صباح الخير", voice);
      return `${voice}: ${mp3.length} bytes`;
    }),
    probe(async () => {
      // Cap Bon, Tunisia
      const { points } = await readSeries(DATASETS.soil, 36.7, 10.6, 2);
      const latest = [...points].reverse().find((p) => p.value !== null);
      if (!latest) throw new Error("no valid AMSR2 soil-moisture pixel near the farm in the last days");
      return `AMSR2 soil moisture ${latest.value!.toFixed(1)} % on ${latest.date}, pixel ${latest.distKm!.toFixed(0)} km away`;
    }),
    probe(async () => {
      // the Sentinel-2 field view: sign in, then read the field-level history of a 1 ha square in Cap Bon
      const now = new Date();
      const series = await cdse().series(squareFromArea([10.573, 36.687], 1), new Date(now.getTime() - 21 * 86_400_000), now);
      if (!series.length) throw new Error("Copernicus answered but listed no Sentinel-2 pass in the last 3 weeks");
      const newest = series.at(-1)!;
      return `Sentinel-2: ${series.length} passes in 3 weeks, newest ${newest.date} (${Math.round(newest.clear * 100)} % clear)`;
    }),
  ]);

  return Response.json({ ok: ai.ok && tts.ok && jaxa.ok && copernicus.ok, ai, tts, jaxa, copernicus });
}
