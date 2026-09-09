import {
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type CatalogAnalyticsEventType = "view" | "click";

/**
 * Anonymous catalog engagement events.
 *
 * visitorHash is derived server-side from a client-generated random id and
 * business id. The unique index makes refreshes idempotent for each visitor,
 * product and day without retaining an identifying browser value.
 */
export const catalogAnalyticsEventsTable = pgTable(
  "catalog_analytics_events",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull(),
    eventType: text("event_type").$type<CatalogAnalyticsEventType>().notNull(),
    offeringKey: text("offering_key").notNull().default(""),
    visitorHash: text("visitor_hash").notNull(),
    eventDay: date("event_day").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("catalog_analytics_business_event_idx").on(
      table.businessId,
      table.eventType,
      table.createdAt,
    ),
    uniqueIndex("catalog_analytics_dedupe_idx").on(
      table.businessId,
      table.eventType,
      table.offeringKey,
      table.visitorHash,
      table.eventDay,
    ),
  ],
);

export type CatalogAnalyticsEvent = typeof catalogAnalyticsEventsTable.$inferSelect;