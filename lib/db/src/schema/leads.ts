import { pgTable, text, timestamp, jsonb, integer, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Types ──────────────────────────────────────────────────────────────────

export type LeadState =
  | "novo"
  | "em_atendimento"
  | "qualificado"
  | "entregue"
  | "perdido";

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
}

/** A single message from the pre-call chat. */
export interface ChatMessage {
  role: "user" | "bot";
  text: string;
  ts: string; // ISO timestamp
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

  /** ISO timestamp of when the call ended. */
  callEndedAt: timestamp("call_ended_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
