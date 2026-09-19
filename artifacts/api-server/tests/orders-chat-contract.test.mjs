import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.resolve(apiServerDir, "../ai-call-funnel");

async function source(filePath) {
  return readFile(filePath, "utf8");
}

test("paid checkouts send the customer to conversation tracking, not proof upload", async () => {
  const [buyModal, inlineCheckout] = await Promise.all([
    source(path.join(frontendDir, "src/components/BuyModal.tsx")),
    source(path.join(frontendDir, "src/components/InlineCheckout.tsx")),
  ]);

  assert.doesNotMatch(buyModal, /OrderProofUpload/);
  assert.doesNotMatch(inlineCheckout, /OrderProofUpload/);
  assert.match(buyModal, /O acompanhamento será feito no chat da loja/);
  assert.match(inlineCheckout, /O acompanhamento será feito nesta conversa/);
});

test("orders always get a lead capability and public tracking is scoped to it", async () => {
  const [payments, routes, businessRoutes] = await Promise.all([
    source(path.join(apiServerDir, "src/services/payments.ts")),
    source(path.join(apiServerDir, "src/routes/paymentsScoped.ts")),
    source(path.join(apiServerDir, "src/routes/businessScoped.ts")),
  ]);

  assert.match(payments, /source: "checkout-direct"/);
  assert.match(payments, /eq\(ordersTable\.leadId, leadId\)/);
  assert.match(routes, /router\.get\("\/orders\/:id\/tracking"/);
  assert.match(businessRoutes, /router\.get\("\/leads\/:id\/session"/);
});

test("repeated fulfillment refreshes do not publish duplicate updates", async () => {
  const payments = await source(path.join(apiServerDir, "src/services/payments.ts"));
  assert.match(payments, /if \(order\.fulfillmentStatus === status && !note\) return order;/);
  assert.match(payments, /A tua encomenda entrou em preparação/);
  assert.match(payments, /leadMessages|chatMessages/);
});

test("payment webhook failures notify the right owner while preserving gateway retries", async () => {
  const [payments, assistant, schema, webhookRoute] = await Promise.all([
    source(path.join(apiServerDir, "src/services/payments.ts")),
    source(path.join(apiServerDir, "src/services/assistant.ts")),
    source(path.resolve(apiServerDir, "../../lib/db/src/schema/assistantMessages.ts")),
    source(path.join(apiServerDir, "src/routes/payments.ts")),
  ]);

  assert.match(payments, /export async function notifyPaymentWebhookFailure/);
  assert.match(payments, /await savePaymentFailureAlert\(/);
  assert.match(payments, /payment-webhook-failure-\$\{merchantTransactionId\}/);
  assert.match(payments, /ownerUrl\(businessId, destination\)/);
  assert.match(assistant, /export async function savePaymentFailureAlert/);
  assert.match(assistant, /onConflictDoNothing\(\{ target: assistantMessagesTable\.dedupeKey \}\)/);
  assert.match(assistant, /broadcastAssistantMessage\(message\)/);
  assert.match(schema, /"payment_webhook_failure"/);
  assert.match(schema, /dedupeKey: text\("dedupe_key"\)\.unique\(\)/);
  assert.match(webhookRoute, /notifyPaymentWebhookFailure\(/);
  assert.match(webhookRoute, /res\.status\(500\)\.json\(\{ status: "1" \}\)/);
});

test("unknown charge outcomes stay pending and payouts reconcile automatically", async () => {
  const [payments, reconciliation, server] = await Promise.all([
    source(path.join(apiServerDir, "src/services/payments.ts")),
    source(path.join(apiServerDir, "src/services/paymentReconciliation.ts")),
    source(path.join(apiServerDir, "src/index.ts")),
  ]);

  assert.doesNotMatch(
    payments,
    /catch \(err\) \{\s*await db\.update\(ordersTable\)[\s\S]{0,300}status: "falhada"/,
  );
  assert.doesNotMatch(
    payments,
    /catch \(err\) \{\s*await db\.update\(subscriptionsTable\)[\s\S]{0,300}status: "falhada"/,
  );
  assert.doesNotMatch(payments, /function maybeExpire/);
  assert.match(reconciliation, /eq\(payoutsTable\.status, "pendente"\)/);
  assert.match(reconciliation, /await reconcilePayout\(payout\.id, payout\.businessId\)/);
  assert.match(reconciliation, /set\(\{ updatedAt: now \}\)/);
  assert.match(reconciliation, /setInterval\(tick, RECONCILIATION_INTERVAL_MS\)/);
  assert.match(server, /startPaymentReconciliationCron\(\)/);
});

test("subscription checkout exposes the real simulation state to the owner UI", async () => {
  const payments = await source(path.join(apiServerDir, "src/services/payments.ts"));
  assert.match(payments, /return \{ subscription, simulated: IS_SIMULATION \};/);
});