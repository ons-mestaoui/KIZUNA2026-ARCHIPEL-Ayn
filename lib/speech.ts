import type { Lang } from "@/lib/i18n";

/** Languages we can speak. The interface is EN/AR/JA, but a reply may come back in French. */
export type SpeechLang = Lang | "fr";

/**
 * Which voice should read this text? Looks at the script, not the interface language: a farmer who
 * writes Derja in an English interface still gets a Tunisian voice.
 */
export function detectSpeechLang(text: string, fallback: Lang): SpeechLang {
  const ar = (text.match(/[؀-ۿ]/g) ?? []).length;
  const ja = (text.match(/[぀-ヿ一-鿿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (ja > 3 && ja >= ar) return "ja";
  if (ar > 3 && ar >= latin * 0.3) return "ar"; // Arabic with a few Latin scientific names stays Arabic
  if (latin > 0) return /\b(le|la|les|des|est|vous|pour|une|je|nous|avec|pas|pluie|arroser|demain)\b|[éèêàùç]/i.test(text) ? "fr" : "en";
  return fallback;
}

/** A reply is read aloud, so keep it inside the voice service's limit, ending on a sentence. */
export function speakable(text: string, max = 560): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("؟"), cut.lastIndexOf("。"), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return end > max * 0.5 ? cut.slice(0, end + 1) : cut;
}
