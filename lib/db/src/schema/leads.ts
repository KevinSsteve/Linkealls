import { pgTable, text, timestamp, jsonb, integer, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Types ──────────────────────────────────────────────────────────────────

export type LeadState =
  | "novo"
  | "em_atendimento"
  | "qualificado"
  | "entregue"
  | "perdido";

export type TrafficWelcomeStatus = "pending" | "processing" | "complete" | "failed";
export type LeadContactConsentStatus = "pending" | "consented" | "declined";

export const LEAD_STATES: LeadState[] = [
  "novo",
  "em_atendimento",
  "qualificado",
  "entregue",
  "perdido",
];

/** UTM parameters captured from the captação link. */
export interface LeadOrigin {
  source?: string;   // utm_source
  medium?: string;   // utm_medium
  campaign?: string; // utm_campaign
  content?: string;  // utm_content
  term?: string;     // utm_term
  /** Raw landing URL */
  url?: string;
  /** Trusted Linkealls traffic creative attribution, resolved server-side. */
  trafficCreative?: {
    id: string;
    slug: string;
    description: string;
    mediaType: "image" | "video";
    mediaMimeType?: string;
    mediaUrl?: string;
    preparation?: import("./trafficCreatives").TrafficCreativePreparation;
  };
  /** Trusted legacy campaign attribution, resolved server-side from the tenant's UTM slug. */
  trustedCampaign?: {
    id: string;
    name: string;
    utmSlug: string;
  };
}

/** A single message from the pre-call chat. */
export interface ChatMessage {
  /** user = visitor, bot = AI, agent = business owner replying manually */
  role: "user" | "bot" | "agent";
  text: string;
  ts: string; // ISO timestamp
  /** Runtime strategy provenance for assistant turns. */
  strategyVersionId?: string;
  /** Server-authored proof that this bot turn explicitly requested WhatsApp consent. */
  contactRequested?: boolean;
  /** Visitor-generated idempotency key shared by the user turn and its bot reply. */
  requestId?: string;
  /** Stored with the bot turn so an idempotent replay returns the original safe result. */
  replay?: {
    products: Array<{ name: string; price: string; description: string; imageUrl?: string }>;
    nextAction: { type: string; label?: string; reason: string };
    contactCaptured?: boolean;
    resources?: Array<{ id: string; title: string; kind: string; description: string; url: string }>;
  };
  resources?: Array<{ id: string; title: string; kind: string; description: string; url: string }>;
}

/**
 * Structured qualification data extracted by Gemini after the call.
 * All fields optional — the model may not capture everything.
 */
export interface QualificationData {
  name?: string;
  phone?: string;
  email?: string;
  interest?: string;
  budget?: string;
  timeline?: string;
  location?: string;
  extras?: Record<string, string>;
}

export type CommercialStage = "welcome" | "understand" | "recommend" | "clarify" | "next_step" | "handoff" | "follow_up" | "disinterested";
export type CommercialProvenance = "declared" | "inferred" | "confirmed" | "owner";
export interface CommercialObservation {
  value: string;
  provenance: CommercialProvenance;
  updatedAt: string;
}

export interface CommercialPendingProposal {
  type: "resource_request";
  kind: "text" | "link" | "image" | "document" | "video";
  subject: string;
  request: string;
  purpose: string;
  createdAt: string;
}

export interface LeadCommercialMemory {
  revision: number;
  currentIntent?: string;
  goal?: CommercialObservation;
  interests: CommercialObservation[];
  criteria: CommercialObservation[];
  constraints: CommercialObservation[];
  answeredQuestions: string[];
  objections: Array<{ text: string; status: "pending" | "resolved"; provenance: CommercialProvenance; updatedAt: string }>;
  stage: CommercialStage;
  pendingAction?: string;
  pendingProposal?: CommercialPendingProposal;
  factualSummary?: string;
  recommendationReason?: string;
  missingData: string[];
  escalationReason?: string;
  humanControl: "ai" | "owner";
  strategyVersionId?: string;
  /** Fields intentionally corrected by the owner and protected from inference. */
  ownerCorrectedFields?: string[];
  /** Visitor declarations that conflict with an owner correction, kept for review. */
  visitorChangeRequests?: Array<{ field: string; value: string; updatedAt: string }>;
}

// ─── Table ──────────────────────────────────────────────────────────────────

export const leadsTable = pgTable("leads", {
  /** UUID primary key — doubles as the public session token. */
  id: uuid("id").primaryKey().defaultRandom(),

  /** FK to business_profiles.id — which business this lead belongs to. */
  businessId: integer("business_id"),

  /** Current state in the qualification pipeline. */
  state: text("state").$type<LeadState>().notNull().default("novo"),

  /** UTM / origin data captured on landing. */
  origin: jsonb("origin").$type<LeadOrigin>().notNull().default({}),

  /** Chat messages exchanged before the call. */
  chatMessages: jsonb("chat_messages").$type<ChatMessage[]>().notNull().default([]),

  /** Full call transcript assembled from Gemini Live transcription. */
  callTranscript: text("call_transcript"),

  /** Structured qualification data extracted post-call by Gemini Flash. */
  qualificationData: jsonb("qualification_data").$type<QualificationData>().notNull().default({}),

  /** AI-generated summary of the interaction (1-3 paragraphs). */
  aiSummary: text("ai_summary"),

  /** Score 0–100; ≥ 60 triggers "qualificado" state. */
  score: integer("score"),

  /** Pre-built WhatsApp message the owner can send with one tap. */
  whatsappMessage: text("whatsapp_message"),

  /** Contact supplied explicitly for business follow-up; never sourced from checkout. */
  contactPhone: text("contact_phone"),
  contactPurpose: text("contact_purpose"),
  contactConsentStatus: text("contact_consent_status")
    .$type<LeadContactConsentStatus>()
    .notNull()
    .default("pending"),
  contactConsentedAt: timestamp("contact_consented_at"),
  contactCapturedAt: timestamp("contact_captured_at"),
  whatsappClickedAt: timestamp("whatsapp_clicked_at"),
  whatsappClickCount: integer("whatsapp_click_count").notNull().default(0),

  /** Hash of an opaque HttpOnly recovery token; the raw token is never stored. */
  visitorRecoveryHash: text("visitor_recovery_hash"),
  /** Non-secret family identifier carried only inside a signed recovery token. */
  visitorRecoveryFamilyId: uuid("visitor_recovery_family_id"),
  visitorRecoveryExpiresAt: timestamp("visitor_recovery_expires_at"),
  visitorRecoveryRevokedAt: timestamp("visitor_recovery_revoked_at"),

  /** Idempotent bootstrap state for paid-traffic conversations. */
  trafficClickKey: uuid("traffic_click_key"),
  trafficWelcomeStatus: text("traffic_welcome_status").$type<TrafficWelcomeStatus>(),
  trafficWelcomeClaimedAt: timestamp("traffic_welcome_claimed_at"),
  trafficWelcomeClaimToken: uuid("traffic_welcome_claim_token"),

  /** Durable, tenant-private commercial state; separate from pipeline/payment. */
  commercialMemory: jsonb("commercial_memory").$type<LeadCommercialMemory>().notNull().default({
    revision: 0, interests: [], criteria: [], constraints: [], answeredQuestions: [],
    objections: [], stage: "welcome", missingData: [], humanControl: "ai",
  }),

  /** ISO timestamp of when the call ended. */
  callEndedAt: timestamp("call_ended_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("leads_visitor_recovery_idx").on(table.businessId, table.visitorRecoveryHash),
  index("leads_visitor_recovery_family_idx").on(table.businessId, table.visitorRecoveryFamilyId),
  uniqueIndex("leads_traffic_click_unique").on(table.businessId, table.trafficClickKey),
]);

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const leadOriginSchema = z.object({
  source:   z.string().max(200).optional(),
  medium:   z.string().max(200).optional(),
  campaign: z.string().max(200).optional(),
  content:  z.string().max(200).optional(),
  term:     z.string().max(200).optional(),
  url:      z.string().max(2000).optional(),
  /** Client may submit only the opaque slug; the server resolves the rest. */
  trafficCreativeSlug: z.string().regex(/^[a-z0-9-]{3,80}$/).optional(),
});

export const chatMessageSchema = z.object({
  role: z.enum(["user", "bot"]),
  text: z.string().max(4000),
  ts:   z.string(),
});

export const updateLeadStateSchema = z.object({
  state: z.enum(["novo", "em_atendimento", "qualificado", "entregue", "perdido"]),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
