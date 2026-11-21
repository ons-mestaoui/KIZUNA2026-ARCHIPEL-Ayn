import { CdseError } from "@/lib/field/copernicus-core";
import { polygonKey } from "@/lib/field/geo";
import type { LonLat } from "@/lib/field/types";
import { getField } from "@/lib/server/field";
import { getFarm, getUser, unauthorized } from "@/lib/server/session";

export const maxDuration = 60;

// The satellite view of the caller's own field (the farm comes from the session, never from the query).
//   404 no_farm / no_polygon: nothing to look at yet
//   503 satellite_unavailable: Copernicus could not be reached; the page keeps its last copy and offers a retry
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  const farm = await getFarm(user.id);
  if (!farm) return Response.json({ error: "no_farm" }, { status: 404 });
  const outline = farm.polygon as LonLat[] | null;
  if (!outline || outline.length < 3) return Response.json({ error: "no_polygon" }, { status: 404 });
  try {
    const field = await getField(polygonKey(outline), new Date().toISOString().slice(0, 10));
    return Response.json(field, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    const kind = e instanceof CdseError ? e.kind : "unknown";
    console.error(`[field] ${kind}: ${e instanceof Error ? e.message : "unknown error"}`); // messages are scrubbed of secrets
    return Response.json({ error: "satellite_unavailable", kind }, { status: 503 });
  }
}
