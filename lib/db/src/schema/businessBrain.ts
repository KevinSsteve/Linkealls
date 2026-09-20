import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export type BusinessKnowledgeKind =
  | "fact"
  | "suggestion"
  | "feedback"
  | "interaction_memory"
  | "marketing_playbook";

export type BusinessKnowledgeStatus = "proposed" | "approved" | "rejected" | "archived";
export type BusinessKnowledgeVisibility = "owner_only" | "visitor_safe";

export interface BusinessKnowledgeContent {
  summary: string;
  details?: string[];
  tags?: string[];
}

export interface BusinessKnowledgeProvenance {
  source: "owner" | "profile" | "system" | "visitor" | "ai" | "website" | "advertising";
  sourceRef?: string;
  sourceUrl?: string;
  reviewedAt?: string;
}

export const businessKnowledgeTable = pgTable("business_knowledge", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: integer("business_id").notNull(),
  kind: text("kind").$type<BusinessKnowledgeKind>().notNull(),
  key: text("key").notNull(),
  version: integer("version").notNull(),
  status: text("status").$type<BusinessKnowledgeStatus>().notNull().default("proposed"),
  visibility: text("visibility").$type<BusinessKnowledgeVisibility>().notNull().default("owner_only"),
  content: jsonb("content").$type<BusinessKnowledgeContent>().notNull(),
  provenance: jsonb("provenance").$type<BusinessKnowledgeProvenance>().notNull(),
  confidence: integer("confidence").notNull().default(50),
  sourceLeadId: uuid("source_lead_id"),
  validFrom: timestamp("valid_from").notNull().defaultNow(),
  validUntil: timestamp("valid_until"),
  reviewAt: timestamp("review_at"),
  approvedAt: timestamp("approved_at"),
  reviewComment: text("review_comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("business_knowledge_version_unique").on(
    table.businessId,
    table.kind,
    table.key,
    table.version,
  ),
  uniqueIndex("business_knowledge_one_approved_unique")
    .on(table.businessId, table.kind, table.key)
    .where(sql`${table.status} = 'approved'`),
  index("business_knowledge_lookup_idx").on(table.businessId, table.status, table.kind),
  index("business_knowledge_lead_idx").on(table.businessId, table.sourceLeadId),
]);

export interface BusinessAiEvaluationScores {
  grounded: boolean | null;
  tenantSafe: boolean | null;
  injectionSafe: boolean | null;
  piiSafe: boolean | null;
  quality?: number | null;
}

export const businessAiEvaluationsTable = pgTable("business_ai_evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: integer("business_id").notNull(),
  channel: text("channel").notNull(),
  promptVersion: text("prompt_version").notNull(),
  scenario: text("scenario").notNull(),
  outcome: text("outcome").notNull(),
  scores: jsonb("scores").$type<BusinessAiEvaluationScores>().notNull(),
  latencyMs: integer("latency_ms").notNull(),
  costMicros: integer("cost_micros"),
  inputHash: text("input_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("business_ai_evaluations_tenant_idx").on(table.businessId, table.createdAt),
]);

const knowledgeContentSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  details: z.array(z.string().trim().min(1).max(2000)).max(30).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

const knowledgeProvenanceSchema = z.object({
  source: z.enum(["owner", "profile", "system", "visitor", "ai", "website", "advertising"]),
  sourceRef: z.string().max(500).optional(),
  sourceUrl: z.string().url().max(1000).optional(),
  reviewedAt: z.string().datetime().optional(),
});

export const proposeBusinessKnowledgeSchema = z.object({
  kind: z.enum(["fact", "suggestion", "feedback", "marketing_playbook"]),
  key: z.string().trim().min(1).max(160).regex(/^[a-z0-9][a-z0-9._:-]*$/),
  content: knowledgeContentSchema,
  provenance: knowledgeProvenanceSchema.optional(),
  confidence: z.number().int().min(0).max(100).default(80),
  visibility: z.enum(["owner_only", "visitor_safe"]).default("owner_only"),
  validUntil: z.coerce.date().nullable().optional(),
  reviewAt: z.coerce.date().nullable().optional(),
});

export const reviewBusinessKnowledgeSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().trim().max(1000).optional(),
});

export const insertBusinessKnowledgeSchema = createInsertSchema(businessKnowledgeTable);
export type BusinessKnowledge = typeof businessKnowledgeTable.$inferSelect;
export type BusinessAiEvaluation = typeof businessAiEvaluationsTable.$inferSelect;