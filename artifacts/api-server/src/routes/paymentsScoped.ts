/**
 * Business-scoped payment routes, mounted inside /api/b/:businessSlug.
 *
 * Public (visitor checkout — no account; the order UUID is the capability):
 *  - POST /orders                — create order + GPO charge
 *  - GET  /orders/:id/status     — poll order state
 *
 * Owner-only:
 *  - GET  /orders                — sales list
 *  - GET  /wallet                — balance (ledger-derived) + statement
 *  - POST /wallet/payouts        — request a withdrawal
 *  - GET  /wallet/payouts        — payout history
 *  - POST /wallet/payouts/:id/reconcile — refresh a pending KWiK payout
 *  - GET  /subscription          — plan status
 *  - POST /subscription/checkout — pay the 10.000 Kz plan via Multicaixa Express
 *  - GET  /subscription/:id/status — poll a pending plan payment
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { createOrderSchema, createPayoutSchema, aoPhoneSchema } from "@workspace/db";
import {
  createProductOrder,
  getOrderPublicStatus,
  listOrders,
  getWallet,
  listPayouts,
  requestPayout,
  reconcilePayout,
  getSubscriptionInfo,
  createPlanCharge,
  getSubscriptionPublicStatus,
  PaymentError,
  IS_SIMULATION,
  PAYOUT_MIN_AOA,
} from "../services/payments.js";
import { logger } from "../lib/logger.js";

type Middleware = (req: Request, res: Response, next: () => void) => void | Promise<void>;

function handleError(res: Response, err: unknown, ctx: string): void {
  if (err instanceof PaymentError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  logger.error({ err }, ctx);
  res.status(500).json({ error: "Erro interno" });
}

export function createPaymentsScopedRouter(
  requireOwner: Middleware,
  bid: (res: Response) => number,
  publicRateLimit: Middleware,
): Router {
  const router = Router({ mergeParams: true });

  // ── Public checkout ────────────────────────────────────────────────────────

  router.post("/orders", publicRateLimit, async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
      return;
    }
    try {
      const { order, simulated } = await createProductOrder(bid(res), parsed.data);
      res.status(201).json({
        orderId: order.id,
        merchantTransactionId: order.merchantTransactionId,
        amount: Number(order.amount),
        status: order.status,
        simulated,
      });
    } catch (err) {
      handleError(res, err, "POST /orders failed");
    }
  });

  router.get("/orders/:id/status", async (req, res) => {
    const id = String(req.params["id"] ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(404).json({ error: "Encomenda não encontrada" });
      return;
    }
    try {
      const order = await getOrderPublicStatus(id);
      if (!order || order.businessId !== bid(res)) {
        res.status(404).json({ error: "Encomenda não encontrada" });
        return;
      }
      res.json({
        orderId: order.id,
        status: order.status,
        amount: Number(order.amount),
        offeringName: order.offeringName,
        quantity: order.quantity,
        merchantTransactionId: order.merchantTransactionId,
        paidAt: order.paidAt,
      });
    } catch (err) {
      handleError(res, err, "GET /orders/:id/status failed");
    }
  });

  // ── Owner: sales ───────────────────────────────────────────────────────────

  router.get("/orders", requireOwner, async (_req, res) => {
    try {
      const orders = await listOrders(bid(res));
      res.json({ orders, simulation: IS_SIMULATION });
    } catch (err) {
      handleError(res, err, "GET /orders failed");
    }
  });

  // ── Owner: wallet & payouts ────────────────────────────────────────────────

  router.get("/wallet", requireOwner, async (_req, res) => {
    try {
      const wallet = await getWallet(bid(res));
      res.json({ ...wallet, payoutMin: PAYOUT_MIN_AOA, simulation: IS_SIMULATION });
    } catch (err) {
      handleError(res, err, "GET /wallet failed");
    }
  });

  router.get("/wallet/payouts", requireOwner, async (_req, res) => {
    try {
      const payouts = await listPayouts(bid(res));
      res.json({ payouts });
    } catch (err) {
      handleError(res, err, "GET /wallet/payouts failed");
    }
  });

  router.post("/wallet/payouts", requireOwner, async (req, res) => {
    const parsed = createPayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" });
      return;
    }
    try {
      const payout = await requestPayout(bid(res), parsed.data);
      res.status(201).json({ payout });
    } catch (err) {
      handleError(res, err, "POST /wallet/payouts failed");
    }
  });

  router.post("/wallet/payouts/:id/reconcile", requireOwner, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const payout = await reconcilePayout(id, bid(res));
      if (!payout) {
        res.status(404).json({ error: "Levantamento não encontrado" });
        return;
      }
      res.json({ payout });
    } catch (err) {
      handleError(res, err, "POST /wallet/payouts/:id/reconcile failed");
    }
  });

  // ── Owner: plan subscription ───────────────────────────────────────────────

  router.get("/subscription", requireOwner, async (_req, res) => {
    try {
      const info = await getSubscriptionInfo(bid(res));
      res.json({ ...info, simulation: IS_SIMULATION });
    } catch (err) {
      handleError(res, err, "GET /subscription failed");
    }
  });

  router.post("/subscription/checkout", requireOwner, async (req, res) => {
    const schema = z.object({ phone: aoPhoneSchema });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Número inválido" });
      return;
    }
    try {
      const { subscription, simulated } = await createPlanCharge(bid(res), parsed.data.phone);
      res.status(201).json({
        subscriptionId: subscription.id,
        merchantTransactionId: subscription.merchantTransactionId,
        amount: Number(subscription.amount),
        status: subscription.status,
        simulated,
      });
    } catch (err) {
      handleError(res, err, "POST /subscription/checkout failed");
    }
  });

  router.get("/subscription/:id/status", requireOwner, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const sub = await getSubscriptionPublicStatus(id, bid(res));
      if (!sub) {
        res.status(404).json({ error: "Pagamento não encontrado" });
        return;
      }
      res.json({ subscriptionId: sub.id, status: sub.status, expiresAt: sub.expiresAt });
    } catch (err) {
      handleError(res, err, "GET /subscription/:id/status failed");
    }
  });

  return router;
}
