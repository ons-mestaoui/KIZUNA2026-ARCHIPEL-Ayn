import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export { DEMO_EMAIL } from "@/lib/demo";

/** The signed-in user for a route handler, or null. Always verify here, close to the data. */
export async function getUser(request: Request) {
  const s = await auth.api.getSession({ headers: request.headers });
  return s?.user ?? null;
}

/** All farms (plots) belonging to this user, ordered by most recently updated first. */
export async function getFarms(userId: string) {
  return db.select().from(schema.farm).where(eq(schema.farm.userId, userId)).orderBy(desc(schema.farm.updatedAt));
}

/**
 * The caller's active farm (from cookie, header, or query param, falling back to the most recently updated farm).
 * Verifies that the requested farm belongs to userId.
 */
export async function getFarm(userId: string, request?: Request, explicitFarmId?: string | null) {
  let targetId = explicitFarmId ?? null;
  if (!targetId && request) {
    targetId = request.headers.get("x-farm-id");
    if (!targetId) {
      const cookie = request.headers.get("cookie") ?? "";
      const match = cookie.match(/(?:^|;\s*)gd_farm_id=([^;]+)/);
      if (match) targetId = decodeURIComponent(match[1]);
    }
    if (!targetId) {
      try {
        targetId = new URL(request.url).searchParams.get("farmId");
      } catch {}
    }
  }

  if (targetId) {
    const rows = await db
      .select()
      .from(schema.farm)
      .where(and(eq(schema.farm.id, targetId), eq(schema.farm.userId, userId)))
      .limit(1);
    if (rows[0]) return rows[0];
  }

  const rows = await db
    .select()
    .from(schema.farm)
    .where(eq(schema.farm.userId, userId))
    .orderBy(desc(schema.farm.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
