import "server-only";
import { CdseError, createCdseClient, type CdseClient } from "@/lib/field/copernicus-core";

// The one Copernicus client of this server. The keys live only in the environment (never NEXT_PUBLIC_).

/** The free plan is reported at about 10 000 processing units a month; one field refresh costs 2–3. A hard cap per hour keeps a bug or a bot from spending a month in a day. */
const HOURLY_BUDGET = 200;
const stamps: number[] = [];
let client: CdseClient | null = null;

function spend() {
  const now = Date.now();
  while (stamps.length && now - stamps[0] > 3_600_000) stamps.shift();
  if (stamps.length >= HOURLY_BUDGET) throw new CdseError("quota", "Satellite request budget for this hour is used up");
  stamps.push(now);
}

export const cdseConfigured = () => !!process.env.CDSE_CLIENT_ID?.trim() && !!process.env.CDSE_CLIENT_SECRET?.trim();

export function cdse(): CdseClient {
  if (!client) {
    const id = process.env.CDSE_CLIENT_ID?.trim();
    const secret = process.env.CDSE_CLIENT_SECRET?.trim();
    if (!id || !secret) throw new CdseError("not_configured", "Copernicus keys are not set (CDSE_CLIENT_ID, CDSE_CLIENT_SECRET)");
    client = createCdseClient({ id, secret }, { beforeCall: spend });
  }
  return client;
}
