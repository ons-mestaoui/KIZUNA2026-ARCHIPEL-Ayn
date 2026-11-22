import { loadFarmState, toDTO } from "@/lib/server/farmState";
import { getFarm, getFarms, getUser, unauthorized } from "@/lib/server/session";

export const maxDuration = 30;

// Everything the farmer screens need: balance, today's plan, the 7-day plan, plus the list of user's plots.
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const [farm, farms] = await Promise.all([
    getFarm(user.id, request),
    getFarms(user.id),
  ]);
  if (!farm) return Response.json({ error: "no_farm" }, { status: 404 });
  try {
    const state = await loadFarmState(farm);
    state.farms = farms.map(toDTO);
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: "weather_unavailable", detail: String(e).slice(0, 160) }, { status: 503 });
  }
}
