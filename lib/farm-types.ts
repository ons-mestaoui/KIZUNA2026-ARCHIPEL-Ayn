import type { farm } from "@/lib/db/schema";

/** A farm row as the API returns it (timestamps travel as ISO strings). */
export type FarmDTO = Omit<typeof farm.$inferSelect, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};
