import { loadFarmState } from "@/lib/server/farmState";
import { getFarm, getUser, unauthorized } from "@/lib/server/session";

export const maxDuration = 30;

// Everything the farmer screens need: balance, today's plan, the 7-day plan. Computed by the engine.
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const farm = await getFarm(user.id);
  if (!farm) return Response.json({ error: "no_farm" }, { status: 404 });
  try {
    return Response.json(await loadFarmState(farm), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: "weather_unavailable", detail: String(e).slice(0, 160) }, { status: 503 });
  }
}
