import { db, schema } from "@/lib/db";
import { farmInputSchema } from "@/lib/farm-schema";
import { polygonAreaHa, polygonCentroid } from "@/lib/field/geo";
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
  // An outline is the source of truth for where the farm is and how big: never trust numbers sent next to it.
  const outline = v.polygon ?? null;
  const [lon, lat] = outline ? polygonCentroid(outline) : [v.lon, v.lat];
  const values = {
    name: v.name,
    lat: outline ? Math.round(lat * 1e6) / 1e6 : lat,
    lon: outline ? Math.round(lon * 1e6) / 1e6 : lon,
    placeName: v.placeName ?? null,
    crop: v.crop,
    plantingDate: v.plantingDate ?? null,
    areaHa: outline ? Math.round(polygonAreaHa(outline) * 100) / 100 : v.areaHa,
    polygon: outline ? outline.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6] as [number, number]) : null,
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
