import { ar } from "./ar";
import { type Dict, en } from "./en";
import { ja } from "./ja";

export type Lang = "en" | "ar" | "ja";
export type { Dict };

export const LANGS = [
  { id: "en", label: "English", dir: "ltr", locale: "en-GB" },
  { id: "ar", label: "العربية", dir: "rtl", locale: "ar-TN-u-nu-latn" }, // Latin digits, as Tunisians write them
  { id: "ja", label: "日本語", dir: "ltr", locale: "ja-JP" },
] as const;

export const dictionaries: Record<Lang, Dict> = { en, ar, ja };

export const isLang = (x: unknown): x is Lang => x === "en" || x === "ar" || x === "ja";

/** Replace {placeholders} in a dictionary string. */
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
