import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { farmInputSchema, type FarmPayload } from "@/lib/farm-schema";
import { polygonAreaHa, polygonCentroid } from "@/lib/field/geo";
import { getFarm, getFarms, getUser, unauthorized } from "@/lib/server/session";

function extractFarmValues(v: FarmPayload) {
  // An outline is the source of truth for where the farm is and how big: never trust numbers sent next to it.
  const outline = v.polygon ?? null;
  const [lon, lat] = outline ? polygonCentroid(outline) : [v.lon, v.lat];
  return {
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
}

// The caller's farm(s). userId always comes from the session — never from the request body.
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const explicitId = new URL(request.url).searchParams.get("id");
  const [farm, farms] = await Promise.all([
    getFarm(user.id, request, explicitId),
    getFarms(user.id),
  ]);
  return Response.json({ farm, farms });
}

// Create a new plot/farm for this user.
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = farmInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }, { status: 422 });
  }

  const values = extractFarmValues(parsed.data);
  const [saved] = await db
    .insert(schema.farm)
    .values({ userId: user.id, ...values })
    .returning();

  const farms = await getFarms(user.id);
  return Response.json(
    { farm: saved, farms },
    {
      headers: {
        "Set-Cookie": `gd_farm_id=${saved.id}; Path=/; SameSite=Lax; Max-Age=31536000`,
      },
    },
  );
}

// Update an existing plot, or create the first one if none exists.
export async function PUT(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = farmInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }, { status: 422 });
  }

  const targetId = parsed.data.id || new URL(request.url).searchParams.get("id");
  const current = await getFarm(user.id, request, targetId);
  const values = extractFarmValues(parsed.data);

  if (!current) {
    // No farm exists yet: create the first one
    const [saved] = await db
      .insert(schema.farm)
      .values({ userId: user.id, ...values })
      .returning();
    const farms = await getFarms(user.id);
    return Response.json(
      { farm: saved, farms },
      {
        headers: {
          "Set-Cookie": `gd_farm_id=${saved.id}; Path=/; SameSite=Lax; Max-Age=31536000`,
        },
      },
    );
  }

  const [saved] = await db
    .update(schema.farm)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(schema.farm.id, current.id), eq(schema.farm.userId, user.id)))
    .returning();

  const farms = await getFarms(user.id);
  return Response.json(
    { farm: saved, farms },
    {
      headers: {
        "Set-Cookie": `gd_farm_id=${saved.id}; Path=/; SameSite=Lax; Max-Age=31536000`,
      },
    },
  );
}

// Delete a plot. Cannot delete the last remaining plot.
export async function DELETE(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "missing_id" }, { status: 400 });

  const farms = await getFarms(user.id);
  if (farms.length <= 1) {
    return Response.json({ error: "cannot_delete_last_farm" }, { status: 400 });
  }

  const target = farms.find((f) => f.id === id);
  if (!target) return Response.json({ error: "not_found" }, { status: 404 });

  await db.delete(schema.farm).where(and(eq(schema.farm.id, id), eq(schema.farm.userId, user.id)));

  const remaining = farms.filter((f) => f.id !== id);
  const nextActive = remaining[0];

  return Response.json(
    { ok: true, activeId: nextActive.id, farms: remaining },
    {
      headers: {
        "Set-Cookie": `gd_farm_id=${nextActive.id}; Path=/; SameSite=Lax; Max-Age=31536000`,
      },
    },
  );
}
