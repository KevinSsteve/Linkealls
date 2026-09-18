import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { beforeEach, after, describe, it } from "node:test";

// Run: node artifacts/api-server/scripts/run-financial-tests.mjs
// Real services/provider parsing + captured route handlers; in-memory DB only.
// NOT covered: PostgreSQL locks/unique indexes under concurrency, process crashes,
// actual provider timing/signature specification, HTTP middleware, push delivery,
// campaign publication, or automatic refund execution at the provider.
const originalFetch = globalThis.fetch;
const denyNetwork = async () => { throw new Error("Unmocked network request forbidden"); };
globalThis.fetch = denyNetwork;
const {
  state, reset, requestPayout, reconcilePayout, getWallet, paymentRouter,
  payCampaignWithMulticaixa, settleGpoPayment,
} = await import(process.env.FINANCIAL_TEST_MODULE);
after(() => { globalThis.fetch = originalFetch; });

const payoutInput = {
  amount: 1000,
  destinationType: "iban",
  destination: `AO06${"0".repeat(21)}`,
};
const order = {
  id: "order-1", businessId: 1, merchantTransactionId: "LKOORDER1",
  status: "pendente", amount: "1500.00", offeringName: "Test product", quantity: 1,
  leadId: "lead-1", buyerPhone: "923000001",
};
const campaign = {
  id: "campaign-1", businessId: 1, name: "Test campaign", budget: 5000,
  platform: "tiktok", paymentStatus: "nao_pago",
};
beforeEach(() => {
  globalThis.fetch = denyNetwork;
  reset({
    businessProfilesTable: [{ id: 1, slug: "test-business" }],
    walletLedgerTable: [{ id: "opening-balance", businessId: 1, type: "venda", amount: "10000.00" }],
  });
});

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const timeout = () => new DOMException("Provider outcome unknown", "TimeoutError");
const refunds = () => state.rows.walletLedgerTable.filter((row) => row.type === "estorno_saque");
const balance = async () => (await getWallet(1)).balance;
const flushBackground = () => new Promise((resolve) => setImmediate(resolve));

async function webhook(merchantTransactionId, operationStatus = 1, overrides = {}) {
  const ekwanzaTransactionId = "TX-TEST";
  const signature = createHmac("sha256", "test-api-key")
    .update(`${ekwanzaTransactionId}${merchantTransactionId}test-partnertest-notification-token`)
    .digest("hex");
  const req = {
    body: {
      merchantTransactionId, ekwanzaTransactionId, operationStatus,
      operationData: { referenceType: "GPO", merchantIdentifier: "test-merchant" },
      ...overrides.body,
    },
    header: () => overrides.signature ?? signature,
  };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
  await paymentRouter.routes.find((route) => route.path === "/payments/webhook/gpo").handler(req, res);
  return { status: res.statusCode, body: res.body };
}

function seedOrder(status = "pendente") {
  state.rows.ordersTable.push({ ...order, status });
  state.rows.leadsTable.push({ id: "lead-1", businessId: 1, chatMessages: [], qualificationData: {} });
}

describe("payout uncertainty retains the debit", () => {
  it("a timed-out payout stays pending without refunding or resending", async () => {
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url, init });
      throw timeout();
    };
    const payout = await requestPayout(1, payoutInput);
    assert.equal(payout.status, "pendente");
    assert.ok(payout.error);
    assert.equal(await balance(), 9000);
    assert.equal(refunds().length, 0);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].init.method, "POST");
    assert.equal(JSON.parse(requests[0].init.body).data.operationCode, payout.operationCode);
    for (let retry = 0; retry < 2; retry++) {
      const result = await reconcilePayout(payout.id, 1);
      assert.equal(result.reconciliation, "pending");
      assert.equal(result.payout.status, "pendente");
    }
    assert.equal(requests.filter((request) => request.init.method === "POST").length, 1);
    assert.equal(await balance(), 9000);
    assert.equal(refunds().length, 0);
  });

  for (const [label, response] of [
    ["unknown state", () => json({ OperationStatus: "unrecognized" })],
    ["processing", () => json({ OperationStatus: "processing" })],
    ["HTTP 503", () => json({ error: "unavailable" }, 503)],
    ["malformed JSON", () => new Response("{", { status: 200 })],
  ]) {
    it(`${label} during repeated reconciliation never refunds`, async () => {
      globalThis.fetch = async () => json({ status: 347 }, 202);
      const payout = await requestPayout(1, payoutInput);
      globalThis.fetch = async () => response();
      for (let retry = 0; retry < 2; retry++) {
        assert.equal((await reconcilePayout(payout.id, 1)).reconciliation, "pending");
      }
      assert.equal(await balance(), 9000);
      assert.equal(refunds().length, 0);
    });
  }

  it("a later processed response resolves a timeout without refunding", async () => {
    globalThis.fetch = async () => { throw timeout(); };
    const payout = await requestPayout(1, payoutInput);
    let statusCalls = 0;
    globalThis.fetch = async () => { statusCalls++; return json({ OperationStatus: "processed" }); };
    assert.equal((await reconcilePayout(payout.id, 1)).reconciliation, "processed");
    assert.equal((await reconcilePayout(payout.id, 1)).payout.status, "processado");
    assert.equal(statusCalls, 1);
    assert.equal(await balance(), 9000);
    assert.equal(refunds().length, 0);
  });

  for (const status of ["cancelled", "voided"]) {
    it(`authoritative ${status} refunds exactly once, unlike an unknown outcome`, async () => {
      globalThis.fetch = async () => { throw timeout(); };
      const payout = await requestPayout(1, payoutInput);
      globalThis.fetch = async () => json({ OperationStatus: status });
      assert.equal((await reconcilePayout(payout.id, 1)).reconciliation, "reverted");
      assert.equal((await reconcilePayout(payout.id, 1)).reconciliation, "reverted");
      assert.equal(refunds().length, 1);
      assert.equal(refunds()[0].amount, "1000.00");
      assert.equal(await balance(), 10000);
    });
  }

  it("another business cannot reconcile or query the provider for this payout", async () => {
    globalThis.fetch = async () => { throw timeout(); };
    const payout = await requestPayout(1, payoutInput);
    let calls = 0;
    globalThis.fetch = async () => { calls++; return json({ OperationStatus: "cancelled" }); };
    assert.equal(await reconcilePayout(payout.id, 2), null);
    assert.equal(calls, 0);
    assert.equal(refunds().length, 0);
  });
});

