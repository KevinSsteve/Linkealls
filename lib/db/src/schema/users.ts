import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id:           uuid("id").defaultRandom().primaryKey(),
  phone:        text("phone").notNull().unique(),   // stored as +244XXXXXXXXX
  name:         text("name").notNull(),
  handle:       text("handle").unique(),             // personalised URL slug, e.g. "joao"
  ownedSlug:    text("owned_slug"),                  // slug of the business this user owns, e.g. "electropanga"
  pinHash:      text("pin_hash").notNull(),          // SHA-256 hex of the 4-digit PIN
  recoveryCodeHash: text("recovery_code_hash"),      // one-time account recovery secret
  recoveryCodeIssuedAt: timestamp("recovery_code_issued_at"),
  sessionToken: text("session_token"),               // opaque token handed to client
  sessionExpiresAt: timestamp("session_expires_at").notNull().default(sql`now() + interval '30 days'`),
  sensitiveAuthExpiresAt: timestamp("sensitive_auth_expires_at"),
  replitId:     varchar("replit_id").unique(),       // Replit OIDC subject, when linked
  email:        varchar("email"),
  firstName:    varchar("first_name"),
  lastName:     varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof usersTable.$inferSelect;
