/** Everything the landing page plays or shows, in one place (a unit test checks that each file exists and fits the budget). */
export interface Clip {
  mp4: string;
  webm: string;
  poster: string;
}

export const MEDIA = {
  /** the hero: a drone flight over olive groves at sunrise (free stock footage, see scripts/media/hero.mjs and the footer credit) */
  hero: { mp4: "/media/hero.mp4", webm: "/media/hero.webm", poster: "/media/hero-poster.webp" } satisfies Clip,
  /** one day, dawn to dusk, with the panels, pump, basin and drip lines working (recorded from the app) */
  day: { mp4: "/media/day.mp4", webm: "/media/day.webm", poster: "/media/day-poster.webp" } satisfies Clip,
  /** the short tour in the dialog */
  tour: { mp4: "/media/tour.mp4", webm: "/media/tour.webm", poster: "/media/tour-poster.webp" } satisfies Clip,
} as const;

/** Phone screens of the app (the Languages section), one set per UI language (scripts/media/screens.mjs). */
export const SCREEN_NAMES = ["plan", "ask", "space"] as const;
export const SCREEN_LANGS = ["en", "ar", "ja"] as const;
export const screenSrc = (name: (typeof SCREEN_NAMES)[number], lang: string) => `/media/screen-${name}-${(SCREEN_LANGS as readonly string[]).includes(lang) ? lang : "en"}.webp`;

/** The team. Names only: no roles or bios (they were not given, and are not invented). */
export const TEAM = [
  { slug: "amine", name: "Mohamed Amine Belloumi", src: "/team/amine.webp" },
  { slug: "rayen", name: "Mohamed Rayen Taiba", src: "/team/rayen.webp" },
  { slug: "ons", name: "Ons Mestaoui", src: "/team/ons.webp" },
  { slug: "outhaila", name: "Outhaila Taamali", src: "/team/outhaila.webp" },
] as const;
