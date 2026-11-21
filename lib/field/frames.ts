import type { FieldDTO } from "./types";

/** The same field showing only the passes on the given dates (zones, outline and history are unchanged). */
export function selectFrames(field: FieldDTO, dates: string[]): FieldDTO {
  const keep = field.frames.map((frame, i) => ({ frame, stats: field.stats[i] })).filter((k) => dates.includes(k.frame.date));
  return { ...field, frames: keep.map((k) => k.frame), stats: keep.map((k) => k.stats), lastClear: keep.at(-1)?.frame.date ?? field.lastClear };
}
