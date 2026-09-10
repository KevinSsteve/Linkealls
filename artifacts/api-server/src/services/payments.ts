/**
 * Payments domain service — orders, subscriptions, wallet ledger, payouts.
 * Multicaixa Express (GPO) only.
 *
 * Invariants:
 *  - Settlement is idempotent: keyed on merchantTransactionId; the sale credit
 *    has a DB-level unique index on wallet_ledger.order_id.
 *  - Wallet balance is ALWAYS derived from SUM(wallet_ledger.amount).
 */
import { randomUUID } from "crypto";
import { and, asc, desc, eq, sql, gt } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderEventsTable,
  leadsTable,
  subscriptionsTable,
  walletLedgerTable,
  payoutsTable,
  businessProfilesTable,
  type Order,
  type Subscription,
  type Payout,
  type WalletLedgerEntry,
  type PayoutDestinationType,
  type OrderFulfillmentStatus,
  type OrderProofStatus,
} from "@workspace/db";
import {
  createGpoCharge,
  sendKwikToCustomer,
  getKwikPayoutStatus,
  payoutErrorMessage,
  IS_SIMULATION,
} from "./ekwanza.js";
import { sendPushToOwner } from "./notifications.js";
import { logger } from "../lib/logger.js";

export const PLAN_PRICE_AOA = 10_000;
export const PLAN_DAYS = 30;
export const PAYOUT_MIN_AOA = 1_000;
/** Pending orders older than this are treated as expired. */
const ORDER_EXPIRY_HOURS = 24;

type OrderEventListener = (businessId: number) => void;
const orderEventListeners = new Set<OrderEventListener>();

export function subscribeToOrderEvents(listener: OrderEventListener): () => void {
  orderEventListeners.add(listener);
  return () => orderEventListeners.delete(listener);
}

