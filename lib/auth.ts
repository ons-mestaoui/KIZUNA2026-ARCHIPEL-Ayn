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
  trustedOrigins: ["http://localhost:3000", ...extraOrigins],
  plugins: [nextCookies()], // must stay last: lets server code set the session cookie
});

export type Session = typeof auth.$Infer.Session;
