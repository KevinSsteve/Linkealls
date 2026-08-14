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
import { and, desc, eq, sql, gt } from "drizzle-orm";
import {
  db,
  ordersTable,
  subscriptionsTable,
  walletLedgerTable,
  payoutsTable,
  businessProfilesTable,
  type Order,
  type Subscription,
  type Payout,
  type WalletLedgerEntry,
  type PayoutDestinationType,
} from "@workspace/db";
import {
  createGpoCharge,
  sendToCustomer,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newMerchantTransactionId(prefix: "LKO" | "LKS"): string {
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

export async function createProductOrder(
  businessId: number,
  input: { offeringName: string; quantity: number; phone: string; buyerName?: string },
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
      merchantTransactionId,
    })
    .returning();
  const order = inserted[0]!;

  try {
    const charge = await createGpoCharge({
      amount,
      merchantTransactionId,
      phoneNumber: input.phone,
      description: `${profile.name}: ${offering.name} x${input.quantity}`,
    });
    // Real mode: the gateway call blocks until the buyer approves/declines,
    // so the outcome is already final — settle or fail right away.
    if (charge.outcome === "paid") {
      // The buyer HAS paid. If local settlement fails, never mark the order
      // failed — leave it pendente so the webhook (or reconciliation) settles it.
      try {
        await settleGpoPayment(merchantTransactionId, 1);
      } catch (settleErr) {
        logger.error({ err: settleErr, merchantTransactionId }, "createProductOrder: paid but local settlement failed — awaiting webhook/reconciliation");
      }
    } else if (charge.outcome === "failed") {
      await db.update(ordersTable)
        .set({ status: "falhada", updatedAt: new Date() })
        .where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, "pendente")));
      throw new PaymentError(
        charge.failureMessage ?? "O pagamento não foi aprovado. Tenta novamente.",
        402,
      );
    }
    const fresh = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id)).limit(1);
    return { order: fresh[0] ?? order, simulated: charge.simulated };
  } catch (err) {
    if (err instanceof PaymentError) throw err;
    await db.update(ordersTable)
      .set({ status: "falhada", updatedAt: new Date() })
      .where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, "pendente")));
    logger.error({ err, merchantTransactionId }, "createProductOrder: charge failed");
    throw new PaymentError("Não foi possível iniciar o pagamento Multicaixa Express", 502);
  }
}

/** Public polling endpoint helper — the order UUID is the capability. */
export async function getOrderPublicStatus(orderId: string): Promise<Order | null> {
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  const order = rows[0] ?? null;
  if (!order) return null;
  return maybeExpire(order);
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
  try {
    const charge = await createGpoCharge({
      amount: PLAN_PRICE_AOA,
      merchantTransactionId,
      phoneNumber: phone,
      description: `Plano Linkealls — ${PLAN_DAYS} dias`,
    });
    if (charge.outcome === "paid") {
      // The buyer HAS paid. If local settlement fails, never mark the
      // subscription failed — leave it pendente for the webhook/reconciliation.
      try {
        await settleGpoPayment(merchantTransactionId, 1);
      } catch (settleErr) {
        logger.error({ err: settleErr, merchantTransactionId }, "createPlanCharge: paid but local settlement failed — awaiting webhook/reconciliation");
      }
    } else if (charge.outcome === "failed") {
      await db.update(subscriptionsTable)
        .set({ status: "falhada", updatedAt: new Date() })
        .where(and(eq(subscriptionsTable.id, subscription.id), eq(subscriptionsTable.status, "pendente")));
      throw new PaymentError(
        charge.failureMessage ?? "O pagamento não foi aprovado. Tenta novamente.",
        402,
      );
    }
    const fresh = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, subscription.id))
      .limit(1);
    return { subscription: fresh[0] ?? subscription, simulated: charge.simulated };
  } catch (err) {
    if (err instanceof PaymentError) throw err;
    await db.update(subscriptionsTable)
      .set({ status: "falhada", updatedAt: new Date() })
      .where(and(eq(subscriptionsTable.id, subscription.id), eq(subscriptionsTable.status, "pendente")));
    logger.error({ err, merchantTransactionId }, "createPlanCharge: charge failed");
    throw new PaymentError("Não foi possível iniciar o pagamento Multicaixa Express", 502);
  }
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
        }
        return { firstSettle: updated.length > 0 };
      });
      if (firstSettle) {
        void sendPushToOwner({
          title: "Venda paga!",
          body: `${order.offeringName} x${order.quantity} — ${Number(order.amount).toLocaleString("pt-AO")} Kz`,
          tag: `order-${order.id}`,
          url: await ownerUrl(order.businessId, "/dono/vendas"),
        }, order.businessId).catch(() => {});
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
  if (amount < PAYOUT_MIN_AOA) {
    throw new PaymentError(`O levantamento mínimo é ${PAYOUT_MIN_AOA.toLocaleString("pt-AO")} Kz`);
  }
  if (input.destinationType === "telemovel" && !/^9\d{8}$/.test(input.destination.replace(/^\+?244/, ""))) {
    throw new PaymentError("Número de telemóvel inválido (9XXXXXXXX)");
  }
  if (input.destinationType === "iban" && !/^AO06\d{21}$/i.test(input.destination.replace(/\s/g, ""))) {
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
        destination: input.destination,
        operationCode,
      })
      .returning();
    const p = inserted[0]!;
    await tx.insert(walletLedgerTable).values({
      businessId,
      type: "saque",
      amount: (-amount).toFixed(2),
      payoutId: p.id,
      description: `Levantamento para ${input.destinationType === "iban" ? "IBAN" : "telemóvel"} ${input.destination}`,
    });
    return p;
  });

  // Call the gateway outside the transaction.
  try {
    const dest = input.destination.replace(/\s/g, "").replace(/^\+?244/, "");
    const result = input.destinationType === "iban"
      ? await sendKwikToCustomer({ iban: input.destination.replace(/\s/g, "").toUpperCase(), amount, operationCode })
      : await sendToCustomer({ mobileNumber: dest, amount, operationCode });

    if (result.ok) {
      const status = result.pending ? "pendente" : "processado";
      const updated = await db
        .update(payoutsTable)
        .set({
          status,
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

/** Reconcile a pending KWiK payout against the gateway status endpoint. */
export async function reconcilePayout(payoutId: string, businessId: number): Promise<Payout | null> {
  const rows = await db
    .select()
    .from(payoutsTable)
    .where(and(eq(payoutsTable.id, payoutId), eq(payoutsTable.businessId, businessId)))
    .limit(1);
  const payout = rows[0];
  if (!payout) return null;
  if (payout.status !== "pendente") return payout;

  const state = await getKwikPayoutStatus(payout.operationCode);
  if (state === "processed") {
    const updated = await db
      .update(payoutsTable)
      .set({ status: "processado", updatedAt: new Date() })
      .where(and(eq(payoutsTable.id, payout.id), eq(payoutsTable.status, "pendente")))
      .returning();
    return updated[0] ?? payout;
  }
  if (state === "cancelled" || state === "voided") {
    return failPayout(payout.id, businessId, Number(payout.amount), "Levantamento revertido pelo e-kwanza");
  }
  return payout;
}

export { IS_SIMULATION };
