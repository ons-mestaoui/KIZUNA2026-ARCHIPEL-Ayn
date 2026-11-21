import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { farmContext } from "@/lib/server/aiContext";
import { diagnose } from "@/lib/server/diagnose";
import { loadFarmState } from "@/lib/server/farmState";
import { DEMO_EMAIL, getFarm, getUser, unauthorized } from "@/lib/server/session";
import { CANNED_DIAGNOSIS, demoOffline } from "@/lib/server/demoCanned";
import { DEMO_CAPS, refundQuota, takeQuota } from "@/lib/server/usage";

export const maxDuration = 60;

const dataUrl = (maxChars: number) => z.string().max(maxChars).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);
const body = z.object({
  image: dataUrl(4_000_000), // the browser sends a ~1024 px JPEG (a few hundred KB)
  thumb: dataUrl(60_000).optional(),
  note: z.string().trim().max(300).optional(),
  lang: z.enum(["en", "ar", "ja"]),
});

// A photo of a plant → what is probably wrong, and what to do. Quota-limited per farmer per day.
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const farm = await getFarm(user.id);
  if (!farm) return Response.json({ error: "no_farm" }, { status: 404 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_image" }, { status: 422 });
  const { image, thumb, note, lang } = parsed.data;

  const demo = user.email === DEMO_EMAIL;
  const q = await takeQuota(user.id, "photos", demo ? DEMO_CAPS.photos : undefined);
  if (!q.ok) return Response.json({ error: "quota", cap: q.cap }, { status: 429 });

  // Presenter-controlled offline mode: a saved answer, labelled as such in the interface.
  if (demo && demoOffline()) {
    const result = CANNED_DIAGNOSIS[lang];
    const [row] = await db
      .insert(schema.diagnosis)
      .values({ farmId: farm.id, thumb: thumb ?? null, lang, resultJson: JSON.stringify(result) })
      .returning({ id: schema.diagnosis.id, createdAt: schema.diagnosis.createdAt });
    return Response.json({ id: row.id, createdAt: row.createdAt.toISOString(), thumb: thumb ?? null, result, model: "saved", cached: true });
  }

  try {
    const state = await loadFarmState(farm).catch(() => null); // weather down → still diagnose
    const [header, base64] = image.split(",", 2);
    const { diagnosis, model } = await diagnose({
      imageBase64: base64,
      mimeType: header.slice(5, header.indexOf(";")),
      note,
      lang,
      context: farmContext(state, farm),
      kind: demo ? "demo" : "public",
    });
    const [row] = await db
      .insert(schema.diagnosis)
      .values({ farmId: farm.id, thumb: thumb ?? null, lang, resultJson: JSON.stringify(diagnosis) })
      .returning({ id: schema.diagnosis.id, createdAt: schema.diagnosis.createdAt });
    return Response.json({ id: row.id, createdAt: row.createdAt.toISOString(), thumb: thumb ?? null, result: diagnosis, model });
  } catch (e) {
    await refundQuota(user.id, "photos");
    const busy = /429|quota|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded/i.test(String(e));
    return Response.json({ error: busy ? "busy" : "ai_failed", detail: String(e).slice(0, 200) }, { status: busy ? 503 : 502 });
  }
}

// History: the farmer's latest checks.
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const farm = await getFarm(user.id);
  if (!farm) return Response.json({ items: [] });
  const rows = await db.select().from(schema.diagnosis).where(eq(schema.diagnosis.farmId, farm.id)).orderBy(desc(schema.diagnosis.id)).limit(12);
  return Response.json({
    items: rows.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), thumb: r.thumb, result: JSON.parse(r.resultJson) })),
  });
}
