import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getUser, unauthorized } from "@/lib/server/session";

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as { farmId?: string } | null;
  const farmId = body?.farmId;
  if (!farmId) return Response.json({ error: "missing_farm_id" }, { status: 400 });

  const [target] = await db
    .select()
    .from(schema.farm)
    .where(and(eq(schema.farm.id, farmId), eq(schema.farm.userId, user.id)))
    .limit(1);

  if (!target) return Response.json({ error: "not_found" }, { status: 404 });

  // Update updatedAt so it becomes the most recently used plot
  await db.update(schema.farm).set({ updatedAt: new Date() }).where(eq(schema.farm.id, farmId));

  return Response.json(
    { ok: true, farmId },
    {
      headers: {
        "Set-Cookie": `gd_farm_id=${farmId}; Path=/; SameSite=Lax; Max-Age=31536000`,
      },
    },
  );
}
