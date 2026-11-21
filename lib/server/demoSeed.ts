import "server-only";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { DEMO_EMAIL } from "@/lib/demo";
import { DEMO_CENTRE, DEMO_POLYGON } from "@/lib/demo-field";

export const demoEnabled = () => process.env.DEMO_ENTRY === "1" && !!process.env.DEMO_PASSWORD;

/** The demo account's farm: the same Cap Bon citrus parcel the pitch dashboard shows. */
const DEMO_FARM = {
  name: "Demo farm · Cap Bon",
  lat: DEMO_CENTRE[1], // the middle of the demo field (a real orchard block ~1.4 km north-west of Menzel Bouzelfa)
  lon: DEMO_CENTRE[0],
  placeName: "Cap Bon, Tunisia",
  crop: "citrus",
  plantingDate: null,
  areaHa: 1,
  polygon: DEMO_POLYGON, // exactly 1 ha, so the pitch's engine numbers stay what they were
  soilTexture: "sandy_loam",
  irrigationMethod: "drip",
  waterSource: "solar_basin",
  basinM3: 80,
  pvKWp: 3,
  pumpHeadM: 15,
  wellSafeYieldM3h: 20,
  lastIrrigated: "3-5d",
  lang: "en",
};

async function findUserId(): Promise<string | null> {
  const rows = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, DEMO_EMAIL)).limit(1);
  return rows[0]?.id ?? null;
}

/** Create the demo user on first use. */
export async function ensureDemoUser(): Promise<string> {
  const existing = await findUserId();
  if (existing) return existing;
  const r = await auth.api.signUpEmail({ body: { name: "Demo farmer", email: DEMO_EMAIL, password: process.env.DEMO_PASSWORD! } });
  return r.user.id;
}

/** If DEMO_PASSWORD changed, the old account can't be opened: drop it so the next entry recreates it. */
export async function dropDemoUser(): Promise<void> {
  await db.delete(schema.user).where(eq(schema.user.email, DEMO_EMAIL)); // cascades to sessions, accounts, the farm and its history
}

/** Put the demo account back to a clean state: the farm, no logs, no chats, no diagnoses, fresh AI allowance. */
export async function seedDemoFarm(userId: string): Promise<void> {
  const existing = await db.select({ id: schema.farm.id }).from(schema.farm).where(eq(schema.farm.userId, userId)).limit(1);
  let farmId = existing[0]?.id;
  if (farmId) {
    await db.update(schema.farm).set({ ...DEMO_FARM, createdAt: new Date() }).where(eq(schema.farm.id, farmId));
  } else {
    const [row] = await db.insert(schema.farm).values({ userId, ...DEMO_FARM }).returning({ id: schema.farm.id });
    farmId = row.id;
  }
  await Promise.all([
    db.delete(schema.irrigationLog).where(eq(schema.irrigationLog.farmId, farmId)),
    db.delete(schema.soilCheck).where(eq(schema.soilCheck.farmId, farmId)),
    db.delete(schema.diagnosis).where(eq(schema.diagnosis.farmId, farmId)),
    db.delete(schema.chatMessage).where(eq(schema.chatMessage.farmId, farmId)),
    db.delete(schema.usage).where(eq(schema.usage.userId, userId)),
  ]);
}
