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
import { Readable } from "stream";
import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { createOrderSchema, createPayoutSchema, aoPhoneSchema } from "@workspace/db";
import {
  createProductOrder,
  getOrderPublicStatus,
  listOrders,
  getOrderAnalytics,
  updateOrderFulfillment,
  reviewOrderProof,
  listOrderEvents,
  submitOrderProof,
  subscribeToOrderEvents,
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
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage.js";

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
  const objectStorageService = new ObjectStorageService();

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
        fulfillmentStatus: order.fulfillmentStatus,
        proofStatus: order.proofStatus,
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

  // SSE — must be before /orders/:id/events.
  router.get("/orders/events", requireOwner, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const businessId = bid(res);
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 20_000);
    const unsubscribe = subscribeToOrderEvents((changedBusinessId) => {
      if (changedBusinessId === businessId) {
        res.write(`event: order_changed\ndata: ${JSON.stringify({ businessId })}\n\n`);
      }
    });
    req.on("close", () => { clearInterval(keepAlive); unsubscribe(); });
  });

  router.get("/orders/analytics", requireOwner, async (_req, res) => {
    try {
      res.json({ analytics: await getOrderAnalytics(bid(res)) });
    } catch (err) {
      handleError(res, err, "GET /orders/analytics failed");
    }
  });

  router.get("/orders/:id/events", requireOwner, async (req, res) => {
    try {
      const events = await listOrderEvents(bid(res), String(req.params["id"] ?? ""));
      res.json({ events });
    } catch (err) {
      handleError(res, err, "GET /orders/:id/events failed");
    }
  });

  router.patch("/orders/:id/fulfillment", requireOwner, async (req, res) => {
    const parsed = z.object({
      status: z.enum(["novo", "em_preparacao", "pronto", "entregue", "cancelado"]),
      note: z.string().trim().max(2000).optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Estado de encomenda inválido" });
      return;
    }
    try {
      const order = await updateOrderFulfillment(
        bid(res),
        String(req.params["id"] ?? ""),
        parsed.data.status,
        parsed.data.note,
      );
      if (!order) {
        res.status(404).json({ error: "Encomenda não encontrada" });
        return;
      }
      res.json({ order });
    } catch (err) {
      handleError(res, err, "PATCH /orders/:id/fulfillment failed");
    }
  });

  router.patch("/orders/:id/proof", requireOwner, async (req, res) => {
    const parsed = z.object({
      status: z.enum(["aprovado", "rejeitado"]),
      note: z.string().trim().max(2000).optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Revisão de comprovativo inválida" });
      return;
    }
    try {
      const order = await reviewOrderProof(
        bid(res),
        String(req.params["id"] ?? ""),
        parsed.data.status,
        parsed.data.note,
      );
      if (!order) {
        res.status(404).json({ error: "Encomenda não encontrada" });
        return;
      }
      res.json({ order });
    } catch (err) {
      handleError(res, err, "PATCH /orders/:id/proof failed");
    }
  });

  // Public upload capability is the order UUID, which is already required to
  // poll payment status. The object remains private and is never served here.
  router.post("/orders/:id/proof/request-url", publicRateLimit, async (req, res) => {
    const parsed = z.object({
      name: z.string().trim().min(1).max(200),
      size: z.number().int().positive().max(10 * 1024 * 1024),
      contentType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Comprovativo inválido (PNG, JPG, WebP ou PDF até 10 MB)" });
      return;
    }
    try {
      const order = await getOrderPublicStatus(String(req.params["id"] ?? ""));
      if (!order || order.businessId !== bid(res) || order.status !== "paga") {
        res.status(404).json({ error: "Encomenda não encontrada ou ainda não paga" });
        return;
      }
      const uploadURL = await objectStorageService.getObjectEntityUploadURL("order-proofs");
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath });
    } catch (err) {
      handleError(res, err, "POST /orders/:id/proof/request-url failed");
    }
  });

  router.post("/orders/:id/proof", publicRateLimit, async (req, res) => {
    const parsed = z.object({ objectPath: z.string().startsWith("/objects/order-proofs/").max(500) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ficheiro de comprovativo inválido" });
      return;
    }
    try {
      const order = await getOrderPublicStatus(String(req.params["id"] ?? ""));
      if (!order || order.businessId !== bid(res) || order.status !== "paga") {
        res.status(404).json({ error: "Encomenda não encontrada ou ainda não paga" });
        return;
      }
      await objectStorageService.getObjectEntityFile(parsed.data.objectPath);
      const updated = await submitOrderProof(order.id, parsed.data.objectPath);
      res.json({ order: updated });
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(400).json({ error: "O upload do comprovativo ainda não terminou" });
        return;
      }
      handleError(res, err, "POST /orders/:id/proof failed");
    }
  });

  router.get("/orders/:id/proof", requireOwner, async (req, res) => {
    try {
      const order = await getOrderPublicStatus(String(req.params["id"] ?? ""));
      if (!order || order.businessId !== bid(res) || !order.proofObjectPath) {
        res.status(404).json({ error: "Comprovativo não encontrado" });
        return;
      }
      const file = await objectStorageService.getObjectEntityFile(order.proofObjectPath);
      const response = await objectStorageService.downloadObject(file, 300);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Comprovativo não encontrado" });
        return;
      }
      handleError(res, err, "GET /orders/:id/proof failed");
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
