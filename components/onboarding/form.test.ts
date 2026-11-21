import { describe, expect, it } from "vitest";
import { defaultsFor } from "@/lib/engine/farmParcel";
import { farmInputSchema } from "@/lib/farm-schema";
import { polygonAreaHa, polygonCentroid, squareFromArea } from "@/lib/field/geo";
import { dictionaries } from "@/lib/i18n";
import { explainRefusal, initialForm, toPayload } from "./form";

const here: [number, number] = [10.573, 36.687];

describe("what the wizard saves for any size of field", () => {
  // a field over ~50 ha used to be estimated past the server's limits (well 1,000 m³/h, basin 5,000 m³): HTTP 422 on save
  for (const ha of [0.05, 0.5, 1, 20, 50, 51, 60, 83, 84, 150, 400, 500]) {
    it(`a ${ha} ha field typed in, with the pump details left empty, is accepted`, () => {
      const form = { ...initialForm(), plantingDate: "2026-10-01", lat: 36.687, lon: 10.573, areaHa: String(ha) };
      const r = farmInputSchema.safeParse(toPayload(form, "en", "My farm"));
      expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    });
  }

  for (const ha of [1, 30, 55, 150, 400]) {
    it(`a ${ha} ha field drawn on the map is accepted`, () => {
      const poly = squareFromArea(here, ha);
      const c = polygonCentroid(poly);
      const form = { ...initialForm(), plantingDate: "2026-10-01", polygon: poly, lat: c[1], lon: c[0], areaHa: String(Math.round(polygonAreaHa(poly) * 100) / 100) };
      const r = farmInputSchema.safeParse(toPayload(form, "en", "My farm"));
      expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    });
  }

  it("the estimates themselves never exceed what the server accepts", () => {
    for (let ha = 0.05; ha <= 500; ha += 0.7) {
      const d = defaultsFor(ha);
      expect(d.basinM3).toBeLessThanOrEqual(5000);
      expect(d.pvKWp).toBeLessThanOrEqual(500);
      expect(d.wellSafeYieldM3h).toBeLessThanOrEqual(1000);
      expect(d.pumpHeadM).toBeLessThanOrEqual(300);
    }
  });

  it("small fields keep their old estimates", () => {
    expect(defaultsFor(1)).toEqual({ basinM3: 60, pvKWp: 3, pumpHeadM: 15, wellSafeYieldM3h: 20 });
    expect(defaultsFor(20)).toEqual({ basinM3: 1200, pvKWp: 60, pumpHeadM: 15, wellSafeYieldM3h: 400 });
  });
});

describe("explaining a refused save", () => {
  const t = dictionaries.en;
  it("names the part to fix and the step that holds it", () => {
    expect(explainRefusal([{ path: ["wellSafeYieldM3h"], message: "Too big" }], t)).toEqual({ message: t.onboarding.errors.pump, step: 2 });
    expect(explainRefusal([{ path: ["basinM3"] }], t)).toEqual({ message: t.onboarding.errors.basin, step: 2 });
    expect(explainRefusal([{ path: ["areaHa"] }], t)).toEqual({ message: t.onboarding.errors.area, step: 1 });
    expect(explainRefusal([{ path: ["plantingDate"] }], t)).toEqual({ message: t.onboarding.errors.planted, step: 1 });
    expect(explainRefusal([{ path: ["lat"] }], t)).toEqual({ message: t.onboarding.errors.location, step: 0 });
  });
  it("tells the three outline problems apart", () => {
    expect(explainRefusal([{ path: ["polygon"], message: "outline: crosses" }], t)?.message).toBe(t.onboarding.errors.outlineCrosses);
    expect(explainRefusal([{ path: ["polygon"], message: "outline: size" }], t)?.message).toBe(t.onboarding.errors.outlineSize);
    expect(explainRefusal([{ path: ["polygon"], message: "outline: incomplete" }], t)?.message).toBe(t.onboarding.errors.outlineIncomplete);
    expect(explainRefusal([{ path: ["polygon"], message: "outline: crosses" }], t)?.step).toBe(0);
  });
  it("says nothing it cannot back up", () => {
    expect(explainRefusal(undefined, t)).toBeNull();
    expect(explainRefusal([], t)).toBeNull();
    expect(explainRefusal([{ path: ["somethingNew"] }], t)).toBeNull();
    expect(explainRefusal([{ message: "no path" }], t)).toBeNull();
  });
  it("speaks every language", () => {
    for (const lang of ["en", "ar", "ja"] as const) expect(explainRefusal([{ path: ["wellSafeYieldM3h"] }], dictionaries[lang])?.message.length).toBeGreaterThan(10);
  });
});
