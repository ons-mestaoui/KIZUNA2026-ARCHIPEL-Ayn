import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { farmToday } from "@/lib/server/farmState";
import { getFarm, getUser, unauthorized } from "@/lib/server/session";

const body = z.object({
  m3: z.number().min(0.1).max(5000),
  source: z.enum(["plan", "manual"]).default("manual"),
});

// Log water the farmer applied today (farm-local date). The farm comes from the session.
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const farm = await getFarm(user.id, request);
  if (!farm) return Response.json({ error: "no_farm" }, { status: 404 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422 });

  const [row] = await db
    .insert(schema.irrigationLog)
    .values({ farmId: farm.id, date: await farmToday(farm), m3: parsed.data.m3, source: parsed.data.source })
    .returning({ id: schema.irrigationLog.id });
  return Response.json({ id: row.id });
}

// Undo: only entries of the caller's own farm can be removed.
export async function DELETE(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const farm = await getFarm(user.id, request);
  if (!farm) return Response.json({ error: "no_farm" }, { status: 404 });

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "invalid" }, { status: 422 });
  await db.delete(schema.irrigationLog).where(and(eq(schema.irrigationLog.id, id), eq(schema.irrigationLog.farmId, farm.id)));
  return Response.json({ ok: true });
}
