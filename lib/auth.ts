import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/lib/db";

// Extra origins allowed to talk to the auth API besides BETTER_AUTH_URL:
//   • Vercel preview/production hosts  → BETTER_AUTH_TRUSTED_ORIGINS="https://*.vercel.app"
//   • venue-Wi-Fi laptop fallback      → "http://192.168.*.*:3000,http://172.*.*.*:3000"
const extraOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  // No mail service in this prototype → no verification e-mails and no password reset.
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  // Better Auth's production default is 3 sign-ups / sign-ins per 10 s *per IP*. At a hackathon a whole
  // room of judges scans the QR code at once from ONE venue Wi-Fi address, so the default would block them.
  rateLimit: {
    window: 10,
    max: 100,
    customRules: {
      "/sign-up/email": { window: 10, max: 30 },
      "/sign-in/email": { window: 10, max: 30 },
    },
  },
  // The app always trusts its own BETTER_AUTH_URL. Plain localhost is added for development only; anything else
  // (phones on the Wi-Fi, ...) must be listed in BETTER_AUTH_TRUSTED_ORIGINS.
  trustedOrigins: [...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000"]), ...extraOrigins],
  plugins: [nextCookies()], // must stay last: lets server code set the session cookie
});

export type Session = typeof auth.$Infer.Session;
