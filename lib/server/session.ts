import "server-only";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export { DEMO_EMAIL } from "@/lib/demo";

/** The signed-in user for a route handler, or null. Always verify here, close to the data. */
export async function getUser(request: Request) {
  const s = await auth.api.getSession({ headers: request.headers });
  return s?.user ?? null;
}

/** The caller's farm (farmId comes from the session, never from the client). */
export async function getFarm(userId: string) {
  const rows = await db.select().from(schema.farm).where(eq(schema.farm.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
