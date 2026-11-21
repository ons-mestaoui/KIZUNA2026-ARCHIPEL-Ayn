import { z } from "zod";
import { cell, getMetric } from "@/lib/server/satellite";
import { getFarm, getUser, unauthorized } from "@/lib/server/session";

export const maxDuration = 60;

const query = z.object({ metric: z.enum(["rain", "soil", "heat", "ndvi"]) });

// One satellite metric around the caller's farm (the farm comes from the session, never the query).
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const farm = await getFarm(user.id);
  if (!farm) return Response.json({ error: "no_farm" }, { status: 404 });
  const parsed = query.safeParse({ metric: new URL(request.url).searchParams.get("metric") });
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422 });
  try {
    const data = await getMetric(parsed.data.metric, cell(farm.lat), cell(farm.lon), new Date().toISOString().slice(0, 10));
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: "satellite_unavailable", detail: String(e).slice(0, 160) }, { status: 503 });
  }
}
