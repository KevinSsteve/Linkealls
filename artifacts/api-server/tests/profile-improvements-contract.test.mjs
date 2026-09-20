import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("profile proposals remain allowlisted, evidence-based and model-write-free", async () => {
  const [schema, service, assistant] = await Promise.all([
    read("../../lib/db/src/schema/profileImprovements.ts"),
    read("src/services/profileImprovements.ts"),
    read("src/services/assistant.ts"),
  ]);
  assert.match(schema, /preview:\s*z\.string\(\)\.trim\(\)\.min\(3\)/);
  assert.doesNotMatch(schema, /profileChangeProposalInputSchema[\s\S]{0,500}\bmodel:/);
  assert.match(service, /DENIED_PATH\s*=\s*\/\(wallet\|payment\|payout\|refund\|sale\|order\|subscription\|campaign\|fund\|publish\)/);
  assert.match(service, /eq\(profileChangeProposalTable\.updatedAt, expectedUpdatedAt\)/);
  assert.match(service, /adjustProfileChangeProposal[\s\S]*return db\.transaction/);
  assert.match(service, /reopenProfileChangeProposal[\s\S]*status !== "approved"/);
  assert.match(assistant, /As ferramentas de melhoria apenas criam propostas\/pedidos/);
  assert.doesNotMatch(assistant, /case "propose_profile_change"[\s\S]{0,1400}update\(businessProfilesTable\)/);
});

test("resource publication and delivery are fail-closed", async () => {
  const [schema, service, routes, storage] = await Promise.all([
    read("../../lib/db/src/schema/profileImprovements.ts"),
    read("src/services/profileImprovements.ts"),
    read("src/routes/businessScoped.ts"),
    read("src/routes/storage.ts"),
  ]);
  assert.match(schema, /visibility:[\s\S]*default\("private"\)/);
  assert.match(schema, /status:[\s\S]*default\("draft"\)/);
  assert.match(service, /status:\s*"draft",\s*\n\s*visibility:\s*"private"/);
  assert.match(service, /eq\(resourceLibraryTable\.status, "draft"\)/);
  assert.match(service, /eq\(resourceLibraryTable\.updatedAt, expectedUpdatedAt\)/);
  assert.match(service, /eq\(resourceRequestsTable\.status, "open"\)/);
  assert.match(schema, /value\.kind === "video"/);
  assert.match(schema, /value\.mimeType !== "application\/pdf"/);
  assert.match(service, /resource\.status !== "approved" \|\| resource\.visibility !== "public"/);
  assert.match(service, /eq\(leadsTable\.businessId, businessId\)/);
  assert.match(storage, /purpose:\s*z\.enum\(\["traffic_creative", "resource_library", "general"\]\)/);
  assert.match(storage, /wildcardPath\.startsWith\("resource-library\/"\)/);
  assert.match(routes, /profile-improvements\/proposals\/:id\/apply", requireOwner, requireRecentReauth/);
  assert.match(routes, /profile-improvements\/proposals\/:id\/reverse", requireOwner, requireRecentReauth/);
  assert.match(routes, /resources\/:id\/send", requireOwner, requireRecentReauth/);
});