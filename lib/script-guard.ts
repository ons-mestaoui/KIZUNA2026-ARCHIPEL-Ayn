import type { Lang } from "@/lib/i18n";

// The AI is asked to answer in the script the farmer reads. The fast models usually do, but sometimes write
// Tunisian Arabic in Latin letters and digits ("Coûra 3la war9at el tomate") or Japanese in romaji. That is
// unreadable for many farmers and the Arabic voice reads it as nonsense, so the server checks and retries.
export const ARABIC = /[؀-ۿ]/;
export const JAPANESE = /[぀-ヿ一-鿿]/;

const SCRIPT: Record<Lang, RegExp | null> = { en: null, ar: ARABIC, ja: JAPANESE };

/** Added to the instructions for the retry. */
export const REMINDER: Record<Lang, string> = {
  en: "",
  ar: '\n- IMPORTANT: write ONLY in Arabic letters (ا ب ت ث ...). Never write Arabic with Latin letters or digits such as "3la" or "9"; only scientific names stay in Latin letters.',
  ja: "\n- IMPORTANT: write in Japanese (hiragana, katakana and kanji), never in romaji or English; only scientific names stay in Latin letters.",
};

/** Are all the given texts written in the script of `lang`? (English accepts anything.) */
export function inScript(lang: Lang, ...texts: string[]): boolean {
  const script = SCRIPT[lang];
  return !script || texts.every((t) => script.test(t));
}