function notifyOrderEvent(businessId: number): void {
  for (const listener of orderEventListeners) {
    try { listener(businessId); } catch { /* isolated notification bus */ }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function newMerchantTransactionId(prefix: "LKO" | "LKS" | "LKC"): string {
  // AppyPay rule: 1-15 chars, alphanumeric only (no dashes).
  // prefix (3) + timestamp base36 (8-9) + random base36 (3) = 14-15 chars.
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomUUID().replace(/-/g, "").slice(0, 3).toUpperCase();
  return `${prefix}${ts}${rand}`.slice(0, 15);
}

/** Parse a free-form offering price ("244 329,00 Kz", "50.000 Kz") into AOA. Returns null when not sellable. */
export function parseOfferingPrice(price: string): number | null {
  const cleaned = price.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  // Angolan format: "." thousands, "," decimals
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export class PaymentError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

/**
 * Creates the pending order record and immediately fires the GPO charge in
 * the background. Returns the order right away so the HTTP response can be
 * sent before the ~30-60 s gateway round-trip completes, preventing mobile
 * browser timeouts. The caller should start polling /orders/:id/status.
 */
export async function createProductOrder(
  businessId: number,
  input: {
    offeringName: string;
    quantity: number;
    phone: string;
    buyerName?: string;
    leadId?: string;
    customerNotes?: string;
  },
): Promise<{ order: Order; simulated: boolean }> {
  const rows = await db
    .select({ offerings: businessProfilesTable.offerings, name: businessProfilesTable.name })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, businessId))
    .limit(1);
  const profile = rows[0];
  if (!profile) throw new PaymentError("Negócio não encontrado", 404);

  const offering = profile.offerings.find((o) => o.name === input.offeringName);
  if (!offering) throw new PaymentError("Produto não encontrado no catálogo", 404);
  const unitPrice = parseOfferingPrice(offering.price);
  if (unitPrice === null) throw new PaymentError("Este produto não tem preço fixo — fala com o negócio", 400);

  let resolvedLeadId = input.leadId;
  if (resolvedLeadId) {
    const lead = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, resolvedLeadId), eq(leadsTable.businessId, businessId)))
      .limit(1);
    if (!lead[0]) throw new PaymentError("Conversa não encontrada", 400);
  } else {
    const leadRows = await db
      .insert(leadsTable)
      .values({
        businessId,
        origin: { source: "checkout-direct" },
        qualificationData: {
          ...(input.buyerName ? { name: input.buyerName } : {}),
          phone: input.phone,
        },
        chatMessages: [],
      })
      .returning({ id: leadsTable.id });
    resolvedLeadId = leadRows[0]?.id;
    if (!resolvedLeadId) throw new PaymentError("Não foi possível iniciar a conversa da encomenda", 500);
  }

  const amount = Math.round(unitPrice * input.quantity * 100) / 100;
  const merchantTransactionId = newMerchantTransactionId("LKO");

  const inserted = await db
    .insert(ordersTable)
    .values({
      businessId,
      offeringName: offering.name,
      unitPrice: unitPrice.toFixed(2),
      quantity: input.quantity,
      amount: amount.toFixed(2),
      buyerPhone: input.phone,
      buyerName: input.buyerName ?? null,
      leadId: resolvedLeadId,
      customerNotes: input.customerNotes ?? null,
      merchantTransactionId,
    })
    .returning();
  const order = inserted[0]!;
  await db.insert(orderEventsTable).values({
    orderId: order.id,
    businessId,
    type: "criada",
    actor: "sistema",
    content: `Pedido criado para ${order.offeringName} x${order.quantity}.`,
  });
  notifyOrderEvent(businessId);

  // In simulation mode the charge is instant; in real mode it blocks until
  // the buyer approves (up to 60 s). We fire it in the background so the HTTP
  // response can go back immediately and the client can start polling.
  const fireCharge = async () => {
    try {
      const charge = await createGpoCharge({
        amount,
        merchantTransactionId,
        phoneNumber: input.phone,
        description: `${profile.name}: ${offering.name} x${input.quantity}`,
      });
      if (charge.outcome === "paid") {
        try {
          await settleGpoPayment(merchantTransactionId, 1);
        } catch (settleErr) {
          logger.error({ err: settleErr, merchantTransactionId }, "createProductOrder: paid but local settlement failed — awaiting webhook/reconciliation");
        }
      } else if (charge.outcome === "failed") {
        await db.update(ordersTable)
          .set({ status: "falhada", updatedAt: new Date() })
          .where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, "pendente")));
      }
    } catch (err) {
      await db.update(ordersTable)
        .set({ status: "falhada", updatedAt: new Date() })
        .where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, "pendente")));
      logger.error({ err, merchantTransactionId }, "createProductOrder: background charge failed");
    }
  };

  // setImmediate lets the current call stack (HTTP response) finish first.
  setImmediate(() => { void fireCharge(); });

  return { order, simulated: IS_SIMULATION };
}

/** Public polling endpoint helper — the order UUID is the capability. */
export async function getOrderPublicStatus(orderId: string): Promise<Order | null> {
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  const order = rows[0] ?? null;
  if (!order) return null;
  return maybeExpire(order);
}

export interface PublicOrderTracking {
  id: string;
  offeringName: string;
  quantity: number;
  amount: string;
  status: Order["status"];
  fulfillmentStatus: OrderFulfillmentStatus;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  events: Array<{
    type: string;
    actor: string;
    content: string;
    createdAt: Date;
  }>;
}

/** Returns only safe tracking fields for the customer who owns the lead session. */
export async function getOrderTracking(
  orderId: string,
  businessId: number,
  leadId: string,
): Promise<PublicOrderTracking | null> {
  const rows = await db
    .select()
    .from(ordersTable)
    .where(and(
      eq(ordersTable.id, orderId),
      eq(ordersTable.businessId, businessId),
      eq(ordersTable.leadId, leadId),
    ))
    .limit(1);
  const order = rows[0];
  if (!order) return null;

  const events = await db
    .select({
      type: orderEventsTable.type,
      actor: orderEventsTable.actor,
      content: orderEventsTable.content,
      createdAt: orderEventsTable.createdAt,
    })
    .from(orderEventsTable)
    .where(and(
      eq(orderEventsTable.orderId, order.id),
      eq(orderEventsTable.businessId, businessId),
    ))
    .orderBy(asc(orderEventsTable.createdAt));

  return {
    id: order.id,
    offeringName: order.offeringName,
    quantity: order.quantity,
    amount: order.amount,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    events,
  };
}

