import { jsonb, pgTable, timestamp, varchar, index } from "drizzle-orm/pg-core";

/**
 * Replit Auth's server-side OIDC session store.
 *
 * The local users table remains the Linkealls business identity. This table
 * only holds the short-lived browser session and OIDC tokens.
 */
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export type AuthSession = typeof sessionsTable.$inferSelect;