import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "linkealls-launch-scope-"));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("network must not be used by launch-scope tests");
};
const routeModulePath = path.join(tempDir, "scoped-router.mjs");
const serviceModulePath = path.join(tempDir, "campaign-services.mjs");
const routeFixturePath = path.join(tempDir, "route-fixture.mjs");
const serviceFixturePath = path.join(tempDir, "service-fixture.mjs");
const routeEntryPath = path.join(tempDir, "route-entry.mjs");

await writeFile(routeFixturePath, `
import { z } from "zod/v4";
export const state = {
  auth: 0, reauth: 0, campaignMutation: 0, targeting: 0,
  control: [], daily: 0, stale: 0,
};
export function reset() {
  state.auth = 0; state.reauth = 0; state.campaignMutation = 0;
  state.targeting = 0; state.control = []; state.daily = 0; state.stale = 0;
}

const schema = z.any();
export const createCampaignSchema = schema;
export const updateCampaignSchema = schema;
export const campaignSetupSchema = schema;
export const createTrafficCreativeSchema = schema;
export const updateTrafficCreativeSchema = schema;
export const updateBusinessProfileSchema = schema;
export const leadOriginSchema = schema;
export const chatMessageSchema = schema;
export const updateLeadStateSchema = schema;
export const sendAssistantMessageSchema = schema;
export const confirmActionSchema = schema;
export const proposeBusinessKnowledgeSchema = schema;
export const reviewBusinessKnowledgeSchema = schema;
export const aoPhoneSchema = schema;
export const db = new Proxy({}, { get() { return () => { throw new Error("live database must not be used"); }; } });
export const businessProfilesTable = {};

export async function getProfileBySlug(slug) { return { id: 41, slug }; }
export async function getUserByToken() { state.auth++; return { handle: "owner" }; }
export function requestToken() { return "test-session"; }
export async function hasRecentSensitiveAuth() { state.reauth++; return true; }
export function createPaymentsScopedRouter() { return (_req, _res, next) => next(); }

const existing = {
  id: "existing", businessId: 41, name: "Histórico", paymentStatus: "pago",
  publishStatus: "nao_publicada", status: "rascunho", totalSpend: 1200,
};
export async function listCampaigns() { return [existing]; }
export async function getCampaign() { return existing; }
export async function getCampaignMetrics() { return { campaignId: "existing", totalSpend: 1200 }; }
export async function listTrafficCreatives() { return []; }
export async function createTrafficCreative() { return {}; }
export async function updateTrafficCreative() { return {}; }
export async function resolvePublicTrafficCreative() { return null; }
export async function getTrafficCreativeBySlug() { return null; }
export function publicTrafficCreativeContext() { return {}; }
export async function createCampaign() { state.campaignMutation++; return existing; }
export async function duplicateCampaign() { state.campaignMutation++; return existing; }
export async function deleteCampaign() { state.campaignMutation++; return true; }
export async function updateCampaign() { state.campaignMutation++; return existing; }
export async function updateCampaignSetup() { state.campaignMutation++; return existing; }
export async function generateCampaignKit() { state.campaignMutation++; return existing; }
export async function generateOptimizationSuggestions() { state.campaignMutation++; return []; }
export async function payCampaignFromWallet() { state.campaignMutation++; return existing; }
export async function payCampaignWithMulticaixa() { state.campaignMutation++; return existing; }
export async function publishCampaign() { state.campaignMutation++; return existing; }
export async function analyzeCampaignImage() { state.campaignMutation++; return {}; }
export async function startCreativeGeneration() { state.campaignMutation++; return existing; }
export async function searchMetaTargeting() { state.targeting++; return []; }
export async function controlCampaignAd(_id, _businessId, action) {
  state.control.push(action);
  return { ...existing, publishStatus: action === "end" ? "encerrada" : "pausada" };
}
export const CAMPAIGN_MIN_BUDGET_AOA = 5000;
export const IS_ZERNIO_SIMULATION = true;
export function effectiveAoaPerUsd() { return 900; }
export function aoaToWholeUsd() { return 5; }
export class PaymentError extends Error { constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; } }
export class CampaignDeleteError extends Error { statusCode = 409; }
export class CampaignLockedError extends Error { statusCode = 409; }

export async function proactiveDailySummary() { state.daily++; return { id: "daily" }; }
export async function proactiveStaleLeads() { state.stale++; return { id: "stale" }; }
export const logger = { error() {}, warn() {}, info() {} };
export function broadcastAssistantMessage() {}
export function subscribeToAssistantMessages() { return () => {}; }
export async function listMessages() { return []; }
export async function clearMessages() {}
export async function chat() { return {}; }
export async function confirmAction() { return {}; }
export async function listBusinessKnowledge() { return []; }
export async function listBusinessAiEvaluations() { return []; }
export async function proposeBusinessKnowledge() { return {}; }
export async function reviewBusinessKnowledge() { return {}; }

export async function getOrCreateProfile() { return { name: "", offerings: [] }; }
export function isProfileFilled() { return true; }
export async function updateProfile() {}
export async function startSiteAnalysis() {}
export async function assistFromDescription() {}
export class StartAnalysisError extends Error { statusCode = 400; }
export async function createLead() {}
export async function createOrReuseTrafficLead() {}
export async function getLead() {}
export async function listLeads() { return []; }
export async function updateLeadState() {}
export async function chatWithLead() {}
export async function appendOwnerReply() {}
export function subscribeToLeadQualified() { return () => {}; }
export async function getLeadsAnalytics() { return {}; }
export async function claimTrafficWelcome() { return null; }
export async function finishTrafficWelcome() {}
export async function captureLeadContact() {}
export async function recordLeadWhatsAppClick() { return false; }
export function normalizeAngolanMobilePhone() { return null; }
export function leadContactView() { return { status: "pending", phone: null, purpose: null, capturedAt: null }; }
export function buildWhatsAppHandoff() { return null; }
export function ownerLeadView(value) { return value; }
export function getVapidPublicKey() { return ""; }
export async function saveSubscription() {}
export async function removeSubscription() {}
export async function getCatalogAnalytics() { return {}; }
export function withOfferingAnalyticsKey(value) { return value; }
export function clientIp() { return "127.0.0.1"; }
export async function hashPin() { return ""; }
export async function verifyPin() { return { valid: true, needsUpgrade: false }; }
export async function consumeSharedRateLimit() { return true; }
export function issueConversationCapability() { return ""; }
export function verifyVisitorCapability() {}
export function visitorTokenFromAuthorization() { return ""; }
export class VisitorCapabilityError extends Error {}
export const VISITOR_RECOVERY_TTL_MS = 604800000;
export function createVisitorRecoveryFamily() { return { familyId: "00000000-0000-4000-8000-000000000001", expiresAt: new Date() }; }
export function readCookie() { return null; }
export async function revokeVisitorRecovery() {}
export async function rotateVisitorRecovery() { return null; }
export function visitorRecoveryCookieName() { return "test-recovery"; }
export function visitorRecoveryTokenForLead() { return "test-recovery-token"; }
`, "utf8");

