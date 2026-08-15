/**
 * Platform-level payment routes:
 *  - POST /payments/webhook/gpo   — e-kwanza/AppyPay GPO callback (public)
 *  - POST /payments/simulate/pay  — SIMULATION MODE ONLY: settle a charge locally
 */
import { Router } from "express";
import { z } from "zod/v4";
import { verifyNotificationSignature, IS_SIMULATION } from "../services/ekwanza.js";
import { settleGpoPayment } from "../services/payments.js";
import { logger } from "../lib/logger.js";

const router = Router();

const gpoCallbackSchema = z.object({
  merchantTransactionId: z.string().min(1),
  ekwanzaTransactionId: z.union([z.string(), z.number()]).optional(),
  operationStatus: z.number(),
  operationData: z
    .object({
      amount: z.number().optional(),
      merchantIdentifier: z.string().optional(),
      referenceType: z.string().optional(),
    })
    .optional(),
});

/** GPO payment notification callback (spec: "Callback para … GPO"). */
router.post("/payments/webhook/gpo", async (req, res) => {
  const parsed = gpoCallbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ status: "1" });
    return;
  }
  const { merchantTransactionId, ekwanzaTransactionId, operationStatus, operationData } = parsed.data;

  // Only Multicaixa Express notifications are expected.
  if (operationData?.referenceType && operationData.referenceType !== "GPO") {
    res.status(200).json({ status: "1" });
    return;
  }

  if (IS_SIMULATION) {
    // Real callbacks cannot be validated without credentials — refuse.
    logger.warn("GPO webhook hit in simulation mode — ignored");
    res.status(401).json({ status: "1" });
    return;
  }

  // Fail closed: in real mode every callback MUST carry a valid HMAC-SHA256
  // x-signature, and the signing key must be configured. A merchant identifier
  // is public information, not authentication.
  const signature = req.header("x-signature") ?? "";
  const okSig = signature.length > 0 && verifyNotificationSignature(
    signature,
    String(ekwanzaTransactionId ?? ""),
    merchantTransactionId,
  );
  if (!okSig) {
    logger.warn({ merchantTransactionId, hasSignature: signature.length > 0 }, "GPO webhook rejected: missing/invalid signature");
    res.status(401).json({ status: "1" });
    return;
  }
  // Defence in depth: also cross-check the merchant identifier when configured.
  if (
    process.env["EKWANZA_MERCHANT_IDENTIFIER"] &&
    operationData?.merchantIdentifier !== process.env["EKWANZA_MERCHANT_IDENTIFIER"]
  ) {
    logger.warn({ merchantTransactionId }, "GPO webhook merchant identifier mismatch");
    res.status(401).json({ status: "1" });
    return;
  }

  try {
    const known = await settleGpoPayment(
      merchantTransactionId,
      operationStatus,
      ekwanzaTransactionId !== undefined ? String(ekwanzaTransactionId) : undefined,
    );
    res.status(200).json({ status: known ? "0" : "1" });
  } catch (err) {
    logger.error({ err, merchantTransactionId }, "GPO webhook settlement failed");
    // 5xx → gateway retries later
    res.status(500).json({ status: "1" });
  }
});

/**
 * SIMULATION ONLY — approve/refuse a pending charge as if the buyer had
 * answered the Multicaixa Express push. Disabled when real credentials exist.
 */
router.post("/payments/simulate/pay", async (req, res) => {
  // Development-only: never enabled in production, even if credentials are
  // missing there — otherwise anyone could settle charges without paying.
  if (!IS_SIMULATION || process.env["NODE_ENV"] !== "development") {
    res.status(404).json({ error: "Não disponível" });
    return;
  }
  const schema = z.object({
    merchantTransactionId: z.string().min(1),
    approve: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }
  try {
    const known = await settleGpoPayment(
      parsed.data.merchantTransactionId,
      parsed.data.approve ? 1 : 4,
      `SIM-${Date.now()}`,
    );
    if (!known) {
      res.status(404).json({ error: "Transação não encontrada" });
      return;
    }
    res.json({ ok: true, simulated: true });
  } catch (err) {
    logger.error({ err }, "simulate/pay failed");
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
