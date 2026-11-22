import { z } from "zod";
import { cell, getMetric } from "@/lib/server/satellite";
import { getFarm, getUser, unauthorized } from "@/lib/server/session";

export const maxDuration = 60;

const query = z.object({
  metric: z.enum(["rain", "soil", "heat", "ndvi"]),
  farmId: z.string().nullish(),
});

// One satellite metric around the caller's farm (the farm comes from the session/query).
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const parsed = query.safeParse({
    metric: url.searchParams.get("metric"),
    farmId: url.searchParams.get("farmId"),
  });
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 422 });

  const farm = await getFarm(user.id, request, parsed.data.farmId);
  if (!farm) return Response.json({ error: "no_farm" }, { status: 404 });

  try {
    const data = await getMetric(parsed.data.metric, cell(farm.lat), cell(farm.lon), new Date().toISOString().slice(0, 10));
    return Response.json(data, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Vary": "Cookie, x-farm-id",
      },
    });
  } catch (e) {
    return Response.json({ error: "satellite_unavailable", detail: String(e).slice(0, 160) }, { status: 503 });
  }
}