describe("signed payment notification retries", () => {
  it("duplicate success credits, records the event, follows up, and pushes once", async () => {
    seedOrder();
    for (let retry = 0; retry < 3; retry++) {
      assert.deepEqual(await webhook(order.merchantTransactionId), { status: 200, body: { status: "0" } });
    }
    assert.equal(state.rows.ordersTable[0].status, "paga");
    assert.equal(state.rows.walletLedgerTable.filter((row) => row.orderId === order.id).length, 1);
    assert.equal(await balance(), 11500);
    assert.equal(state.rows.orderEventsTable.length, 1);
    assert.equal(state.rows.leadsTable[0].chatMessages.length, 1);
    assert.equal(state.pushes.length, 1);
    assert.equal(state.pushes[0].payload.tag, "order-order-1");
  });

  it("a failed ledger insert rolls back; a signed retry settles once", async () => {
    seedOrder();
    state.failInsert = "walletLedgerTable";
    assert.deepEqual(await webhook(order.merchantTransactionId), { status: 500, body: { status: "1" } });
    await flushBackground();
    assert.equal(state.rows.ordersTable[0].status, "pendente");
    assert.equal(await balance(), 10000);
    assert.equal(state.rows.orderEventsTable.length, 0);
    assert.deepEqual(await webhook(order.merchantTransactionId), { status: 200, body: { status: "0" } });
    assert.deepEqual(await webhook(order.merchantTransactionId), { status: 200, body: { status: "0" } });
    assert.equal(await balance(), 11500);
    assert.equal(state.rows.orderEventsTable.length, 1);
    assert.equal(state.pushes.filter((push) => push.payload.tag === "order-order-1").length, 1);
  });

  it("retry repairs a missing sale credit without duplicating follow-up effects", async () => {
    seedOrder("paga");
    await webhook(order.merchantTransactionId);
    await webhook(order.merchantTransactionId);
    assert.equal(await balance(), 11500);
    assert.equal(state.rows.orderEventsTable.length, 0);
    assert.equal(state.rows.leadsTable[0].chatMessages.length, 0);
    assert.equal(state.pushes.length, 0);
  });

  it("a late failure cannot reverse an already-paid order", async () => {
    seedOrder();
    await webhook(order.merchantTransactionId);
    await webhook(order.merchantTransactionId, 3);
    assert.equal(state.rows.ordersTable[0].status, "paga");
    assert.equal(await balance(), 11500);
    assert.equal(state.pushes.length, 1);
  });

  it("unknown transaction, bad signature, and wrong merchant do not mutate financial data", async () => {
    seedOrder();
    const before = structuredClone(state.rows);
    assert.deepEqual(await webhook("UNKNOWN"), { status: 200, body: { status: "1" } });
    assert.equal((await webhook(order.merchantTransactionId, 1, { signature: "00" })).status, 401);
    assert.equal((await webhook(order.merchantTransactionId, 1, {
      body: { operationData: { merchantIdentifier: "another-merchant" } },
    })).status, 401);
    assert.deepEqual(state.rows, before);
    assert.equal(state.pushes.length, 0);
  });
});

