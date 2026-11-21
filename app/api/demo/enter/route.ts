import { auth } from "@/lib/auth";
import { DEMO_EMAIL } from "@/lib/demo";
import { demoEnabled, dropDemoUser, ensureDemoUser, seedDemoFarm } from "@/lib/server/demoSeed";

// The demo's front door: signs in as the demo account on the visitor's behalf, resets it to a clean
// state, and lands on /demo. Hidden: the landing page has no link to it (Shift+D, long-press the
// logo, or /?demo=kizuna). Switched off unless DEMO_ENTRY=1 and DEMO_PASSWORD are set.
export async function GET(request: Request) {
  if (!demoEnabled()) return new Response("Not found", { status: 404 });

  // This GET signs the visitor in and resets the demo, so a page on another site must not be able to
  // trigger it (an <img> tag or a link would be enough). Navigations that start on our own site, or are
  // typed into the address bar, send Sec-Fetch-Site "same-origin" / "none"; anything else is refused.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return new Response("Forbidden", { status: 403 });

  const signIn = async () =>
    auth.api.signInEmail({ body: { email: DEMO_EMAIL, password: process.env.DEMO_PASSWORD! }, headers: request.headers, asResponse: true });

  let userId = await ensureDemoUser();
  let res = await signIn();
  if (!res.ok) {
    // the password in the environment changed since the account was made: rebuild the account
    await dropDemoUser();
    userId = await ensureDemoUser();
    res = await signIn();
    if (!res.ok) return new Response("Demo sign-in failed", { status: 500 });
  }
  await seedDemoFarm(userId);

  const out = new Response(null, { status: 303, headers: { Location: "/demo", "Cache-Control": "no-store" } });
  for (const cookie of res.headers.getSetCookie()) out.headers.append("Set-Cookie", cookie);
  return out;
}