await writeFile(serviceFixturePath, `
export const state = { db: 0, provider: 0 };
export function reset() { state.db = 0; state.provider = 0; }
const failDb = () => { state.db++; throw new Error("live database must not be used"); };
export const db = new Proxy({}, { get() { return failDb; } });
const table = new Proxy({}, { get(_target, prop) { return String(prop); } });
export const campaignsTable = table;
export const campaignPaymentAttemptsTable = table;
export const walletLedgerTable = table;
export const businessProfilesTable = table;
export const leadsTable = table;
export function and(...args) { return args; }
export function eq(...args) { return args; }
export function sql() { return ""; }
export function isNotNull(value) { return value; }
export function inArray(...args) { return args; }
export function desc(value) { return value; }
export class PaymentError extends Error { constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; } }
export function newMerchantTransactionId() { return "test"; }
export async function createGpoCharge() { state.provider++; throw new Error("provider must not be used"); }
export const IS_SIMULATION = true;
export const IS_ZERNIO_SIMULATION = true;
export function isChannelConfigured() { return true; }
export async function createAd() { state.provider++; throw new Error("provider must not be used"); }
export async function setAdStatus() { state.provider++; throw new Error("provider must not be used"); }
export async function cancelAd() { state.provider++; throw new Error("provider must not be used"); }
export async function getAd() { state.provider++; throw new Error("provider must not be used"); }
export async function searchMetaTargeting() { state.provider++; throw new Error("provider must not be used"); }
export async function sendPushToOwner() {}
export const logger = { error() {}, warn() {}, info() {} };
export function utcIntervalRunKey() { return ""; }
export async function withScheduledJobLock() {}
export function effectiveAoaPerUsd() { return 900; }
export function aoaToWholeUsd() { return 5; }
export async function getOrCreateProfile() { state.db++; throw new Error("database must not be used"); }
export async function listLeads() { state.db++; throw new Error("database must not be used"); }
export const ai = { models: { generateContent() { state.provider++; throw new Error("AI must not be used"); } } };
export class GoogleGenAI {}
export const Modality = {};
export const Type = { OBJECT: "object", STRING: "string", ARRAY: "array", INTEGER: "integer" };
export class ObjectStorageService {}
export const META_AD_POLICY_PROMPT = "";
export const META_AD_POLICY_VERSION = "test";
`, "utf8");

