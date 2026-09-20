import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(apiDir, "../..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("chat, voice and owner assistant consume one explicitly tenant-scoped brain", async () => {
  const [brain, leads, voice, assistant] = await Promise.all([
    read("artifacts/api-server/src/services/businessBrain.ts"),
    read("artifacts/api-server/src/services/leads.ts"),
    read("artifacts/api-server/src/routes/callFunnelWs.ts"),
    read("artifacts/api-server/src/services/assistant.ts"),
  ]);

  assert.match(brain, /businessId explícito é obrigatório/);
  assert.match(brain, /eq\(businessKnowledgeTable\.businessId, businessId\)/);
  assert.match(brain, /getBusinessProfileStrict\(businessId\)/);
  assert.doesNotMatch(brain, /FIXED_PROFILE_ID|getOrCreateProfile/);
  assert.match(leads, /loadBusinessBrain\(businessId, \{ leadId, query: userMessage \}\)/);
  assert.match(voice, /loadBusinessBrain\(config\.businessId, \{ leadId: lead\.id \}\)/);
  assert.match(assistant, /loadBusinessBrain\(businessId, \{ query: userMessage, includeMemory: true \}\)/);
  assert.match(leads, /eq\(ordersTable\.businessId, businessId\)/);
});

test("knowledge stays proposed until a recently authenticated owner reviews an immutable version", async () => {
  const [schema, service, routes, migration] = await Promise.all([
    read("lib/db/src/schema/businessBrain.ts"),
    read("artifacts/api-server/src/services/businessBrain.ts"),
    read("artifacts/api-server/src/routes/businessScoped.ts"),
    read("lib/db/migrations/0018_add_business_brain.sql"),
  ]);

  assert.match(schema, /"proposed" \| "approved" \| "rejected" \| "archived"/);
  assert.match(schema, /business_knowledge_version_unique/);
  assert.match(schema, /"owner_only" \| "visitor_safe"/);
  assert.match(schema, /default\("owner_only"\)/);
  assert.match(service, /status: "proposed"/);
  assert.match(service, /entry\.visibility === "visitor_safe"/);
  assert.match(service, /eq\(businessKnowledgeTable\.status, "proposed"\)/);
  assert.match(service, /status: "archived"/);
  assert.match(routes, /router\.post\("\/brain\/knowledge\/:id\/review", requireOwner, requireRecentReauth/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "business_knowledge"/);
});

test("authoritative classes have independent query budgets so memories cannot evict facts", async () => {
  const service = await read("artifacts/api-server/src/services/businessBrain.ts");
  assert.match(service, /eq\(businessKnowledgeTable\.kind, "fact"\)[\s\S]*?\.limit\(30\)/);
  assert.match(service, /eq\(businessKnowledgeTable\.kind, "interaction_memory"\)[\s\S]*?\.limit\(24\)/);
  assert.match(service, /eq\(businessKnowledgeTable\.kind, "marketing_playbook"\)[\s\S]*?\.limit\(1\)/);
});

test("memory has retention and provenance while marketing guidance remains versioned advice", async () => {
  const brain = await read("artifacts/api-server/src/services/businessBrain.ts");

  assert.match(brain, /INTERACTION_MEMORY_RETENTION_DAYS = 90/);
  assert.match(brain, /redactMemoryPii/);
  assert.match(brain, /kind: "interaction_memory"/);
  assert.match(brain, /MEMÓRIA OBSERVACIONAL — útil como contexto, nunca substitui factos/);
  assert.match(brain, /version: "2026\.09"/);
  assert.match(brain, /reviewedAt: "2026-09-20"/);
  assert.match(brain, /support\.google\.com\/google-ads/);
  assert.match(brain, /facebook\.com\/business\/help/);
  assert.match(brain, /PLAYBOOK DE MARKETING — orientação, não factos do negócio/);
});

test("evaluations cover grounding, tenant isolation, injection, PII and latency without raw prompts", async () => {
  const [schema, brain] = await Promise.all([
    read("lib/db/src/schema/businessBrain.ts"),
    read("artifacts/api-server/src/services/businessBrain.ts"),
  ]);

  for (const dimension of ["grounded", "tenantSafe", "injectionSafe", "piiSafe"]) {
    assert.match(schema, new RegExp(`${dimension}: boolean`));
  }
  assert.match(schema, /latencyMs: integer\("latency_ms"\)/);
  assert.match(brain, /createHash\("sha256"\)/);
  assert.doesNotMatch(schema, /rawPrompt|rawInput|transcript/);
  assert.match(brain, /channel: "chat" \| "voice" \| "owner_assistant" \| "post_call"/);
});