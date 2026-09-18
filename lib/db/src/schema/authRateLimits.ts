import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const authRateLimitsTable = pgTable("auth_rate_limits", {
  bucketKey: varchar("bucket_key", { length: 64 }).primaryKey(),
  resetAt: timestamp("reset_at").notNull(),
  count: integer("count").notNull(),
}, (table) => [
  index("auth_rate_limits_reset_at_idx").on(table.resetAt),
  check("auth_rate_limits_count_check", sql`${table.count} >= 0`),
]);