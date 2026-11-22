/**
 * The product's name, in one place. Renaming the app later means editing this file (plus the translated sentences
 * in lib/i18n that mention it by name). The wordmark stays in Latin letters in every language; `native` is for
 * running text and the About section.
 */
export const BRAND = {
  /** Latin wordmark, used in the logo, metadata and the AI's persona. */
  name: "Ayn",
  /** The name written in each UI language's own script. */
  native: { en: "Ayn", ar: "عين", ja: "アイン" },
  /** What the word means: shown once on the About section. */
  meaning: {
    en: "In Arabic, ayn means both an eye and a spring of water.",
    ar: "في العربية، «عين» هي العين التي ترى وعين الماء التي تنبع.",
    ja: "アラビア語の「アイン」は、見る目と、湧き出る水の泉の両方を意味します。",
  },
  /** Brand colours that are not already design tokens in globals.css. */
  colors: { night: "#0d1731", cobalt: "#2c5fd0", whitewash: "#f5f2e9", gold: "#e3a21a" },
} as const;
