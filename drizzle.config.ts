import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read env files on its own.
// Push to production Turso:  $env:ENV_FILE='.env.production.local'; npx drizzle-kit push
try {
  process.loadEnvFile(process.env.ENV_FILE ?? ".env.local");
} catch {
  /* no env file — fall back to defaults */
}

export default defineConfig({
  dialect: "turso",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? "file:data/local.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
