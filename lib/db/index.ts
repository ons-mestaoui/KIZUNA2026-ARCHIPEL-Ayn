import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Local dev / laptop fallback: a SQLite file. Production: Turso (libsql://…) + TURSO_AUTH_TOKEN.
// (TURSO_DATABASE_URL is the name the Vercel ↔ Turso integration injects.)
const url = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? "file:data/local.db";

// Reuse one client across hot reloads in dev.
const g = globalThis as unknown as { __libsql?: Client };
const client = (g.__libsql ??= createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }));

export const db = drizzle(client, { schema });
export { schema };
