import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const capabilitySource = path.join(apiServerDir, "src/lib/visitorCapabilities.ts");

async function loadCapabilities() {
  const result = await build({
    entryPoints: [capabilitySource],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

test("visitor capabilities are header-only, signed, scoped, and tamper resistant", async () => {
  const previousSecret = process.env.VISITOR_CAPABILITY_SECRET;
  process.env.VISITOR_CAPABILITY_SECRET = "visitor-capability-test-secret-at-least-32-bytes";
  try {
    const caps = await loadCapabilities();
    const leadId = "11111111-1111-4111-8111-111111111111";
    const orderId = "22222222-2222-4222-8222-222222222222";
    const token = caps.issueOrderCapability(7, leadId, orderId);

    assert.match(token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(caps.visitorTokenFromAuthorization(`Visitor ${token}`), token);
    assert.equal(caps.visitorTokenFromAuthorization(`Bearer ${token}`), null);
    assert.equal(
      caps.verifyVisitorCapability(token, { businessId: 7, leadId, orderId, scope: "order" }).orderId,
      orderId,
    );
    assert.throws(
      () => caps.verifyVisitorCapability(token, { businessId: 8, leadId, orderId, scope: "order" }),
      /inválido ou expirado/,
    );
    assert.throws(
      () => caps.verifyVisitorCapability(`${token.slice(0, -1)}x`, { businessId: 7, leadId, orderId }),
      /inválido ou expirado/,
    );
  } finally {
    if (previousSecret === undefined) delete process.env.VISITOR_CAPABILITY_SECRET;
    else process.env.VISITOR_CAPABILITY_SECRET = previousSecret;
  }
});

test("proof routes reserve and claim an order-specific path exactly once", async () => {
  const source = await readFile(path.join(apiServerDir, "src/routes/paymentsScoped.ts"), "utf8");

  assert.match(source, /getObjectEntityUploadURL\(`order-proofs\/\$\{order\.id\}`\)/);
  assert.match(source, /eq\(ordersTable\.proofStatus, "pendente"\)/);
  assert.match(source, /eq\(ordersTable\.proofObjectPath, parsed\.data\.objectPath\)/);
  assert.match(source, /final\/\$\{order\.id\}\/\$\{finalId\}/);
  assert.doesNotMatch(source, /leadId=\$\{encodeURIComponent\(leadId\)\}/);
});