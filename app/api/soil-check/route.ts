import { z } from "zod";
import { db, schema } from "@/lib/db";
import { farmToday } from "@/lib/server/farmState";
import { getFarm, getUser, unauthorized } from "@/lib/server/session";

const body = z.object({ feel: z.enum(["dry", "moist", "wet"]) });

// The squeeze test: a handful of soil from ~20 cm deep. Re-anchors the water-balance estimate.
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const farm = await getFarm(user.id);
  if (!farm) return Response.json({ error: "no_farm" }, { status: 404 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422 });

  await db.insert(schema.soilCheck).values({ farmId: farm.id, date: await farmToday(farm), feel: parsed.data.feel });
  return Response.json({ ok: true });
}
