import { pgTable, uuid, integer, text, timestamp, numeric, uniqueIndex, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

/**
 * Payments domain — Multicaixa Express (e-kwanza / AppyPay GPO) only.
 *
 * Money rules:
 *  - All amounts are stored as numeric(14,2) in AOA (Kwanza).
 *  - The wallet balance is ALWAYS derived from wallet_ledger — never a mutable column.
 *  - Every gateway operation carries a unique merchantTransactionId / operationCode
 *    so settlement and payouts are idempotent.
 */

// ─── Orders (product purchases from the public catalog) ──────────────────────

export type OrderStatus = "pendente" | "paga" | "expirada" | "falhada";
export type OrderFulfillmentStatus = "novo" | "em_preparacao" | "pronto" | "entregue" | "cancelado";
export type OrderProofStatus = "nao_pedido" | "pendente" | "recebido" | "aprovado" | "rejeitado";

export const ordersTable = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: integer("business_id").notNull(),
  /** Snapshot of the purchased offering at checkout time. */
  offeringName: text("offering_name").notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  /** Buyer's phone (Multicaixa Express push target), e.g. 9XXXXXXXX. */
  buyerPhone: text("buyer_phone").notNull(),
  buyerName: text("buyer_name"),
  /** Optional visitor conversation that originated this order. */
  leadId: uuid("lead_id"),
  /** Operational state after payment; intentionally separate from gateway status. */
  fulfillmentStatus: text("fulfillment_status")
    .$type<OrderFulfillmentStatus>()
    .notNull()
    .default("novo"),
  /** Optional instructions or delivery details collected in chat. */
  customerNotes: text("customer_notes"),
  /** Payment proof is private and stored in App Storage. */
  proofObjectPath: text("proof_object_path"),
  proofStatus: text("proof_status")
    .$type<OrderProofStatus>()
    .notNull()
    .default("nao_pedido"),
  proofSubmittedAt: timestamp("proof_submitted_at"),
  proofReviewedAt: timestamp("proof_reviewed_at"),
  lastFollowUpAt: timestamp("last_follow_up_at"),
  /** Unique id sent to the gateway — settlement key. */
  merchantTransactionId: text("merchant_transaction_id").notNull().unique(),
  /** e-kwanza transaction id received in the callback. */
  ekwanzaTransactionId: text("ekwanza_transaction_id"),
  status: text("status").$type<OrderStatus>().notNull().default("pendente"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Subscriptions (Linkealls plan — 10.000 Kz / 30 days) ─────────────────────

export type SubscriptionStatus = "pendente" | "ativa" | "expirada" | "falhada";

export const subscriptionsTable = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: integer("business_id").notNull(),
  plan: text("plan").notNull().default("linkealls"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  merchantTransactionId: text("merchant_transaction_id").notNull().unique(),
  ekwanzaTransactionId: text("ekwanza_transaction_id"),
  status: text("status").$type<SubscriptionStatus>().notNull().default("pendente"),
  /** Period covered by this payment (set on settlement). */
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Wallet ledger (immutable; balance = SUM(amount)) ─────────────────────────

export type LedgerEntryType = "venda" | "saque" | "estorno_saque" | "ajuste" | "campanha";

export const walletLedgerTable = pgTable(
  "wallet_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: integer("business_id").notNull(),
    type: text("type").$type<LedgerEntryType>().notNull(),
    /** Positive = credit, negative = debit. AOA. */
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    orderId: uuid("order_id"),
    payoutId: uuid("payout_id"),
    /** Set when the entry is a campaign budget debit (type "campanha"). */
    campaignId: uuid("campaign_id"),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // One sale credit per order — settlement idempotency at DB level.
    uniqueIndex("wallet_ledger_order_credit_uq")
      .on(t.orderId)
      .where(sql`order_id IS NOT NULL`),
    // One budget debit per campaign — campaign payment idempotency at DB level.
    uniqueIndex("wallet_ledger_campaign_debit_uq")
      .on(t.campaignId)
      .where(sql`campaign_id IS NOT NULL`),
  ],
);

// ─── Payouts (owner withdrawals via e-kwanza SendToCustomer / KWiK) ───────────

export type PayoutStatus = "pendente" | "processado" | "falhado" | "revertido";
export type PayoutDestinationType = "telemovel" | "iban";

export const payoutsTable = pgTable("payouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: integer("business_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  destinationType: text("destination_type").$type<PayoutDestinationType>().notNull(),
  destination: text("destination").notNull(),
  /** Unique operation code sent to e-kwanza — payout idempotency key. */
  operationCode: text("operation_code").notNull().unique(),
  ekzOperationCode: text("ekz_operation_code"),
  ekzTransactionCode: text("ekz_transaction_code"),
  status: text("status").$type<PayoutStatus>().notNull().default("pendente"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Zod schemas ──────────────────────────────────────────────────────────────

/** Angolan mobile number: 9 digits starting with 9 (optionally +244 prefix). */
export const aoPhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+?244/, ""))
  .pipe(z.string().regex(/^9\d{8}$/, "Número de telemóvel inválido (9XXXXXXXX)"));

/** Angolan KWiK IBAN: fixed AO06 prefix plus exactly 21 digits. */
export const kwikIbanSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").toUpperCase())
  .pipe(z.string().regex(/^AO06\d{21}$/, "IBAN inválido (AO06 + 21 dígitos)"));

export const createOrderSchema = z.object({
  offeringName: z.string().min(1).max(200),
  quantity: z.number().int().min(1).max(99),
  phone: aoPhoneSchema,
  buyerName: z.string().max(200).optional(),
  leadId: z.string().uuid().optional(),
  customerNotes: z.string().max(2000).optional(),
});

export const createPayoutSchema = z.object({
  amount: z.number().positive().max(100_000_000),
  // New payouts use KWiK/IBAN only. The "telemovel" value remains in the
  // database type so historical payouts can still be displayed.
  destinationType: z.literal("iban"),
  destination: kwikIbanSchema,
});

export type Order = typeof ordersTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type WalletLedgerEntry = typeof walletLedgerTable.$inferSelect;
export type Payout = typeof payoutsTable.$inferSelect;

// ─── Order timeline (operational audit, not payment ledger) ───────────────────

export type OrderEventType =
  | "criada"
  | "pagamento_confirmado"
  | "estado_alterado"
  | "prova_pedida"
  | "prova_submetida"
  | "prova_aprovada"
  | "prova_rejeitada"
  | "followup_enviado"
  | "nota_adicionada";

export type OrderEventActor = "sistema" | "cliente" | "ia" | "dono";

export interface OrderEventMeta {
  fromStatus?: string;
  toStatus?: string;
  note?: string;
  proofStatus?: OrderProofStatus;
  [key: string]: string | number | boolean | undefined;
}

export const orderEventsTable = pgTable("order_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull(),
  businessId: integer("business_id").notNull(),
  type: text("type").$type<OrderEventType>().notNull(),
  actor: text("actor").$type<OrderEventActor>().notNull(),
  content: text("content").notNull().default(""),
  meta: jsonb("meta").$type<OrderEventMeta>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("order_events_order_created_idx").on(table.orderId, table.createdAt),
  index("order_events_business_created_idx").on(table.businessId, table.createdAt),
]);

export type OrderEvent = typeof orderEventsTable.$inferSelect;
