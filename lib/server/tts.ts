import "server-only";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

// Edge Read-Aloud neural voices (unofficial, no key). Tunisian Arabic has two: Hedi (male), Reem (female).
export const VOICES = {
  ar: "ar-TN-HediNeural",
  ja: "ja-JP-NanamiNeural",
  en: "en-GB-SoniaNeural",
  fr: "fr-FR-DeniseNeural", // answers may come back in French whatever the interface language is
} as const;
export type VoiceLang = keyof typeof VOICES;

/** Synthesize text to MP3 bytes. Throws if the service is unreachable (e.g. blocked datacenter IP). */
export async function synthesize(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 8000, synthesisTimeoutMs: 20000 });
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text);
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) chunks.push(chunk as Buffer);
    const out = Buffer.concat(chunks);
    if (out.length === 0) throw new Error("TTS returned no audio");
    return out;
  } finally {
    tts.close();
  }
}