async function maybeExpire(order: Order): Promise<Order> {
  if (
    order.status === "pendente" &&
    Date.now() - new Date(order.createdAt).getTime() > ORDER_EXPIRY_HOURS * 3600_000
  ) {
    const updated = await db
      .update(ordersTable)
      .set({ status: "expirada", updatedAt: new Date() })
      .where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, "pendente")))
      .returning();
    return updated[0] ?? order;
  }
  return order;
}

export async function listOrders(businessId: number): Promise<Order[]> {
  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.businessId, businessId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(200);
  return Promise.all(rows.map(maybeExpire));
}

export interface OrderAnalytics {
  totalOrders: number;
  paidOrders: number;
  pendingPayments: number;
  grossSales: number;
  awaitingFollowUp: number;
  awaitingProof: number;
  averageFulfillmentHours: number | null;
  topProducts: Array<{ name: string; quantity: number; sales: number }>;
}

export async function getOrderAnalytics(businessId: number): Promise<OrderAnalytics> {
  const [summary, products] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE status = 'paga')::int AS paid_orders,
        COUNT(*) FILTER (WHERE status = 'pendente')::int AS pending_payments,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paga'), 0)::numeric AS gross_sales,
        COUNT(*) FILTER (WHERE status = 'paga' AND proof_status = 'pendente')::int AS awaiting_proof,
        COUNT(*) FILTER (WHERE status = 'paga' AND lead_id IS NOT NULL AND last_follow_up_at IS NULL)::int AS awaiting_follow_up,
        AVG(EXTRACT(EPOCH FROM (updated_at - paid_at)) / 3600)
          FILTER (WHERE status = 'paga' AND fulfillment_status = 'entregue' AND paid_at IS NOT NULL)::numeric
          AS average_fulfillment_hours
      FROM orders
      WHERE business_id = ${businessId}
    `),
    db.execute(sql`
      SELECT offering_name AS name,
             COALESCE(SUM(quantity) FILTER (WHERE status = 'paga'), 0)::int AS quantity,
             COALESCE(SUM(amount) FILTER (WHERE status = 'paga'), 0)::numeric AS sales
      FROM orders
      WHERE business_id = ${businessId}
      GROUP BY offering_name
      ORDER BY sales DESC, quantity DESC
      LIMIT 5
    `),
  ]);
  const row = summary.rows[0] as Record<string, unknown> | undefined;
  return {
    totalOrders: Number(row?.total_orders ?? 0),
    paidOrders: Number(row?.paid_orders ?? 0),
    pendingPayments: Number(row?.pending_payments ?? 0),
    grossSales: Number(row?.gross_sales ?? 0),
    awaitingFollowUp: Number(row?.awaiting_follow_up ?? 0),
    awaitingProof: Number(row?.awaiting_proof ?? 0),
    averageFulfillmentHours: row?.average_fulfillment_hours == null
      ? null
      : Number(row.average_fulfillment_hours),
    topProducts: (products.rows as Array<Record<string, unknown>>).map((item) => ({
      name: String(item.name),
      quantity: Number(item.quantity ?? 0),
      sales: Number(item.sales ?? 0),
    })),
  };
}

export async function updateOrderFulfillment(
  businessId: number,
  orderId: string,
  status: OrderFulfillmentStatus,
  note?: string,
): Promise<Order | null> {
  const current = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.businessId, businessId)))
    .limit(1);
  const order = current[0];
  if (!order) return null;
  if (order.fulfillmentStatus === status && !note) return order;
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(ordersTable)
      .set({ fulfillmentStatus: status, updatedAt: new Date() })
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.businessId, businessId)))
      .returning();
    await tx.insert(orderEventsTable).values({
      orderId,
      businessId,
      type: note ? "nota_adicionada" : "estado_alterado",
      actor: "dono",
      content: note ?? `Estado alterado para ${status}.`,
      meta: {
        fromStatus: order.fulfillmentStatus,
        toStatus: status,
        ...(note ? { note } : {}),
      },
    });
    return rows[0]!;
  });
  if (updated.leadId) {
    const statusMessages: Record<OrderFulfillmentStatus, string> = {
      novo: "A tua encomenda foi recebida e está na fila de preparação.",
      em_preparacao: "A tua encomenda entrou em preparação.",
      pronto: "A tua encomenda está pronta. O negócio vai combinar contigo a entrega ou recolha.",
      entregue: "A tua encomenda foi marcada como entregue. Obrigado pela confiança.",
      cancelado: "O negócio marcou a tua encomenda como cancelada. Fala connosco se precisares de esclarecimentos.",
    };
    const leadRows = await db.select({ chatMessages: leadsTable.chatMessages })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, updated.leadId), eq(leadsTable.businessId, businessId)))
      .limit(1);
    const lead = leadRows[0];
    if (lead) {
      await db.update(leadsTable).set({
        chatMessages: [
          ...(lead.chatMessages ?? []),
          { role: "bot", text: statusMessages[status], ts: new Date().toISOString() },
        ],
        updatedAt: new Date(),
      }).where(eq(leadsTable.id, updated.leadId));
    }
  }
  notifyOrderEvent(businessId);
  return updated;
}

export async function reviewOrderProof(
  businessId: number,
  orderId: string,
  status: Extract<OrderProofStatus, "aprovado" | "rejeitado">,
  note?: string,
): Promise<Order | null> {
  const updated = await db
    .update(ordersTable)
    .set({ proofStatus: status, proofReviewedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.businessId, businessId)))
    .returning();
  const order = updated[0];
  if (!order) return null;
  await db.insert(orderEventsTable).values({
    orderId,
    businessId,
    type: status === "aprovado" ? "prova_aprovada" : "prova_rejeitada",
    actor: "dono",
    content: note ?? (status === "aprovado" ? "Comprovativo aprovado." : "Comprovativo precisa de revisão."),
    meta: { proofStatus: status, ...(note ? { note } : {}) },
  });
  if (order.leadId) {
    const leadRows = await db.select({ chatMessages: leadsTable.chatMessages })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, order.leadId), eq(leadsTable.businessId, businessId)))
      .limit(1);
    const lead = leadRows[0];
    if (lead) {
      const message = status === "aprovado"
        ? "O negócio validou o teu comprovativo de pagamento. A encomenda continua a ser acompanhada por aqui."
        : "O negócio não conseguiu validar este comprovativo. Envia uma imagem ou PDF mais nítido para podermos continuar.";
      await db.update(leadsTable).set({
        chatMessages: [
          ...(lead.chatMessages ?? []),
          { role: "bot", text: message, ts: new Date().toISOString() },
        ],
        updatedAt: new Date(),
      }).where(eq(leadsTable.id, order.leadId));
    }
  }
  notifyOrderEvent(businessId);
  return order;
}

export async function listOrderEvents(businessId: number, orderId: string) {
  return db
    .select()
    .from(orderEventsTable)
    .where(and(eq(orderEventsTable.businessId, businessId), eq(orderEventsTable.orderId, orderId)))
    .orderBy(desc(orderEventsTable.createdAt))
    .limit(100);
}

export async function submitOrderProof(
  orderId: string,
  objectPath: string,
): Promise<Order | null> {
  const current = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  const order = current[0];
  if (!order || order.status !== "paga") return null;
  const updated = await db
    .update(ordersTable)
    .set({
      proofObjectPath: objectPath,
      proofStatus: "recebido",
      proofSubmittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ordersTable.id, orderId))
    .returning();
  const next = updated[0] ?? null;
  if (next) {
    await db.insert(orderEventsTable).values({
      orderId,
      businessId: order.businessId,
      type: "prova_submetida",
      actor: "cliente",
      content: "O cliente enviou um comprovativo de pagamento.",
      meta: { proofStatus: "recebido" },
    });
    if (next.leadId) {
      const leadRows = await db.select({ chatMessages: leadsTable.chatMessages })
        .from(leadsTable)
        .where(and(eq(leadsTable.id, next.leadId), eq(leadsTable.businessId, next.businessId)))
        .limit(1);
      const lead = leadRows[0];
      if (lead) {
        await db.update(leadsTable).set({
          chatMessages: [
            ...(lead.chatMessages ?? []),
            { role: "bot", text: "Recebi o teu comprovativo de pagamento. O negócio vai revê-lo e continuar o acompanhamento da encomenda por aqui.", ts: new Date().toISOString() },
          ],
          updatedAt: new Date(),
        }).where(eq(leadsTable.id, next.leadId));
      }
    }
    notifyOrderEvent(next.businessId);
  }
  return next;
}

// ─── Subscriptions (Linkealls plan) ───────────────────────────────────────────

export async function getActiveSubscription(businessId: number): Promise<Subscription | null> {
  const rows = await db
    .select()
    .from(subscriptionsTable)
    .where(and(
      eq(subscriptionsTable.businessId, businessId),
      eq(subscriptionsTable.status, "ativa"),
      gt(subscriptionsTable.expiresAt, new Date()),
    ))
    .orderBy(desc(subscriptionsTable.expiresAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSubscriptionInfo(businessId: number): Promise<{
  active: Subscription | null;
  pending: Subscription | null;
  history: Subscription[];
  planPrice: number;
}> {
  const history = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.businessId, businessId))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(50);
  const now = Date.now();
  const active = history.find((s) => s.status === "ativa" && s.expiresAt && new Date(s.expiresAt).getTime() > now) ?? null;
  const pending = history.find((s) => s.status === "pendente" && now - new Date(s.createdAt).getTime() < ORDER_EXPIRY_HOURS * 3600_000) ?? null;
  return { active, pending, history, planPrice: PLAN_PRICE_AOA };
}

export async function createPlanCharge(businessId: number, phone: string): Promise<{ subscription: Subscription; simulated: boolean }> {
  const merchantTransactionId = newMerchantTransactionId("LKS");
  const inserted = await db
    .insert(subscriptionsTable)
    .values({
      businessId,
      plan: "linkealls",
      amount: PLAN_PRICE_AOA.toFixed(2),
      merchantTransactionId,
    })
    .returning();
  const subscription = inserted[0]!;

  // Fire the GPO charge in the background — same async pattern as product orders.
  const fireCharge = async () => {
    try {
      const charge = await createGpoCharge({
        amount: PLAN_PRICE_AOA,
        merchantTransactionId,
        phoneNumber: phone,
        description: `Plano_Linkealls_${PLAN_DAYS}_dias`,
      });
      if (charge.outcome === "paid") {
        try {
          await settleGpoPayment(merchantTransactionId, 1);
        } catch (settleErr) {
          logger.error({ err: settleErr, merchantTransactionId }, "createPlanCharge: paid but local settlement failed — awaiting webhook/reconciliation");
        }
      } else if (charge.outcome === "failed") {
        await db.update(subscriptionsTable)
          .set({ status: "falhada", updatedAt: new Date() })
          .where(and(eq(subscriptionsTable.id, subscription.id), eq(subscriptionsTable.status, "pendente")));
      }
    } catch (err) {
      await db.update(subscriptionsTable)
        .set({ status: "falhada", updatedAt: new Date() })
        .where(and(eq(subscriptionsTable.id, subscription.id), eq(subscriptionsTable.status, "pendente")));
      logger.error({ err, merchantTransactionId }, "createPlanCharge: background charge failed");
    }
  };

  setImmediate(() => { void fireCharge(); });

  return { subscription, simulated: false };
}

export async function getSubscriptionPublicStatus(id: string, businessId: number): Promise<Subscription | null> {
  const rows = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.id, id), eq(subscriptionsTable.businessId, businessId)))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Settlement (webhook) ─────────────────────────────────────────────────────

/**
 * Idempotently settle a GPO payment notification.
 * operationStatus: 1 = paid; 3/4/5 = cancelled/failed/error.
 * Returns true when the merchantTransactionId was recognised.
 */
export async function settleGpoPayment(
  merchantTransactionId: string,
  operationStatus: number,
  ekwanzaTransactionId?: string,
): Promise<boolean> {
  // Product order?
  const orderRows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.merchantTransactionId, merchantTransactionId))
    .limit(1);
  const order = orderRows[0];
  if (order) {
    if (operationStatus === 1) {
      // Status transition + wallet credit are one atomic transaction. When the
      // order is already "paga" (webhook retry) the credit is re-attempted —
      // the unique index on wallet_ledger.order_id makes it a no-op unless the
      // credit was somehow lost, in which case the retry repairs it.
      const { firstSettle } = await db.transaction(async (tx) => {
        const updated = await tx
          .update(ordersTable)
          .set({
            status: "paga",
            paidAt: new Date(),
            lastFollowUpAt: order.leadId ? new Date() : null,
            ekwanzaTransactionId: ekwanzaTransactionId ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, "pendente")))
          .returning();
        if (updated.length > 0 || order.status === "paga") {
          await tx
            .insert(walletLedgerTable)
            .values({
              businessId: order.businessId,
              type: "venda",
              amount: order.amount,
              orderId: order.id,
              description: `Venda: ${order.offeringName} x${order.quantity}`,
            })
            .onConflictDoNothing();
          if (updated.length > 0) {
           await tx.insert(orderEventsTable).values({
             orderId: order.id,
             businessId: order.businessId,
             type: "pagamento_confirmado",
             actor: "sistema",
             content: `Pagamento confirmado: ${order.offeringName} x${order.quantity}.`,
           });
          }
        }
        return { firstSettle: updated.length > 0 };
      });
      if (firstSettle) {
        if (order.leadId) {
          const leadRows = await db
            .select({ chatMessages: leadsTable.chatMessages, qualificationData: leadsTable.qualificationData })
            .from(leadsTable)
            .where(and(eq(leadsTable.id, order.leadId), eq(leadsTable.businessId, order.businessId)))
            .limit(1);
          const lead = leadRows[0];
          if (lead) {
             const followUp = [
               `Pagamento confirmado para ${order.offeringName} (${Number(order.amount).toLocaleString("pt-AO")} Kz).`,
               "A tua encomenda ficou registada e vamos fazer o acompanhamento por aqui.",
               "Envia nesta conversa a localização, endereço, pessoa que vai receber e horário, se ainda faltar algum dado.",
             ].join(" ");
            await db.update(leadsTable)
              .set({
                chatMessages: [
                  ...(lead.chatMessages ?? []),
                  { role: "bot", text: followUp, ts: new Date().toISOString() },
                ],
                qualificationData: {
                  ...(lead.qualificationData ?? {}),
                  ...(order.buyerName ? { name: order.buyerName } : {}),
                  phone: order.buyerPhone,
                  extras: {
                    ...(lead.qualificationData?.extras ?? {}),
                    orderId: order.id,
                    paymentPhone: order.buyerPhone,
                    paymentConfirmed: "sim",
                  },
                },
                updatedAt: new Date(),
              })
              .where(and(eq(leadsTable.id, order.leadId), eq(leadsTable.businessId, order.businessId)));
          }
        }
        void sendPushToOwner({
          title: "Novo pedido pago",
          body: `${order.offeringName} x${order.quantity} — ${Number(order.amount).toLocaleString("pt-AO")} Kz. O cliente já recebeu o próximo passo.`,
          tag: `order-${order.id}`,
          url: await ownerUrl(order.businessId, "/dono/comercio"),
        }, order.businessId).catch(() => {});
        notifyOrderEvent(order.businessId);
      }
    } else {
      await db
        .update(ordersTable)
        .set({ status: "falhada", updatedAt: new Date() })
        .where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, "pendente")));
    }
    return true;
  }

  // Plan subscription?
  const subRows = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.merchantTransactionId, merchantTransactionId))
    .limit(1);
  const sub = subRows[0];
  if (sub) {
    if (operationStatus === 1) {
      // Serialize per business so concurrent renewals extend sequentially
      // instead of both starting from the same current expiry.
      const activated = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(917002, ${sub.businessId})`);
        const currentRows = await tx
          .select()
          .from(subscriptionsTable)
          .where(and(
            eq(subscriptionsTable.businessId, sub.businessId),
            eq(subscriptionsTable.status, "ativa"),
            gt(subscriptionsTable.expiresAt, new Date()),
          ))
          .orderBy(desc(subscriptionsTable.expiresAt))
          .limit(1);
        const current = currentRows[0];
        const startsAt = current?.expiresAt && new Date(current.expiresAt) > new Date()
          ? new Date(current.expiresAt)
          : new Date();
        const expiresAt = new Date(startsAt.getTime() + PLAN_DAYS * 24 * 3600_000);
        const updated = await tx
          .update(subscriptionsTable)
          .set({
            status: "ativa",
            paidAt: new Date(),
            startsAt,
            expiresAt,
            ekwanzaTransactionId: ekwanzaTransactionId ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(subscriptionsTable.id, sub.id), eq(subscriptionsTable.status, "pendente")))
          .returning();
        return updated[0] ?? null;
      });
      if (activated?.expiresAt) {
        const expiresAt = new Date(activated.expiresAt);
        void sendPushToOwner({
          title: "Plano Linkealls ativo!",
          body: `Subscrição ativa até ${expiresAt.toLocaleDateString("pt-AO")}.`,
          tag: `sub-${sub.id}`,
          url: await ownerUrl(sub.businessId, "/dono/plano"),
        }, sub.businessId).catch(() => {});
      }
    } else {
      await db
        .update(subscriptionsTable)
        .set({ status: "falhada", updatedAt: new Date() })
        .where(and(eq(subscriptionsTable.id, sub.id), eq(subscriptionsTable.status, "pendente")));
    }
    return true;
  }

  // Campaign budget charge? (paid directly via Multicaixa, not via wallet)
  const { settleCampaignGpoPayment } = await import("./campaignAds.js");
  if (await settleCampaignGpoPayment(merchantTransactionId, operationStatus, ekwanzaTransactionId)) {
    return true;
  }

  logger.warn({ merchantTransactionId }, "settleGpoPayment: unknown merchantTransactionId");
  return false;
}

