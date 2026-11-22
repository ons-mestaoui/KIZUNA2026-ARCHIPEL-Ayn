import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CROP_DISEASES, diagnoseCropVision } from "./cropVision";

describe("cropVision module", () => {
  it("has complete metadata for all 11 tomato classes", () => {
    const keys = Object.keys(CROP_DISEASES);
    expect(keys.length).toBe(11);
    expect(keys).toContain("Tomato___Tuta_absoluta");
    expect(keys).toContain("Tomato___healthy");
    expect(keys).toContain("Tomato___Late_blight");

    for (const key of keys) {
      const d = CROP_DISEASES[key];
      expect(d.category).toBeDefined();
      expect(d.titles.en).toBeTruthy();
      expect(d.titles.ar).toBeTruthy();
      expect(d.titles.ja).toBeTruthy();

      expect(d.summaries.en).toBeTruthy();
      expect(d.summaries.ar).toBeTruthy();
      expect(d.summaries.ja).toBeTruthy();

      expect(d.evidence.en.length).toBeGreaterThan(0);
      expect(d.actions.en.length).toBeGreaterThan(0);
      expect(d.waterAdvice.en).toBeTruthy();
      expect(d.voice.en).toBeTruthy();
      expect(d.voice.ar).toBeTruthy();
    }
  });

  it("diagnoses in demo offline mode", async () => {
    process.env.DEMO_OFFLINE = "1";
    const blank = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const res = await diagnoseCropVision(blank, "en", { demo: true });
    expect(res.diagnosis).toBeDefined();
    expect(res.diagnosis.name).toBeTruthy();
    expect(res.raw.prediction.class_raw).toBe("Tomato___Tuta_absoluta");
    delete process.env.DEMO_OFFLINE;
  });

  it("runs real PyTorch inference on image", async () => {
    const blank = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const res = await diagnoseCropVision(blank, "en");
    expect(res.diagnosis).toBeDefined();
    expect(res.raw.model).toBe("kizuna-mobilenetv3");
    expect(res.raw.prediction.class_raw).toBeTruthy();
  });

  it("handles Arabic localization properly", async () => {
    const blank = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const res = await diagnoseCropVision(blank, "ar", { demo: true });
    expect(res.diagnosis.voice).toBeTruthy();
    // Arabic script check
    expect(/[؀-ۿ]/.test(res.diagnosis.voice)).toBe(true);
  });
});
