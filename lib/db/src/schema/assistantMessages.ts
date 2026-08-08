import { pgTable, text, timestamp, jsonb, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type AssistantRole = "user" | "assistant" | "proactive";

/** Extra metadata stored with a message (e.g. action payload, lead id). */
export interface AssistantMessageMeta {
  /** Action the assistant proposed that needs owner confirmation. */
  pendingAction?: {
    type: "update_lead_state";
    leadId: string;
    newState: string;
    description: string;
  };
  /** Draft message ready to copy/send. */
  draftMessage?: string;
  /** Proactive event type (for system-generated messages). */
  proactiveType?: "lead_qualified" | "stale_leads" | "daily_summary";
  /** Associated lead id (for proactive alerts). */
  leadId?: string;
}

export const assistantMessagesTable = pgTable("assistant_messages", {
  id:        uuid("id").primaryKey().defaultRandom(),
  role:      text("role").$type<AssistantRole>().notNull(),
  content:   text("content").notNull(),
  meta:      jsonb("meta").$type<AssistantMessageMeta>().notNull().default({}),
  businessId: integer("business_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAssistantMessageSchema = createInsertSchema(
  assistantMessagesTable,
).omit({ createdAt: true });

export const sendAssistantMessageSchema = z.object({
  message: z.string().min(1).max(4000),
});

export const confirmActionSchema = z.object({
  messageId: z.string().uuid(),
  confirmed: z.boolean(),
});

export type InsertAssistantMessage = z.infer<typeof insertAssistantMessageSchema>;
export type AssistantMessage = typeof assistantMessagesTable.$inferSelect;
