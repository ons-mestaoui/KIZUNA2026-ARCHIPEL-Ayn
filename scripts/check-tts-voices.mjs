// Spike: confirm the Tunisian (ar-TN) neural voices are reachable via Edge Read-Aloud (no key)
// and synthesize one Derja sample so a native speaker can judge the accent.
// Usage: node scripts/check-tts-voices.mjs
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const tts = new MsEdgeTTS();
const voices = await tts.getVoices();
const tn = voices.filter((v) => v.Locale === "ar-TN");
console.log(`Total voices: ${voices.length}`);
console.log("ar-TN voices:", tn.map((v) => `${v.ShortName} (${v.Gender})`));

const outDir = join(process.cwd(), "public", "audio");
mkdirSync(outDir, { recursive: true });

// Derja sample (to be validated by a native speaker on the team)
const sample =
  "صباح الخير يا حاج. الأرض مازالت فيها الرطوبة، ما تسقيش اليوم. نسقيو غدوة مع الفجر.";

for (const v of tn.length ? tn.map((x) => x.ShortName) : ["ar-TN-HediNeural", "ar-TN-ReemNeural"]) {
  try {
    await tts.setMetadata(v, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioFilePath } = await tts.toFile(outDir, sample);
    const dest = join(outDir, `sample-${v}.mp3`);
    renameSync(audioFilePath, dest);
    console.log("OK  ", v, "->", dest);
  } catch (e) {
    console.log("FAIL", v, e?.message ?? e);
  }
}
tts.close();
