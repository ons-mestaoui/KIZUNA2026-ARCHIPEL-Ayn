import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Same "@/..." imports as the app, so tests can load modules that use them (e.g. lib/farm-schema.ts).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
