import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbDir = path.resolve(apiServerDir, "../..", "lib/db");
const webDir = path.resolve(apiServerDir, "../ai-call-funnel");

test("traffic creative storage and schema are isolated from legacy paid campaigns", async () => {
  const storage = await readFile(path.join(apiServerDir, "src/routes/storage.ts"), "utf8");
  const schema = await readFile(path.join(dbDir, "src/schema/trafficCreatives.ts"), "utf8");
  const migration = await readFile(path.join(dbDir, "migrations/0014_add_traffic_creatives.sql"), "utf8");

  assert.match(storage, /traffic_creative/);
  assert.match(storage, /traffic-creatives\/\$\{parsed\.data\.businessSlug\}/);
  assert.match(storage, /video\/mp4/);
  assert.match(schema, /trafficCreativesTable/);
  assert.match(schema, /publicSlug: text\("public_slug"\)\.notNull\(\)\.unique\(\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "traffic_creatives"/);
  assert.doesNotMatch(migration, /campaigns/);
});

test("public traffic creative routes resolve server-owned context and visitor sessions validate the slug", async () => {
  const routes = await readFile(path.join(apiServerDir, "src/routes/businessScoped.ts"), "utf8");
  const leads = await readFile(path.join(dbDir, "src/schema/leads.ts"), "utf8");
  const entry = await readFile(path.join(webDir, "src/pages/PublicTraffic.tsx"), "utf8");
  const transition = await readFile(path.join(webDir, "src/lib/trafficConversation.ts"), "utf8");
  const chat = await readFile(path.join(webDir, "src/pages/Chat.tsx"), "utf8");

  assert.match(routes, /router\.get\("\/traffic-creatives\/:creativeSlug\/public"/);
  assert.match(routes, /resolvePublicTrafficCreative\(bid\(res\), String\(req\.params\.creativeSlug\)\)/);
  assert.match(routes, /getTrafficCreativeBySlug\(bid\(res\), trafficCreativeSlug\)/);
  assert.match(routes, /publicTrafficCreativeContext\(creative\)/);
  assert.match(leads, /trafficCreativeSlug/);
  assert.match(leads, /trafficCreative\?:/);
  assert.match(entry, /startTrafficConversation\(businessSlug, creative, window\.location\)/);
  assert.match(transition, /trafficCreativeSlug: creative\.slug/);
  assert.match(chat, /isRestoringSession/);
  assert.match(chat, /disabled=\{isBusy \|\| isRestoringSession\}/);
});

test("paid chat bootstrap is fenced and appends messages atomically", async () => {
  const service = await readFile(path.join(apiServerDir, "src/services/leads.ts"), "utf8");
  const schema = await readFile(path.join(dbDir, "src/schema/leads.ts"), "utf8");
  const routes = await readFile(path.join(apiServerDir, "src/routes/businessScoped.ts"), "utf8");
  const transition = await readFile(path.join(webDir, "src/lib/trafficConversation.ts"), "utf8");

  assert.match(schema, /uniqueIndex\("leads_traffic_click_unique"\)/);
  assert.match(schema, /trafficWelcomeClaimToken/);
  assert.match(service, /onConflictDoUpdate/);
  assert.match(service, /eq\(leadsTable\.trafficWelcomeClaimToken, options\.trafficWelcomeClaimToken\)/);
  assert.match(service, /chatMessages: sql`\$\{leadsTable\.chatMessages\} \|\|/);
  assert.match(routes, /trafficWelcomeClaimToken: claimToken/);
  assert.match(transition, /navigator\.locks\?\.request/);
});

test("consented lead contact stays separate from payment phones and WhatsApp URLs stay credential-free", async () => {
  const service = await readFile(path.join(apiServerDir, "src/services/leads.ts"), "utf8");
  const routes = await readFile(path.join(apiServerDir, "src/routes/businessScoped.ts"), "utf8");
  const leadSchema = await readFile(path.join(dbDir, "src/schema/leads.ts"), "utf8");
  const orderSchema = await readFile(path.join(dbDir, "src/schema/payments.ts"), "utf8");
  const visitor = await readFile(path.join(webDir, "src/lib/visitorAccess.ts"), "utf8");
  const chat = await readFile(path.join(webDir, "src/pages/Chat.tsx"), "utf8");
  const assistant = await readFile(path.join(apiServerDir, "src/services/assistant.ts"), "utf8");
  const payments = await readFile(path.join(apiServerDir, "src/services/payments.ts"), "utf8");

  assert.match(leadSchema, /contactConsentStatus/);
  assert.match(leadSchema, /contactPhone/);
  assert.match(orderSchema, /buyerPhone/);
  const captureBlock = service.slice(
    service.indexOf("export async function captureLeadContact"),
    service.indexOf("export async function recordLeadWhatsAppClick"),
  );
  assert.doesNotMatch(captureBlock, /buyerPhone|ordersTable/);
  assert.match(service, /normalizeAngolanMobilePhone/);
  assert.equal(service.includes('phone:    clampStr(qd["phone"]'), false);
  assert.doesNotMatch(payments, /phone:\s*(?:input\.phone|order\.buyerPhone)|paymentPhone:/);
  assert.doesNotMatch(assistant, /qualificationData\.phone/);
  assert.match(assistant, /contactConsentStatus !== "consented"/);
  assert.match(routes, /leads\.map\(ownerLeadView\)/);
  assert.match(service, /https:\/\/wa\.me\/\$\{phone\.slice\(1\)\}/);
  assert.match(routes, /router\.post\("\/leads\/:id\/contact"/);
  assert.match(routes, /router\.post\("\/leads\/:id\/whatsapp-click"/);
  assert.match(visitor, /Authorization: `Visitor \$\{access\.visitorToken\}`/);
  assert.doesNotMatch(chat, /function ContactCaptureCard/);
  assert.match(chat, /applyContactResult/);
  assert.match(service, /contactRequested: botRequestsWhatsApp/);
  assert.match(service, /const refusedContact = requestedContact && isContactRefusal/);
});