async function ownerUrl(businessId: number, sub: string): Promise<string> {
  const rows = await db
    .select({ slug: businessProfilesTable.slug })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, businessId))
    .limit(1);
  const slug = rows[0]?.slug;
  return slug ? `/e/${slug}${sub}` : "/";
}

// ─── Wallet & payouts ─────────────────────────────────────────────────────────

export async function getWallet(businessId: number): Promise<{
  balance: number;
  entries: WalletLedgerEntry[];
}> {
  const [balRows, entries] = await Promise.all([
    db
      .select({ balance: sql<string>`COALESCE(SUM(${walletLedgerTable.amount}), 0)` })
      .from(walletLedgerTable)
      .where(eq(walletLedgerTable.businessId, businessId)),
    db
      .select()
      .from(walletLedgerTable)
      .where(eq(walletLedgerTable.businessId, businessId))
      .orderBy(desc(walletLedgerTable.createdAt))
      .limit(100),
  ]);
  return { balance: Number(balRows[0]?.balance ?? 0), entries };
}

export async function listPayouts(businessId: number): Promise<Payout[]> {
  return db
    .select()
    .from(payoutsTable)
    .where(eq(payoutsTable.businessId, businessId))
    .orderBy(desc(payoutsTable.createdAt))
    .limit(100);
}

