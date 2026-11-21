import { describe, expect, it } from "vitest";
import { ARABIC, REMINDER, inScript } from "./script-guard";

describe("script guard", () => {
  it("rejects Tunisian Arabic written in Latin letters (a real answer from the fast model)", () => {
    const summary = "Coûra 3la war9at el tomate fhaouha dohaher mta3 te9biw w dobaib.";
    const voice = "3andek ishkalyea mta3 Tuta absoluta. Lazmek tna7hi el orwe9 el mdarra w t3ala9 lmasyed.";
    expect(inScript("ar", summary, voice)).toBe(false);
  });

  it("accepts Arabic script, with a Latin scientific name inside", () => {
    const summary = "الورقة فيها إصابة واضحة بدودة الورق أو Tuta absoluta.";
    const voice = "عندك إصابة بدودة التوتا. نحي الأوراق المصابة واستعمل المصائد الفرمونية.";
    expect(inScript("ar", summary, voice)).toBe(true);
  });

  it("needs every field in the script, not just one (a Latin voice line goes to the Arabic voice)", () => {
    expect(inScript("ar", "الورقة مصابة بالدودة.", "Nahi el orwe9 el mdarra.")).toBe(false);
  });

  it("checks Japanese for kana or kanji, not romaji", () => {
    expect(inScript("ja", "トマトにトマトキバガの幼虫がいます。", "被害を受けた葉を取り除いてください。")).toBe(true);
    expect(inScript("ja", "Tomato ni Tuta absoluta ga imasu.")).toBe(false);
  });

  it("accepts anything for English", () => {
    expect(inScript("en", "Tuta absoluta (tomato leafminer)")).toBe(true);
  });

  it("has a firmer instruction for each non-English language only", () => {
    expect(REMINDER.en).toBe("");
    expect(REMINDER.ar).toMatch(/Arabic letters/);
    expect(REMINDER.ja).toMatch(/romaji/);
  });

  it("recognises Arabic script in a question, so the reply can be held to it", () => {
    expect(ARABIC.test("نسقي غدوة؟")).toBe(true);
    expect(ARABIC.test("Should I water tomorrow?")).toBe(false);
  });
});
