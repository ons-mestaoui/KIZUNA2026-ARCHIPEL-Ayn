// Lists the tables in the configured database (local file or Turso).  node scripts/db-tables.mjs
import { createClient } from "@libsql/client";

try {
  process.loadEnvFile(".env.local");
} catch {}

const c = createClient({ url: process.env.DATABASE_URL ?? "file:data/local.db", authToken: process.env.TURSO_AUTH_TOKEN });
const r = await c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name");
console.log(r.rows.map((x) => x.name).join(", "));