export async function requestPayout(
  businessId: number,
  input: { amount: number; destinationType: PayoutDestinationType; destination: string },
): Promise<Payout> {
  const amount = Math.round(input.amount * 100) / 100;
  const iban = input.destination.trim().replace(/[\s-]/g, "").toUpperCase();
  if (amount < PAYOUT_MIN_AOA) {
    throw new PaymentError(`O levantamento mínimo é ${PAYOUT_MIN_AOA.toLocaleString("pt-AO")} Kz`);
  }
  if (input.destinationType !== "iban") {
    throw new PaymentError("Os novos saques são feitos apenas para IBAN KWiK");
  }
  if (!/^AO06\d{21}$/.test(iban)) {
    throw new PaymentError("IBAN inválido (formato AO06 + 21 dígitos)");
  }

  const operationCode = newMerchantTransactionId("LKO").replace("LKO", "LKW");

  // Debit atomically only if the derived balance covers the amount.
  const payout = await db.transaction(async (tx) => {
    // Serialize concurrent withdrawals per business (aggregates can't be FOR UPDATE).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(917001, ${businessId})`);
    const balRows = await tx
      .select({ balance: sql<string>`COALESCE(SUM(${walletLedgerTable.amount}), 0)` })
      .from(walletLedgerTable)
      .where(eq(walletLedgerTable.businessId, businessId));
    const balance = Number(balRows[0]?.balance ?? 0);
    if (balance < amount) throw new PaymentError("Saldo insuficiente para este levantamento");

    const inserted = await tx
      .insert(payoutsTable)
      .values({
        businessId,
        amount: amount.toFixed(2),
        destinationType: input.destinationType,
        destination: iban,
        operationCode,
      })
      .returning();
    const p = inserted[0]!;
    await tx.insert(walletLedgerTable).values({
      businessId,
      type: "saque",
      amount: (-amount).toFixed(2),
      payoutId: p.id,
      description: `Levantamento para ${input.destinationType === "iban" ? "IBAN" : "telemóvel"} ${iban}`,
    });
    return p;
  });

  // Call the gateway outside the transaction.
  try {
    const result = await sendKwikToCustomer({
      iban,
      amount,
      operationCode,
    });

    if (result.ok) {
      const status = result.pending ? "pendente" : "processado";
      const updated = await db
        .update(payoutsTable)
        .set({
          status,
          error: null,
          ekzOperationCode: result.ekzOperationCode ?? null,
          ekzTransactionCode: result.ekzTransactionCode ?? null,
          updatedAt: new Date(),
        })
        .where(eq(payoutsTable.id, payout.id))
        .returning();
      return updated[0]!;
    }
    // Authoritative rejection from the gateway → safe to refund.
    return await failPayout(payout.id, businessId, amount, payoutErrorMessage(result.errorStatus));
  } catch (err) {
    if (err instanceof PaymentError) throw err;
    // UNKNOWN outcome (timeout / network error): the gateway may still have
    // transferred the funds. Never refund here — keep the payout "pendente"
    // (debit stays) and let reconcilePayout decide against the gateway status.
    logger.error({ err, payoutId: payout.id }, "requestPayout: gateway call outcome unknown — kept pending");
    const updated = await db
      .update(payoutsTable)
      .set({
        error: "Sem confirmação do e-kwanza — usa 'Verificar estado' para reconciliar",
        updatedAt: new Date(),
      })
      .where(eq(payoutsTable.id, payout.id))
      .returning();
    return updated[0] ?? payout;
  }
}

