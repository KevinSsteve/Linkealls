import { pgTable, serial, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** One product/service the business offers. */
export interface Offering {
  name: string;
  description: string;
  /** Free-form price text, e.g. "50.000 Kz", "sob consulta". */
  price: string;
  /** Optional product image — stored as an object-storage path served via /api/storage/objects/... */
  imageUrl?: string;
  /** Whether this product is highlighted in the public catalog (max 3). */
  featured?: boolean;
  /** Display order in the catalog (lower = first). */
  sortOrder?: number;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export type AnalysisStatus = "idle" | "running" | "done" | "error";

/**
 * Single-tenant business profile — the "brain" that powers every AI agent
 * (call qualifier today; proactive assistant and campaign strategist later).
 */
export const businessProfilesTable = pgTable("business_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default(""),
  websiteUrl: text("website_url"),
  sector: text("sector").notNull().default(""),
  description: text("description").notNull().default(""),
  targetAudience: text("target_audience").notNull().default(""),
  toneOfVoice: text("tone_of_voice").notNull().default(""),
  differentials: jsonb("differentials").$type<string[]>().notNull().default([]),
  offerings: jsonb("offerings").$type<Offering[]>().notNull().default([]),
  faq: jsonb("faq").$type<FaqItem[]>().notNull().default([]),
  /** What the call agent should discover from each lead. */
  qualificationGoals: jsonb("qualification_goals").$type<string[]>().notNull().default([]),
  analysisStatus: text("analysis_status").$type<AnalysisStatus>().notNull().default("idle"),
  analysisError: text("analysis_error"),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  /** SHA-256 hex of the owner PIN (null = no PIN set yet). */
  ownerPin: text("owner_pin"),
  /** Web Push subscription objects (one per browser/device). */
  pushSubscriptions: jsonb("push_subscriptions").$type<PushSubscriptionJSON[]>().notNull().default([]),
  /** Whether the public product catalog is visible to visitors. */
  catalogEnabled: boolean("catalog_enabled").notNull().default(true),
  /** Vanity slug for the public catalog URL, e.g. "hungry-lion" → /c/hungry-lion */
  catalogSlug: text("catalog_slug").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBusinessProfileSchema = createInsertSchema(businessProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const offeringSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(1000),
  price: z.string().max(100),
  imageUrl: z.string().max(2000).optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const faqItemSchema = z.object({
  question: z.string().max(300),
  answer: z.string().max(1500),
});

/** Fields the owner may edit from the profile UI. */
export const updateBusinessProfileSchema = z.object({
  name: z.string().max(200).optional(),
  websiteUrl: z.string().max(500).nullable().optional(),
  sector: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
  targetAudience: z.string().max(2000).optional(),
  toneOfVoice: z.string().max(1000).optional(),
  differentials: z.array(z.string().max(500)).max(30).optional(),
  offerings: z.array(offeringSchema).max(50).optional(),
  faq: z.array(faqItemSchema).max(50).optional(),
  qualificationGoals: z.array(z.string().max(500)).max(20).optional(),
  catalogEnabled: z.boolean().optional(),
  catalogSlug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens")
    .nullable()
    .optional(),
});

export type InsertBusinessProfile = z.infer<typeof insertBusinessProfileSchema>;
export type UpdateBusinessProfile = z.infer<typeof updateBusinessProfileSchema>;
export type BusinessProfile = typeof businessProfilesTable.$inferSelect;

/** Minimal Web Push subscription shape stored in the DB. */
export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}
