import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const SALES_STRATEGY_TEMPLATES = [
  "product_commerce",
  "quote_service",
  "appointment_service",
  "high_value",
  "b2b_project",
  "consultative",
] as const;
export type SalesStrategyTemplate = typeof SALES_STRATEGY_TEMPLATES[number];
export type SalesObjective = "purchase" | "quote" | "appointment_request" | "visit_request" | "contact";

export interface SalesStrategyConfig {
  template: SalesStrategyTemplate;
  objective: SalesObjective;
  audience: string;
  priorityOffers: string[];
  essentialQuestions: string[];
  verifiedDifferentials: string[];
  objectionResponses: Array<{ objection: string; response: string }>;
  negotiationLimits: string[];
  escalationRules: string[];
  stageConditions: string[];
  availableActions: Array<"catalog" | "checkout" | "quote_request" | "appointment_request" | "visit_request" | "contact" | "whatsapp" | "owner_handoff">;
  tone?: string;
  /** Runtime-only fields from an approved campaign override. */
  focusedOffer?: string;
  expectedIntent?: string;
  sourceCta?: string;
}

export const salesStrategyConfigSchema = z.object({
  template: z.enum(SALES_STRATEGY_TEMPLATES),
  objective: z.enum(["purchase", "quote", "appointment_request", "visit_request", "contact"]),
  audience: z.string().trim().max(2000),
  priorityOffers: z.array(z.string().trim().min(1).max(200)).max(20),
  essentialQuestions: z.array(z.string().trim().min(1).max(500)).max(20),
  verifiedDifferentials: z.array(z.string().trim().min(1).max(500)).max(30),
  objectionResponses: z.array(z.object({
    objection: z.string().trim().min(1).max(300),
    response: z.string().trim().min(1).max(1000),
  })).max(30),
  negotiationLimits: z.array(z.string().trim().min(1).max(500)).max(20),
  escalationRules: z.array(z.string().trim().min(1).max(500)).max(20),
  stageConditions: z.array(z.string().trim().min(1).max(500)).max(20),
  availableActions: z.array(z.enum(["catalog", "checkout", "quote_request", "appointment_request", "visit_request", "contact", "whatsapp", "owner_handoff"])).max(8),
  tone: z.string().trim().max(500).optional(),
});

export const salesStrategyVersionsTable = pgTable("sales_strategy_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: integer("business_id").notNull(),
  version: serial("version").notNull(),
  name: text("name").notNull(),
  status: text("status").$type<"draft" | "approved" | "active" | "archived">().notNull().default("draft"),
  config: jsonb("config").$type<SalesStrategyConfig>().notNull(),
  gaps: jsonb("gaps").$type<string[]>().notNull().default([]),
  basedOnId: uuid("based_on_id"),
  approvedAt: timestamp("approved_at"),
  activatedAt: timestamp("activated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("sales_strategy_business_idx").on(table.businessId, table.createdAt),
  uniqueIndex("sales_strategy_business_version_unique").on(table.businessId, table.version),
]);

export interface SalesStrategyOverrideConfig {
  focusedOffer?: string;
  expectedIntent?: string;
  objective?: SalesObjective;
  minimumQuestions?: string[];
  cta?: string;
}

export const salesStrategyOverridesTable = pgTable("sales_strategy_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: integer("business_id").notNull(),
  sourceType: text("source_type").$type<"campaign" | "traffic_creative">().notNull(),
  sourceId: uuid("source_id").notNull(),
  strategyVersionId: uuid("strategy_version_id").references(() => salesStrategyVersionsTable.id),
  config: jsonb("config").$type<SalesStrategyOverrideConfig>().notNull().default({}),
  approved: boolean("approved").notNull().default(false),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("sales_strategy_override_source_unique").on(table.businessId, table.sourceType, table.sourceId),
]);

export const salesOutcomeEventsTable = pgTable("sales_outcome_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: integer("business_id").notNull(),
  leadId: uuid("lead_id"),
  strategyVersionId: uuid("strategy_version_id"),
  sourceType: text("source_type"),
  sourceId: uuid("source_id"),
  event: text("event").$type<"welcome" | "recommendation" | "cta_accepted" | "cta_declined" | "checkout" | "payment_confirmed" | "handoff" | "resumed" | "quote_requested" | "visit_requested" | "appointment_requested" | "contact_requested" | "continuation">().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("sales_outcome_business_idx").on(table.businessId, table.createdAt)]);

export const leadChatRequestsTable = pgTable("lead_chat_requests", {
  id: uuid("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  leadId: uuid("lead_id").notNull(),
  memoryRevision: integer("memory_revision").notNull(),
  status: text("status").$type<"processing" | "complete">().notNull().default("processing"),
  response: jsonb("response").$type<{
    reply: string;
    products: Array<{ name: string; price: string; description: string; imageUrl?: string }>;
    nextAction: { type: string; label?: string; reason: string };
    contactCaptured?: boolean;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("lead_chat_request_scope_unique").on(table.businessId, table.leadId, table.id),
  uniqueIndex("lead_chat_request_revision_unique").on(table.businessId, table.leadId, table.memoryRevision),
  index("lead_chat_request_retention_idx").on(table.updatedAt),
]);

export type SalesStrategyVersion = typeof salesStrategyVersionsTable.$inferSelect;