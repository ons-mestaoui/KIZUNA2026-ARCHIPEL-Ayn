// Farm-local calendar helpers. Pure (no server-only), usable on both sides.

/** YYYY-MM-DD of `d` in the given IANA time zone. */
export function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Offset of the zone from UTC (hours, may be fractional) on a given calendar date — DST included. */
export function utcOffsetHours(dateISO: string, tz: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  let off = localHour(noonUtc, tz) - 12; // the zone's clock when UTC says 12:00
  if (off > 12) off -= 24;
  if (off < -12) off += 24;
  return off;
}

/** Hour of day (0–24, fractional) of `d` in the given IANA time zone. */
export function localHour(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}
