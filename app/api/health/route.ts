import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/lib/db";

// Public liveness probe: database round-trip + which settings are present (booleans only, never values).
export async function GET() {
  await connection();
  const t0 = Date.now();
  let dbOk = false;
  let error: string | undefined;
  try {
    await db.select({ n: sql<number>`count(*)` }).from(schema.user);
    dbOk = true;
  } catch (e) {
    error = String(e).slice(0, 160);
  }
  return Response.json({
    ok: dbOk,
    db: { ok: dbOk, ms: Date.now() - t0, error },
    config: {
      authSecret: !!process.env.BETTER_AUTH_SECRET,
      baseUrl: !!process.env.BETTER_AUTH_URL,
      gemini: !!process.env.GEMINI_API_KEY,
      geminiDemo: !!process.env.GEMINI_API_KEY_DEMO,
      remoteDb: /^(libsql|https?|wss?):/.test(process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? ""),
    },
  });
}