/** Mark a payout failed and refund the wallet with a compensating credit. */
async function failPayout(payoutId: string, businessId: number, amount: number, error: string): Promise<Payout> {
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(payoutsTable)
      .set({ status: "falhado", error, updatedAt: new Date() })
      .where(and(eq(payoutsTable.id, payoutId), eq(payoutsTable.status, "pendente")))
      .returning();
    if (rows.length > 0) {
      await tx.insert(walletLedgerTable).values({
        businessId,
        type: "estorno_saque",
        amount: amount.toFixed(2),
        payoutId,
        description: `Estorno de levantamento falhado: ${error}`,
      });
    }
    return rows[0];
  });
  if (!updated) {
    const rows = await db.select().from(payoutsTable).where(eq(payoutsTable.id, payoutId)).limit(1);
    return rows[0]!;
  }
  return updated;
}

export type PayoutReconciliationResult = "processed" | "reverted" | "pending";

/** Reconcile a pending KWiK payout against the gateway status endpoint. */
export async function reconcilePayout(
  payoutId: string,
  businessId: number,
): Promise<{ payout: Payout; reconciliation: PayoutReconciliationResult } | null> {
  const rows = await db
    .select()
    .from(payoutsTable)
    .where(and(eq(payoutsTable.id, payoutId), eq(payoutsTable.businessId, businessId)))
    .limit(1);
  const payout = rows[0];
  if (!payout) return null;
  if (payout.status !== "pendente") {
    return {
      payout,
      reconciliation: payout.status === "processado" ? "processed" : "reverted",
    };
  }

  const state = await getKwikPayoutStatus(payout.operationCode);
  if (state === "processed") {
    const updated = await db
      .update(payoutsTable)
        .set({ status: "processado", error: null, updatedAt: new Date() })
      .where(and(eq(payoutsTable.id, payout.id), eq(payoutsTable.status, "pendente")))
      .returning();
    return { payout: updated[0] ?? payout, reconciliation: "processed" };
  }
  if (state === "cancelled" || state === "voided") {
    return {
      payout: await failPayout(payout.id, businessId, Number(payout.amount), "Levantamento revertido pelo e-kwanza"),
      reconciliation: "reverted",
    };
  }
  return { payout, reconciliation: "pending" };
}

export { IS_SIMULATION };
