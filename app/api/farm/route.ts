import { db, schema } from "@/lib/db";
import { farmInputSchema } from "@/lib/farm-schema";
import { getFarm, getUser, unauthorized } from "@/lib/server/session";

// The caller's farm. userId always comes from the session — never from the request body.
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  return Response.json({ farm: await getFarm(user.id) });
}

export async function PUT(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = farmInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }, { status: 422 });
  }
  const v = parsed.data;
  const values = {
    name: v.name,
    lat: v.lat,
    lon: v.lon,
    placeName: v.placeName ?? null,
    crop: v.crop,
    plantingDate: v.plantingDate ?? null,
    areaHa: v.areaHa,
    soilTexture: v.soilTexture,
    irrigationMethod: v.irrigationMethod,
    waterSource: v.waterSource,
    basinM3: v.waterSource === "solar_basin" ? v.basinM3 : 0,
    pvKWp: v.waterSource === "solar_basin" || v.waterSource === "solar_direct" ? v.pvKWp : 0,
    pumpHeadM: v.pumpHeadM,
    wellSafeYieldM3h: v.wellSafeYieldM3h,
    lastIrrigated: v.lastIrrigated,
    lang: v.lang,
  };

  const [saved] = await db
    .insert(schema.farm)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: schema.farm.userId, set: { ...values, updatedAt: new Date() } })
    .returning();
  return Response.json({ farm: saved });
}
