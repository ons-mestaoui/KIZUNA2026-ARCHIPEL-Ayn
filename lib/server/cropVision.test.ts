import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CROP_DISEASES, diagnoseCropVision } from "./cropVision";

describe("cropVision module", () => {
  it("has complete metadata for all 31 crop classes (Tunisia & Japan)", () => {
    const keys = Object.keys(CROP_DISEASES);
    expect(keys.length).toBeGreaterThanOrEqual(31);

    // Tomato classes
    expect(keys).toContain("Tomato___Tuta_absoluta");
    expect(keys).toContain("Tomato___healthy");
    expect(keys).toContain("Tomato___Late_blight");

    // Olive classes (Tunisia Cap Bon & Zaghouan)
    expect(keys).toContain("Olive___Olive_peacock_spot");
    expect(keys).toContain("Olive___Healthy");

    // Citrus classes (Tunisia Cap Bon)
    expect(keys).toContain("Citrus___Blackspot");
    expect(keys).toContain("Citrus___Canker");
    expect(keys).toContain("Citrus___Healthy");

    // Japanese Rice & Tea (Kizuna Hackathon cross-border synergy)
    expect(keys).toContain("Japanese_Rice___Blast");
    expect(keys).toContain("Japanese_Tea___Algal_spot");

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

  it("runs real PyTorch inference on image with DINOv2 ViT", async () => {
    const blank = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const res = await diagnoseCropVision(blank, "en", { crop: "auto" });
    expect(res.diagnosis).toBeDefined();
    expect(res.raw.model).toBe("kizuna-dinov2-vit");
    expect(res.raw.prediction.class_raw).toBeTruthy();
    expect(res.raw.prediction.class_raw).not.toBe("Tomato___Tuta_absoluta");
  }, 25000);

  it("handles Arabic localization properly", async () => {
    process.env.DEMO_OFFLINE = "1";
    const blank = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const res = await diagnoseCropVision(blank, "ar", { demo: true });
    expect(res.diagnosis.voice).toBeTruthy();
    // Arabic script check
    expect(/[؀-ۿ]/.test(res.diagnosis.voice)).toBe(true);
    delete process.env.DEMO_OFFLINE;
  });
});
