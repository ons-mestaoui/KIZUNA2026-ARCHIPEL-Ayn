import { z } from "zod";

// Shared by the server (validates what the AI returns) and the browser (types what it renders).
export const CATEGORIES = ["water_stress", "nutrient_deficiency", "pest", "disease", "healthy", "unclear"] as const;
export type Category = (typeof CATEGORIES)[number];

export const diagnosisSchema = z.object({
  category: z.enum(CATEGORIES),
  name: z.string().trim().min(1).max(140),
  confidence: z.enum(["low", "medium", "high"]),
  summary: z.string().trim().min(1).max(700),
  evidence: z.array(z.string().trim().max(240)).max(6),
  actions: z.array(z.string().trim().max(280)).max(6),
  waterAdvice: z.string().trim().max(360),
  needsExpert: z.boolean(),
  voice: z.string().trim().min(1).max(420),
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;

/** A saved check as the API returns it. */
export interface DiagnosisItem {
  id: number;
  createdAt: string; // ISO
  thumb: string | null; // small JPEG data-URL
  result: Diagnosis;
  /** true for a saved demo answer (offline presentation mode) */
  cached?: boolean;
}
