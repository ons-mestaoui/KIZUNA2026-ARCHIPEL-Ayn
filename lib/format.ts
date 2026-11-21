/** A calendar date (YYYY-MM-DD) as text in the given locale, independent of the viewer's time zone. */
export const dayLabel = (date: string, locale: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** "21 Nov, 14:05" for a timestamp (viewer's own time zone). */
export const whenLabel = (ms: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
