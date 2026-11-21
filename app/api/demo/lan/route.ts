import { lanAddresses } from "@/lib/server/lan";
import { DEMO_EMAIL, getUser, unauthorized } from "@/lib/server/session";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// The demo's QR code must open on a judge's phone, and a phone cannot open "localhost". When the demo runs
// on the presenter's laptop, the page asks here for the laptop's Wi-Fi address. Only the demo account gets
// an answer, and only when the page itself was opened through localhost: on the internet the page's own
// address is already the right one, and this server's network details are never handed out.
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return unauthorized();
  if (user.email !== DEMO_EMAIL) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(request.url);
  if (!LOOPBACK.has(url.hostname)) return Response.json({ origin: null });
  const [ip] = lanAddresses();
  if (!ip) return Response.json({ origin: null });
  return Response.json({ origin: `${url.protocol}//${ip}${url.port ? `:${url.port}` : ""}` });
}
