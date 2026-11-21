import { connection } from "next/server";
import liveSnapshot from "@/data/demo/weather-live.json";
import { fetchLiveScenario } from "@/lib/weather/openMeteo";

// GET /api/weather → today's forecast for the demo parcel.
// Falls back to the bundled snapshot when Open-Meteo is unreachable (venue wifi).
export async function GET() {
  await connection(); // request-time only (uses the current date)
  try {
    const scenario = await fetchLiveScenario(new Date());
    return Response.json({ scenario, stale: false }, { headers: { "Cache-Control": "s-maxage=900" } });
  } catch (e) {
    return Response.json({ scenario: liveSnapshot, stale: true, error: String(e) });
  }
}