describe("campaign pending and delayed payment behavior", () => {
  for (const outcome of ["timeout", "pending"]) {
    it(`repeated pay after ${outcome} sends only one charge and preserves its attempt`, async () => {
      state.rows.campaignsTable.push({ ...campaign });
      let charges = 0;
      globalThis.fetch = async (url) => {
        if (String(url) === "https://auth.test/token") return json({ access_token: "fake-token" });
        assert.equal(String(url), "https://gateway.test/charges");
        charges++;
        if (outcome === "timeout") throw timeout();
        return json({ responseStatus: {} });
      };
      const first = await payCampaignWithMulticaixa(campaign.id, 1, "923000001");
      await flushBackground();
      await flushBackground();
      assert.equal(first.paymentStatus, "pendente");
      for (let retry = 0; retry < 2; retry++) {
        await assert.rejects(payCampaignWithMulticaixa(campaign.id, 1, "923000001"),
          (error) => error.statusCode === 400 && error.message.includes("em curso"));
      }
      assert.equal(charges, 1);
      assert.equal(state.rows.campaignsTable[0].paymentStatus, "pendente");
      assert.equal(state.rows.campaignPaymentAttemptsTable.length, 1);
      assert.equal(state.rows.campaignPaymentAttemptsTable[0].merchantTransactionId, first.paymentMerchantTransactionId);
      assert.equal(await balance(), 10000);
      assert.equal(state.pushes.length, 0);
      // Same signed paid callback can be retried without duplicate push or debit.
      await webhook(first.paymentMerchantTransactionId);
      await webhook(first.paymentMerchantTransactionId);
      assert.equal(state.rows.campaignsTable[0].paymentStatus, "pago");
      assert.equal(state.rows.campaignPaymentAttemptsTable[0].status, "pago");
      assert.equal(state.pushes.length, 1);
      assert.equal(await balance(), 10000);
      assert.equal(charges, 1);
    });
  }

  it("a stale failed attempt cannot fail the current pending campaign", async () => {
    state.rows.campaignsTable.push({ ...campaign, paymentStatus: "pendente", paymentMerchantTransactionId: "NEW" });
    state.rows.campaignPaymentAttemptsTable.push(
      { id: "old", campaignId: campaign.id, merchantTransactionId: "OLD", status: "pendente" },
      { id: "new", campaignId: campaign.id, merchantTransactionId: "NEW", status: "pendente" },
    );
    assert.equal(await settleGpoPayment("OLD", 3), true);
    assert.equal(state.rows.campaignsTable[0].paymentStatus, "pendente");
    assert.equal(state.rows.campaignPaymentAttemptsTable[0].status, "falhado");
    assert.equal(state.rows.campaignPaymentAttemptsTable[1].status, "pendente");
  });

  it("a different paid attempt after settlement is flagged, not silently dropped or auto-refunded", async () => {
    state.rows.campaignsTable.push({ ...campaign, paymentStatus: "pendente", paymentMerchantTransactionId: "NEW" });
    state.rows.campaignPaymentAttemptsTable.push(
      { id: "old", campaignId: campaign.id, merchantTransactionId: "OLD", status: "pendente" },
      { id: "new", campaignId: campaign.id, merchantTransactionId: "NEW", status: "pendente" },
    );
    await webhook("NEW");
    await webhook("OLD");
    await webhook("OLD");
    assert.equal(state.rows.campaignPaymentAttemptsTable[0].status, "pago_duplicado");
    assert.equal(state.rows.campaignPaymentAttemptsTable[1].status, "pago");
    assert.equal(state.pushes.length, 1);
    assert.equal(state.logs.filter((entry) => entry.level === "error" &&
      entry.args.some((arg) => typeof arg === "string" && arg.includes("DUPLICATE campaign payment"))).length, 1);
    assert.equal(await balance(), 10000);
    assert.equal(refunds().length, 0);
  });

  it("a delayed success for a previously failed attempt must still flag a duplicate charge", {
    todo: "Known defect: campaign already paid + old attempt falhado => paid callback is acknowledged but duplicate is not flagged. Production payment code intentionally unchanged.",
  }, async () => {
    state.rows.campaignsTable.push({ ...campaign, paymentStatus: "pendente", paymentMerchantTransactionId: "NEW" });
    state.rows.campaignPaymentAttemptsTable.push(
      { id: "old", campaignId: campaign.id, merchantTransactionId: "OLD", status: "pendente" },
      { id: "new", campaignId: campaign.id, merchantTransactionId: "NEW", status: "pendente" },
    );
    // An older attempt fails, then the new attempt pays. A delayed authoritative
    // success for OLD means two charges, even though OLD was locally failed.
    await webhook("OLD", 3);
    await webhook("NEW");
    assert.equal(state.rows.campaignPaymentAttemptsTable[0].status, "falhado");
    assert.deepEqual(await webhook("OLD", 1), { status: 200, body: { status: "0" } });
    assert.equal(state.rows.campaignPaymentAttemptsTable[0].status, "pago_duplicado",
      "The old paid attempt must be visible for manual review/refund, not remain falhado");
  });
});