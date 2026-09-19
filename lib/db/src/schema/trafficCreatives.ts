import { pgTable, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type TrafficCreativeMediaType = "image" | "video";

export const trafficCreativesTable = pgTable("traffic_creatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: integer("business_id").notNull(),
  description: text("description").notNull(),
  objectPath: text("object_path").notNull(),
  mediaMimeType: text("media_mime_type").notNull(),
  mediaType: text("media_type").$type<TrafficCreativeMediaType>().notNull(),
  publicSlug: text("public_slug").notNull().unique(),
  active: integer("active").notNull().default(1),
  visitCount: integer("visit_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const objectPathSchema = z.string().regex(/^\/objects\/traffic-creatives\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/);
export const trafficCreativeMediaMimeTypes = ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime"] as const;

export const createTrafficCreativeSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  objectPath: objectPathSchema,
  mediaMimeType: z.enum(trafficCreativeMediaMimeTypes),
});

export const updateTrafficCreativeSchema = z.object({
  description: z.string().trim().min(1).max(2000).optional(),
  active: z.boolean().optional(),
});

export type TrafficCreative = typeof trafficCreativesTable.$inferSelect;
export type InsertTrafficCreative = typeof trafficCreativesTable.$inferInsert;