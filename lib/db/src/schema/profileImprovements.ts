import { pgTable, text, timestamp, jsonb, uuid, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const PROFILE_IMPROVEMENT_FIELDS = [
  "name", "avatarUrl", "websiteUrl", "sector", "description", "targetAudience",
  "toneOfVoice", "differentials", "publicLinks", "offerings", "faq",
  "qualificationGoals", "address", "hours", "phone", "email",
  "catalogEnabled", "catalogSlug",
] as const;
export type ProfileImprovementField = typeof PROFILE_IMPROVEMENT_FIELDS[number];

export const profileImprovementFieldSchema = z.enum(PROFILE_IMPROVEMENT_FIELDS);
export const proposalStatusSchema = z.enum(["proposed", "approved", "rejected", "applied", "conflict", "reversed"]);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const resourceKindSchema = z.enum(["text", "link", "image", "document", "video"]);
export const resourceVisibilitySchema = z.enum(["private", "public"]);
export const resourceStatusSchema = z.enum(["draft", "approved", "archived"]);

export const profileChangeProposalTable = pgTable("profile_change_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: integer("business_id").notNull(),
  fieldPath: text("field_path").notNull(),
  proposedValue: jsonb("proposed_value").notNull(),
  baseValue: jsonb("base_value").notNull(),
  baseVersion: timestamp("base_version", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(),
  source: text("source").notNull().default("owner_assistant"),
  sourceRef: text("source_ref"),
  preview: text("preview"),
  status: text("status").$type<ProposalStatus>().notNull().default("proposed"),
  model: text("model"),
  author: text("author").notNull().default("assistant"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  appliedVersion: timestamp("applied_version", { withTimezone: true }),
  applicationResult: jsonb("application_result").$type<Record<string, unknown>>(),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("profile_change_proposals_business_idx").on(table.businessId, table.status),
  uniqueIndex("profile_change_proposals_idempotency_idx").on(table.businessId, table.idempotencyKey),
]);

export const resourceRequestsTable = pgTable("resource_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: integer("business_id").notNull(),
  kind: text("kind").$type<z.infer<typeof resourceKindSchema>>().notNull(),
  purpose: text("purpose").notNull(),
  request: text("request").notNull(),
  status: text("status").$type<"open" | "fulfilled" | "cancelled">().notNull().default("open"),
  source: text("source").notNull().default("owner_assistant"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("resource_requests_business_idx").on(table.businessId, table.status)]);

export const resourceLibraryTable = pgTable("resource_library", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: integer("business_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  kind: text("kind").$type<z.infer<typeof resourceKindSchema>>().notNull(),
  purpose: text("purpose").notNull(),
  visibility: text("visibility").$type<z.infer<typeof resourceVisibilitySchema>>().notNull().default("private"),
  status: text("status").$type<z.infer<typeof resourceStatusSchema>>().notNull().default("draft"),
  url: text("url"),
  objectPath: text("object_path"),
  content: text("content"),
  mimeType: text("mime_type"),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("resource_library_business_idx").on(table.businessId, table.status, table.visibility)]);

export const resourceUploadsTable = pgTable("resource_uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: integer("business_id").notNull(),
  objectPath: text("object_path").notNull(),
  mimeType: text("mime_type").notNull(),
  originalName: text("original_name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  claimedResourceId: uuid("claimed_resource_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("resource_uploads_object_path_idx").on(table.objectPath),
  index("resource_uploads_business_idx").on(table.businessId, table.claimedResourceId),
]);

export const resourceDeliveryAuditTable = pgTable("resource_delivery_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: integer("business_id").notNull(),
  resourceId: uuid("resource_id").notNull(),
  leadId: uuid("lead_id").notNull(),
  purpose: text("purpose").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  result: text("result").notNull().default("delivered"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("resource_delivery_idempotency_idx").on(table.businessId, table.idempotencyKey),
  index("resource_delivery_lead_idx").on(table.businessId, table.leadId),
]);

export const profileImprovementAuditTable = pgTable("profile_improvement_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: integer("business_id").notNull(),
  proposalId: uuid("proposal_id").notNull(),
  action: text("action").notNull(),
  beforeValue: jsonb("before_value").notNull(),
  afterValue: jsonb("after_value").notNull(),
  model: text("model"),
  author: text("author").notNull(),
  result: text("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("profile_improvement_audit_business_idx").on(table.businessId, table.createdAt)]);

export const profileChangeProposalInputSchema = z.object({
  fieldPath: profileImprovementFieldSchema,
  proposedValue: z.unknown(),
  reason: z.string().trim().min(3).max(2000),
  preview: z.string().trim().min(3).max(2000),
});
export const resourceRequestInputSchema = z.object({
  kind: resourceKindSchema,
  purpose: z.string().trim().min(1).max(200),
  request: z.string().trim().min(3).max(2000),
});
export const resourceInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(""),
  kind: resourceKindSchema,
  purpose: z.string().trim().min(1).max(200),
  url: z.string().url().max(2000).nullable().optional(),
  objectPath: z.string().max(2000).nullable().optional(),
  content: z.string().max(20000).nullable().optional(),
  mimeType: z.string().max(150).nullable().optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.validFrom && value.validUntil && value.validFrom >= value.validUntil) {
    ctx.addIssue({ code: "custom", path: ["validUntil"], message: "A validade final deve ser posterior à inicial" });
  }
  if (value.kind === "link" && !value.url) {
    ctx.addIssue({ code: "custom", path: ["url"], message: "O link é obrigatório" });
  }
  const uploadedPath = /^\/objects\/resource-library\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;
  if (value.objectPath && !uploadedPath.test(value.objectPath)) {
    ctx.addIssue({ code: "custom", path: ["objectPath"], message: "O ficheiro deve ser um upload deste negócio" });
  }
  if (value.kind === "image" && (!value.objectPath || !value.mimeType?.startsWith("image/"))) {
    ctx.addIssue({ code: "custom", path: ["objectPath"], message: "A imagem deve ser carregada neste negócio" });
  }
  if (value.kind === "video" && !value.url && (!value.objectPath || !value.mimeType?.startsWith("video/"))) {
    ctx.addIssue({ code: "custom", path: ["objectPath"], message: "Carrega um vídeo ou fornece um URL" });
  }
  if (value.kind === "video" && value.objectPath && !value.mimeType?.startsWith("video/")) {
    ctx.addIssue({ code: "custom", path: ["mimeType"], message: "O upload deve ser um vídeo" });
  }
  if (value.kind === "text" && !value.content?.trim()) {
    ctx.addIssue({ code: "custom", path: ["content"], message: "O texto é obrigatório" });
  }
  if (value.kind === "document" && !value.url && !value.content?.trim() && (!value.objectPath || value.mimeType !== "application/pdf")) {
    ctx.addIssue({ code: "custom", path: ["url"], message: "Carrega um PDF ou fornece um URL ou texto" });
  }
  if (value.kind === "document" && value.objectPath && value.mimeType !== "application/pdf") {
    ctx.addIssue({ code: "custom", path: ["mimeType"], message: "O upload do documento deve ser PDF" });
  }
});

export type ProfileChangeProposal = typeof profileChangeProposalTable.$inferSelect;
export type ResourceRequest = typeof resourceRequestsTable.$inferSelect;
export type ResourceLibraryItem = typeof resourceLibraryTable.$inferSelect;
export type ResourceDeliveryAudit = typeof resourceDeliveryAuditTable.$inferSelect;