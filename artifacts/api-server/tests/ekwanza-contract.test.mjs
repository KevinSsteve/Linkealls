import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, describe, it } from "node:test";

const {
  getKwikPayoutStatus,
  sendKwikToCustomer,
} = await import(process.env.EKWANZA_TEST_MODULE);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("e-kwanza KWiK payout contract", () => {
  it("sends an IBAN payout with the expected route, payload, and HMAC", async () => {
    let request;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return jsonResponse({
        status: 347,
        ekzOperationCode: "OP-123",
        ekzTransactionCode: "TX-123",
      }, 202);
    };

    const result = await sendKwikToCustomer({
      iban: "AO06000600000000000000000",
      amount: 1000,
      operationCode: "LKW-123",
    });

    assert.equal(request.url, "https://gateway.test/Operations/SendKWiKToCustomer");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.headers["X-API-Key"], "test-api-key");

    const payload = JSON.parse(request.init.body);
    assert.deepEqual(payload.data, {
      IBAN: "AO06000600000000000000000",
      token: "test-notification-token",
      amount: "1000",
      operationCode: "LKW-123",
    });
    assert.match(payload.meta.timestamp, /^\d{4}-\d{2}-\d{2}T/);

    const expectedSignature = createHmac("sha256", "test-api-key")
      .update(`${payload.meta.timestamp}AO06000600000000000000000test-notification-tokenLKW-123`)
      .digest("hex");
    assert.equal(payload.meta.signature, expectedSignature);
    assert.deepEqual(result, {
      simulated: false,
      ok: true,
      pending: true,
      ekzOperationCode: "OP-123",
      ekzTransactionCode: "TX-123",
    });
  });

  it("returns a provider error without treating a rejected payout as successful", async () => {
    globalThis.fetch = async () => jsonResponse({ status: 180 }, 400);

    const result = await sendKwikToCustomer({
      iban: "AO06000600000000000000000",
      amount: 1000,
      operationCode: "LKW-REJECTED",
    });

    assert.deepEqual(result, {
      simulated: false,
      ok: false,
      errorStatus: "180",
    });
  });

  for (const operationStatus of ["processed", "processing", "cancelled", "voided"]) {
    it(`maps provider status ${operationStatus}`, async () => {
      let request;
      globalThis.fetch = async (input, init) => {
        request = { url: String(input), init };
        return jsonResponse({ OperationStatus: operationStatus });
      };

      const result = await getKwikPayoutStatus("OP/with spaces");

      assert.equal(
        request.url,
        "https://gateway.test/Operations/SendKWiKToCustomerStatus?ExternalReferenceId=OP%2Fwith%20spaces",
      );
      assert.equal(request.init.method, "GET");
      assert.equal(request.init.headers.Accept, "application/json");
      assert.equal(request.init.headers["X-API-Key"], "test-api-key");
      assert.equal(result, operationStatus);
    });
  }

  it("accepts the provider's lower camel-case status field", async () => {
    globalThis.fetch = async () => jsonResponse({ operationStatus: "processed" });

    assert.equal(await getKwikPayoutStatus("OP-LOWER"), "processed");
  });

  it("fails closed for non-success responses and unknown statuses", async () => {
    globalThis.fetch = async () => jsonResponse({ Status: 1 }, 400);
    assert.equal(await getKwikPayoutStatus("OP-UNKNOWN"), "unknown");

    globalThis.fetch = async () => jsonResponse({ Status: 1 }, 200);
    assert.equal(await getKwikPayoutStatus("OP-UNKNOWN-STATUS"), "unknown");
  });

  it("keeps a payout unresolved when the status request has a network error", async () => {
    globalThis.fetch = async () => {
      throw new Error("simulated DNS failure");
    };

    assert.equal(await getKwikPayoutStatus("OP-NETWORK"), "unknown");
  });
});