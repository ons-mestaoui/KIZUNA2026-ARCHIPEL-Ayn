import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Optimistic gate only: "is there a session cookie?". Real authorization happens in every
 * route handler via auth.api.getSession() (see lib/server/session.ts).
 * getSessionCookie() knows the "__Secure-" cookie prefix used on HTTPS.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/onboarding/:path*", "/demo/:path*"],
};
