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