import { existsSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MEDIA, SCREEN_LANGS, SCREEN_NAMES, TEAM, screenSrc } from "./media";

const onDisk = (url: string) => `public${url}`;
const MB = 1024 * 1024;

describe("landing media", () => {
  const files = [
    ...Object.values(MEDIA.hero),
    ...Object.values(MEDIA.day),
    ...Object.values(MEDIA.tour),
    ...SCREEN_NAMES.flatMap((n) => SCREEN_LANGS.map((l) => screenSrc(n, l))),
    ...TEAM.map((p) => p.src),
  ];
  it("every file the page refers to exists", () => {
    for (const f of files) expect(existsSync(onDisk(f)), f).toBe(true);
  });
  it("the video weighs what the budget allows", () => {
    const total = readdirSync("public/media").reduce((sum, f) => sum + statSync(`public/media/${f}`).size, 0);
    expect(total).toBeLessThanOrEqual(14 * MB);
    // the hero is the only clip visitors always download: keep it under 5 MB; the others load only when scrolled to or opened
    for (const clip of [MEDIA.hero, MEDIA.day]) {
      expect(statSync(onDisk(clip.mp4)).size).toBeLessThanOrEqual(5 * MB);
      expect(statSync(onDisk(clip.webm)).size).toBeLessThanOrEqual(5 * MB);
    }
  });
  it("the team: four people, names only, no duplicates", () => {
    expect(TEAM).toHaveLength(4);
    expect(new Set(TEAM.map((p) => p.slug)).size).toBe(4);
    for (const p of TEAM) expect(Object.keys(p).sort()).toEqual(["name", "slug", "src"]);
  });
});