const routeStubPattern = /^(?:@workspace\/db|\.\.\/(?:services|lib|routes)\/[^/]+\.js|\.\/(?:userAuth|paymentsScoped)\.js)$/;
await writeFile(routeEntryPath, `
export { createBusinessScopedRouter } from ${JSON.stringify(path.join(apiServerDir, "src/routes/businessScoped.ts"))};
export { state, reset } from ${JSON.stringify(routeFixturePath)};
`, "utf8");
await build({
  entryPoints: [routeEntryPath],
  bundle: true,
  format: "esm",
  platform: "node",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  nodePaths: [path.join(apiServerDir, "node_modules"), path.resolve(apiServerDir, "../../node_modules")],
  outfile: routeModulePath,
  logLevel: "silent",
  plugins: [{
    name: "launch-route-boundaries",
    setup(api) {
      api.onResolve({ filter: routeStubPattern }, (args) =>
        args.path.endsWith("/launchPolicy.js") ? undefined : { path: routeFixturePath }
      );
    },
  }],
});

const serviceEntryPath = path.join(tempDir, "service-entry.mjs");
await writeFile(serviceEntryPath, `
export {
  createCampaign, duplicateCampaign, deleteCampaign, updateCampaign,
  updateCampaignSetup, generateCampaignKit, generateOptimizationSuggestions,
} from ${JSON.stringify(path.join(apiServerDir, "src/services/campaigns.ts"))};
export {
  payCampaignFromWallet, payCampaignWithMulticaixa, publishCampaign, controlCampaignAd,
} from ${JSON.stringify(path.join(apiServerDir, "src/services/campaignAds.ts"))};
export { analyzeCampaignImage, startCreativeGeneration } from ${JSON.stringify(path.join(apiServerDir, "src/services/adCreatives.ts"))};
export { state, reset } from ${JSON.stringify(serviceFixturePath)};
`, "utf8");

const serviceStubPattern = /^(?:@workspace\/(?:db|integrations-gemini-ai)|@google\/genai|drizzle-orm|\.\/(?:businessProfile|leads|payments|ekwanza|zernio|fx|notifications|metaAdPolicies)\.js|\.\.\/lib\/(?:logger|scheduledJobLock|objectStorage)\.js)$/;
const serviceBuild = await build({
  entryPoints: [serviceEntryPath],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: serviceModulePath,
  metafile: true,
  logLevel: "silent",
  plugins: [{
    name: "launch-service-boundaries",
    setup(api) {
      api.onResolve({ filter: serviceStubPattern }, () => ({ path: serviceFixturePath }));
    },
  }],
});
if (Object.keys(serviceBuild.metafile.inputs).some((input) =>
  /(?:^|\/)lib\/db\/|node_modules\/(?:pg|postgres)\//.test(input)
)) {
  throw new Error("Launch tests must not import a real database implementation");
}

const routeModule = await import(pathToFileURL(routeModulePath).href);
const services = await import(pathToFileURL(serviceModulePath).href);
after(async () => {
  globalThis.fetch = originalFetch;
  await rm(tempDir, { recursive: true, force: true });
});

function findRoute(router, method, routePath) {
  const layer = router.stack.find((item) =>
    item.route?.path === routePath && item.route.methods?.[method]
  );
  assert.ok(layer, `${method.toUpperCase()} ${routePath} must be registered`);
  return layer.route;
}

async function invokeRoute(route, { body = {}, query = {}, params = {} } = {}) {
  const req = {
    body, query, params: { businessSlug: "owner", id: "existing", ...params },
    headers: {}, on() {}, log: { error() {}, warn() {}, info() {} },
  };
  const res = {
    locals: { businessId: 41 },
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader() {}, flushHeaders() {}, write() {},
  };
  const handlers = route.stack.map((layer) => layer.handle);
  async function dispatch(index) {
    if (index >= handlers.length) return;
    let nextPromise;
    await handlers[index](req, res, () => {
      nextPromise = dispatch(index + 1);
      return nextPromise;
    });
    if (nextPromise) await nextPromise;
  }
  await dispatch(0);
  return res;
}

const router = routeModule.createBusinessScopedRouter();

