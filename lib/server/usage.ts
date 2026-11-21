import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Daily per-user caps protect the shared free Gemini quota from one enthusiastic judge.
export const CAPS = {
  photos: Number(process.env.AI_PHOTOS_PER_DAY ?? 6),
  chats: Number(process.env.AI_CHATS_PER_DAY ?? 30),
} as const;

/** The demo account has its own, larger allowance (and its own Gemini key). Still capped: the entry is public. */
export const DEMO_CAPS = {
  photos: Number(process.env.DEMO_PHOTOS_PER_DAY ?? 40),
  chats: Number(process.env.DEMO_CHATS_PER_DAY ?? 150),
} as const;

export type UsageKind = keyof typeof CAPS;

const today = () => new Date().toISOString().slice(0, 10); // UTC day

/** Atomically count one use. Returns ok=false (and counts nothing) when the day's cap is reached. */
export async function takeQuota(userId: string, kind: UsageKind, cap: number = CAPS[kind]): Promise<{ ok: boolean; used: number; cap: number }> {
  const day = today();
  await db.insert(schema.usage).values({ userId, day }).onConflictDoNothing();
  const col = schema.usage[kind];
  const updated = await db
    .update(schema.usage)
    .set({ [kind]: sql`${col} + 1` })
    .where(and(eq(schema.usage.userId, userId), eq(schema.usage.day, day), sql`${col} < ${cap}`))
    .returning({ used: col });
  if (updated.length === 0) return { ok: false, used: cap, cap };
  return { ok: true, used: updated[0].used, cap };
}

/** Give a use back (the AI call failed, so the farmer shouldn't pay for it). */
export async function refundQuota(userId: string, kind: UsageKind): Promise<void> {
  const col = schema.usage[kind];
  await db
    .update(schema.usage)
    .set({ [kind]: sql`max(${col} - 1, 0)` })
    .where(and(eq(schema.usage.userId, userId), eq(schema.usage.day, today())));
}
