import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id:           uuid("id").defaultRandom().primaryKey(),
  phone:        text("phone").notNull().unique(),   // stored as +244XXXXXXXXX
  name:         text("name").notNull(),
  handle:       text("handle").unique(),             // personalised URL slug, e.g. "joao"
  pinHash:      text("pin_hash").notNull(),          // SHA-256 hex of the 4-digit PIN
  sessionToken: text("session_token"),               // opaque token handed to client
  createdAt:    timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof usersTable.$inferSelect;