test("all scoped advertising entrypoints authenticate then fail before mutations or providers", async () => {
  const blocked = [
    ["post", "/campaigns", {}],
    ["patch", "/campaigns/:id", {}],
    ["patch", "/campaigns/:id/setup", {}],
    ["delete", "/campaigns/:id", {}],
    ["post", "/campaigns/:id/duplicate", {}],
    ["post", "/campaigns/:id/generate", {}],
    ["post", "/campaigns/:id/ai-recommendations", {}],
    ["get", "/campaigns/targeting/locations", {}],
    ["get", "/campaigns/targeting/interests", {}],
    ["get", "/campaigns/ads/quote", {}],
    ["post", "/campaigns/:id/pay", { method: "carteira" }],
    ["post", "/campaigns/:id/creative", {}],
    ["post", "/campaigns/:id/publish", {}],
    ["get", "/campaigns/:id/optimize", {}],
  ];

  for (const [method, routePath, body] of blocked) {
    routeModule.reset();
    const res = await invokeRoute(findRoute(router, method, routePath), { body });
    assert.equal(res.statusCode, 403, routePath);
    assert.equal(res.body?.code, "LAUNCH_FEATURE_PAUSED", routePath);
    assert.equal(routeModule.state.auth, 1, `${routePath} must authenticate first`);
    assert.equal(routeModule.state.campaignMutation, 0, routePath);
    assert.equal(routeModule.state.targeting, 0, routePath);
    assert.equal(routeModule.state.reauth, 0, `${routePath} guard must precede sensitive reauth`);
  }
});

test("campaign history, details and metrics remain authenticated and readable", async () => {
  for (const [routePath, expectedKey] of [
    ["/campaigns", "campaigns"],
    ["/campaigns/:id", "campaign"],
    ["/campaigns/:id/metrics", "metrics"],
  ]) {
    routeModule.reset();
    const res = await invokeRoute(findRoute(router, "get", routePath));
    assert.equal(res.statusCode, 200);
    assert.ok(res.body?.[expectedKey]);
    assert.equal(routeModule.state.auth, 1);
  }
  const detail = await invokeRoute(findRoute(router, "get", "/campaigns/:id"));
  assert.match(detail.body.launchNotice, /paga.*pendente de revisão/i);
});

test("pause and cancel remain available while resume is rejected without provider dispatch", async () => {
  for (const action of ["pause", "end"]) {
    routeModule.reset();
    const res = await invokeRoute(findRoute(router, "post", "/campaigns/:id/control"), { body: { action } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(routeModule.state.control, [action]);
  }
  routeModule.reset();
  const resume = await invokeRoute(findRoute(router, "post", "/campaigns/:id/control"), { body: { action: "resume" } });
  assert.equal(resume.statusCode, 403);
  assert.equal(resume.body.code, "LAUNCH_FEATURE_PAUSED");
  assert.deepEqual(routeModule.state.control, []);
});

test("daily summaries and stale reminders authenticate then fail before service execution", async () => {
  for (const routePath of ["/assistant/proactive/daily", "/assistant/proactive/stale"]) {
    routeModule.reset();
    const res = await invokeRoute(findRoute(router, "post", routePath));
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, "LAUNCH_FEATURE_PAUSED");
    assert.equal(routeModule.state.auth, 1);
    assert.equal(routeModule.state.daily + routeModule.state.stale, 0);
  }
});

test("direct campaign service entrypoints fail before any database, AI, or provider access", async () => {
  const calls = [
    () => services.createCampaign({ name: "Nova", platform: "meta", objective: "traffic", budget: 5000 }, 41),
    () => services.duplicateCampaign("existing", 41),
    () => services.deleteCampaign("existing", 41),
    () => services.updateCampaign("existing", { budget: 7000 }, 41),
    () => services.updateCampaignSetup("existing", {}, 41),
    () => services.generateCampaignKit("existing", 41),
    () => services.generateOptimizationSuggestions("existing", 41),
    () => services.payCampaignFromWallet("existing", 41),
    () => services.payCampaignWithMulticaixa("existing", 41, "923000000"),
    () => services.publishCampaign("existing", 41),
    () => services.controlCampaignAd("existing", 41, "resume"),
    () => services.analyzeCampaignImage("existing", 41),
    () => services.startCreativeGeneration("existing", 41),
  ];
  for (const call of calls) {
    services.reset();
    await assert.rejects(call, (error) =>
      error?.code === "LAUNCH_FEATURE_PAUSED" && error?.statusCode === 403
    );
    assert.equal(services.state.db, 0);
    assert.equal(services.state.provider, 0);
  }
});