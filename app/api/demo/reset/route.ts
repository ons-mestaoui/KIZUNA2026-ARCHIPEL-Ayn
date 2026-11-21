import { DEMO_EMAIL, getUser, unauthorized } from "@/lib/server/session";
import { seedDemoFarm } from "@/lib/server/demoSeed";

// "Reset demo": only the demo account may call it, and it only ever touches the demo account.
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  if (user.email !== DEMO_EMAIL) return Response.json({ error: "forbidden" }, { status: 403 });
  await seedDemoFarm(user.id);
  return Response.json({ ok: true });
}
