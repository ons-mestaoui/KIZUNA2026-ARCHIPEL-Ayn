import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads the colour tokens straight from app/globals.css, so a palette change that breaks reading contrast fails here.
const css = readFileSync("app/globals.css", "utf8");
const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const token = (name: string): string => {
  const m = root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found`);
  return m[1];
};

const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("colour contrast (WCAG 2.2, text 4.5:1)", () => {
  const AA: [string, string][] = [
    ["ink", "limewash"], // body text on the page
    ["ink", "paper"], // cards
    ["ink-soft", "limewash"], // secondary text
    ["ink-soft", "paper"],
    ["paper", "night"], // landing, dark sections
    ["paper", "night-2"],
    ["night", "sun"], // the gold buttons and the final band
    ["paper", "ink"], // primary buttons
    ["paper", "cobalt"], // icon discs
    ["sun-deep", "limewash"], // amber text
    ["water-deep", "limewash"],
    ["leaf", "limewash"],
    ["alarm", "limewash"],
  ];
  for (const [fg, bg] of AA) {
    it(`${fg} on ${bg}`, () => {
      expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("the focus ring shows on every surface (3:1 for UI): cobalt on the light ones, gold on night, night on gold", () => {
    expect(ratio(token("cobalt"), token("limewash"))).toBeGreaterThanOrEqual(3);
    expect(ratio(token("cobalt"), token("paper"))).toBeGreaterThanOrEqual(3);
    expect(ratio(token("sun"), token("night"))).toBeGreaterThanOrEqual(3);
    expect(ratio(token("sun"), token("night-2"))).toBeGreaterThanOrEqual(3);
    expect(ratio(token("night"), token("sun"))).toBeGreaterThanOrEqual(3);
  });
});
