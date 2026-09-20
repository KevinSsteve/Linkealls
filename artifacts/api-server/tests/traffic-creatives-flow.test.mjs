import assert from "node:assert/strict";
import test, { after } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "linkealls-traffic-flow-"));
const fixturePath = path.join(tempDir, "fixture.mjs");
const entryPath = path.join(tempDir, "entry.mjs");
const modulePath = path.join(tempDir, "router.mjs");

await writeFile(fixturePath, `
import { z } from "zod/v4";

const uuid = (suffix) => \`00000000-0000-4000-8000-\${String(suffix).padStart(12, "0")}\`;
const creative = (id, businessId, slug, mediaType, active = 1) => ({
  id: uuid(id), businessId, publicSlug: slug, description: \`\${mediaType} creative\`,
  objectPath: \`/objects/traffic-creatives/owner/\${uuid(id)}\`,
  mediaMimeType: mediaType === "video" ? "video/mp4" : "image/webp",
  mediaType, active, visitCount: 0, createdAt: new Date(), updatedAt: new Date(),
});

export const state = {
  creatives: [
    creative(1, 41, "image-link", "image"),
    creative(2, 41, "video-link", "video"),
    creative(3, 41, "paused-link", "image", 0),
    creative(4, 42, "other-business-link", "image"),
  ],
  leads: [],
  chats: [],
  ownerReplies: [],
};

const any = z.any();
export const createCampaignSchema = any;
export const updateCampaignSchema = any;
export const campaignSetupSchema = any;
export const updateBusinessProfileSchema = any;
export const updateLeadStateSchema = any;
export const sendAssistantMessageSchema = any;
export const confirmActionSchema = any;
export const proposeBusinessKnowledgeSchema = any;
export const reviewBusinessKnowledgeSchema = any;
export const profileChangeProposalInputSchema = any;
export const resourceRequestInputSchema = any;
export const resourceInputSchema = any;
export const aoPhoneSchema = any;
export const chatMessageSchema = z.object({
  role: z.enum(["user", "bot"]),
  text: z.string().max(4000),
  ts: z.string(),
});
export const leadOriginSchema = z.object({
  source: z.string().max(200).optional(),
  medium: z.string().max(200).optional(),
  campaign: z.string().max(200).optional(),
  content: z.string().max(200).optional(),
  term: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
  trafficCreativeSlug: z.string().regex(/^[a-z0-9-]{3,80}$/).optional(),
});
export const createTrafficCreativeSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  objectPath: z.string().startsWith("/objects/traffic-creatives/"),
  mediaMimeType: z.enum(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime"]),
});
export const updateTrafficCreativeSchema = z.object({
  description: z.string().trim().min(1).max(2000).optional(),
  active: z.boolean().optional(),
});

export const db = new Proxy({}, { get() { return () => { throw new Error("database must not be used"); }; } });
export const businessProfilesTable = {};
export async function getProfileBySlug(slug) {
  if (slug === "owner") return { id: 41, slug, name: "Loja Owner", phone: "+244 923 456 789" };
  if (slug === "other") return { id: 42, slug, name: "Loja Other", phone: "+244 924 000 000" };
  return null;
}
export async function getUserByToken() { return { handle: "owner" }; }
export function requestToken() { return "session"; }
export async function hasRecentSensitiveAuth() { return true; }
export function createPaymentsScopedRouter() { return (_req, _res, next) => next(); }
export async function consumeSharedRateLimit() { return true; }
export function clientIp() { return "127.0.0.1"; }

export async function listTrafficCreatives(businessId) {
  return state.creatives.filter((item) => item.businessId === businessId);
}
export async function createTrafficCreative(input, businessId) {
  const item = creative(state.creatives.length + 10, businessId, \`created-\${state.creatives.length}\`, input.mediaMimeType.startsWith("video/") ? "video" : "image");
  item.description = input.description;
  item.objectPath = input.objectPath;
  item.mediaMimeType = input.mediaMimeType;
  state.creatives.push(item);
  return item;
}
export async function updateTrafficCreative(id, patch, businessId) {
  const item = state.creatives.find((candidate) => candidate.id === id && candidate.businessId === businessId);
  if (!item) return null;
  if (patch.active !== undefined) item.active = patch.active ? 1 : 0;
  return item;
}
export async function resolvePublicTrafficCreative(businessId, slug) {
  const item = state.creatives.find((candidate) =>
    candidate.businessId === businessId && candidate.publicSlug === slug && candidate.active === 1
  );
  if (!item) return null;
  item.visitCount += 1;
  return {
    id: item.id, slug: item.publicSlug, description: item.description,
    mediaType: item.mediaType, mediaMimeType: item.mediaMimeType,
    mediaUrl: \`/api/storage\${item.objectPath}\`, visitCount: item.visitCount,
  };
}
export async function getTrafficCreativeBySlug(businessId, slug) {
  return state.creatives.find((item) => item.businessId === businessId && item.publicSlug === slug) ?? null;
}
export function publicTrafficCreativeContext(item) {
  return {
    id: item.id, slug: item.publicSlug, description: item.description, mediaType: item.mediaType,
    mediaMimeType: item.mediaMimeType, mediaUrl: \`/api/storage\${item.objectPath}\`,
  };
}

export async function createLead(origin, chatMessages, businessId, session = {}) {
  const lead = {
    id: uuid(100 + state.leads.length), businessId, origin, chatMessages, createdAt: new Date(),
    contactPhone: null, contactPurpose: null, contactConsentStatus: "pending",
    contactConsentedAt: null, contactCapturedAt: null, whatsappClickCount: 0,
    ...session,
  };
  state.leads.push(lead);
  return lead;
}
export async function createOrReuseTrafficLead(origin, chatMessages, businessId, trafficClickKey, recovery) {
  const retryWindowStart = Date.now() - 15_000;
  for (const lead of state.leads) {
    if (
      lead.businessId === businessId &&
      lead.trafficClickKey === trafficClickKey &&
      lead.createdAt.getTime() < retryWindowStart
    ) lead.trafficClickKey = null;
  }
  const existing = state.leads.find((lead) =>
    lead.businessId === businessId && lead.trafficClickKey === trafficClickKey
  );
  if (existing) return existing;
  return createLead(origin, chatMessages, businessId, {
    trafficClickKey,
    visitorRecoveryFamilyId: recovery.familyId,
    visitorRecoveryExpiresAt: recovery.expiresAt,
    trafficWelcomeStatus: "pending",
  });
}
export async function getLead(id, businessId) {
  return state.leads.find((lead) => lead.id === id && (businessId === undefined || lead.businessId === businessId)) ?? null;
}
export async function chatWithLead(id, message, businessId) {
  const lead = await getLead(id, businessId);
  if (!lead) throw new Error("lead missing");
  state.chats.push({ id, message, businessId });
  return {
    reply: "Encontrei este produto no catálogo.",
    products: [{ name: "Produto real", price: "1000 Kz", description: "Do catálogo" }],
  };
}
export async function appendOwnerReply(id, message, businessId) {
  const lead = await getLead(id, businessId);
  if (!lead) throw new Error("lead missing");
  state.ownerReplies.push({ id, message, businessId });
  return lead;
}
export async function listLeads() { return state.leads; }
export async function updateLeadState() {}
export function subscribeToLeadQualified() { return () => {}; }
export async function getLeadsAnalytics() { return {}; }
export async function claimTrafficWelcome() { return "00000000-0000-4000-8000-000000000999"; }
export async function finishTrafficWelcome() {}
export function normalizeAngolanMobilePhone(value) {
  const digits = value.trim().replace(/\\D/g, "").replace(/^00/, "");
  const local = digits.startsWith("244") ? digits.slice(3) : digits;
  return /^9[1-5]\\d{7}$/.test(local) ? \`+244\${local}\` : null;
}
export function leadContactView(lead) {
  return {
    status: lead.contactConsentStatus,
    phone: lead.contactPhone,
    purpose: lead.contactPurpose,
    capturedAt: lead.contactCapturedAt,
  };
}
export function ownerLeadView(lead) {
  const { phone, ...qualificationData } = lead.qualificationData ?? {};
  return {
    ...lead,
    contactPhone: lead.contactConsentStatus === "consented" ? lead.contactPhone : null,
    qualificationData,
    whatsappMessage: lead.contactConsentStatus === "consented" ? lead.whatsappMessage : null,
  };
}
export function buildWhatsAppHandoff(phone, businessName, description) {
  const normalized = normalizeAngolanMobilePhone(phone ?? "");
  if (!normalized) return null;
  const text = \`Olá \${businessName}, vim da Linkealls sobre o anúncio “\${description}” e quero continuar o atendimento.\`;
  return { phone: normalized, url: \`https://wa.me/\${normalized.slice(1)}?text=\${encodeURIComponent(text)}\` };
}
export async function captureLeadContact(id, businessId, input) {
  const lead = await getLead(id, businessId);
  if (!lead) return null;
  lead.contactPurpose = "business_follow_up";
  lead.contactCapturedAt = new Date();
  lead.contactConsentStatus = input.action === "consent" ? "consented" : "declined";
  lead.contactPhone = input.action === "consent" ? input.phone : null;
  return lead;
}
export async function recordLeadWhatsAppClick(id, businessId) {
  const lead = await getLead(id, businessId);
  if (!lead || lead.contactConsentStatus !== "consented") return false;
  lead.whatsappClickCount += 1;
  lead.whatsappClickedAt = new Date();
  return true;
}

export const VISITOR_RECOVERY_TTL_MS = 604800000;
export function createVisitorRecoveryFamily() {
  return { familyId: uuid(999), expiresAt: new Date(Date.now() + VISITOR_RECOVERY_TTL_MS) };
}
export function visitorRecoveryTokenForLead(_businessId, lead) {
  return \`recovery-\${lead.id}\`;
}
export function createVisitorRecoveryCredentials() {
  return { token: "recovery-token", hash: "recovery-hash", expiresAt: new Date(Date.now() + VISITOR_RECOVERY_TTL_MS) };
}
export function visitorRecoveryCookieName(slug) { return \`linkealls_visitor_\${slug}\`; }
export function readCookie() { return null; }
export async function rotateVisitorRecovery() { return null; }
export async function revokeVisitorRecovery() {}

export function issueConversationCapability(businessId, leadId) { return \`cap-\${businessId}-\${leadId}\`; }
export function visitorTokenFromAuthorization(value) { return value?.startsWith("Visitor ") ? value.slice(8) : null; }
export function verifyVisitorCapability(token, expected) {
  if (token !== \`cap-\${expected.businessId}-\${expected.leadId}\`) throw new VisitorCapabilityError();
  return expected;
}
export class VisitorCapabilityError extends Error {}

export async function getOrCreateProfile(businessId) {
  return {
    id: businessId, slug: businessId === 41 ? "owner" : "other", name: "Loja",
    avatarUrl: null, sector: "Comércio", description: "Loja de teste",
    differentials: [], publicLinks: [], faq: [], catalogEnabled: true, catalogSlug: null,
    offerings: [{ name: "Produto real", price: "1000 Kz", description: "Do catálogo" }],
  };
}
export function withOfferingAnalyticsKey(value) { return value; }
export function isProfileFilled() { return true; }
export async function updateProfile() {}
export async function getCatalogAnalytics() { return {}; }
export async function listBusinessKnowledge() { return []; }
export async function listBusinessAiEvaluations() { return []; }
export async function proposeBusinessKnowledge() { return {}; }
export async function reviewBusinessKnowledge() { return {}; }
export async function assessProfileGaps() { return []; }
export async function createProfileChangeProposal() { return {}; }
export async function listProfileChangeProposals() { return []; }
export async function reviewProfileChangeProposal() { return {}; }
export async function adjustProfileChangeProposal() { return {}; }
export async function reopenProfileChangeProposal() { return {}; }
export async function applyProfileChangeProposal() { return {}; }
export async function reverseProfileChangeProposal() { return {}; }
export async function createResourceRequest() { return {}; }
export async function listResourceRequests() { return []; }
export async function createResource() { return {}; }
export async function updateResource() { return {}; }
export async function listResources() { return []; }
export async function approveResource() { return {}; }
export async function reviewResource() { return {}; }
export async function updateResourceRequestStatus() { return {}; }
export async function deliverResource() { return {}; }
export class ProfileImprovementError extends Error {}

export async function getCampaign() {}
export async function listCampaigns() { return []; }
export async function getCampaignMetrics() { return {}; }
export async function createCampaign() {}
export async function duplicateCampaign() {}
export async function deleteCampaign() {}
export async function updateCampaign() {}
export async function updateCampaignSetup() {}
export async function generateCampaignKit() {}
export async function generateOptimizationSuggestions() { return []; }
export class CampaignDeleteError extends Error {}
export class CampaignLockedError extends Error {}
export async function payCampaignFromWallet() {}
export async function payCampaignWithMulticaixa() {}
export async function publishCampaign() {}
export async function controlCampaignAd() {}
export const CAMPAIGN_MIN_BUDGET_AOA = 5000;
export async function analyzeCampaignImage() {}
export async function startCreativeGeneration() {}
export function effectiveAoaPerUsd() { return 900; }
export function aoaToWholeUsd() { return 1; }
export const IS_ZERNIO_SIMULATION = true;
export async function searchMetaTargeting() { return []; }
export class PaymentError extends Error {}

export async function startSiteAnalysis() {}
export async function assistFromDescription() {}
export class StartAnalysisError extends Error {}
export async function chat() {}
export async function listMessages() { return []; }
export async function clearMessages() {}
export async function confirmAction() {}
export function subscribeToAssistantMessages() { return () => {}; }
export function broadcastAssistantMessage() {}
export async function proactiveDailySummary() {}
export async function proactiveStaleLeads() {}
export function getVapidPublicKey() { return ""; }
export async function saveSubscription() {}
export async function removeSubscription() {}
export async function hashPin() { return ""; }
export async function verifyPin() { return { valid: true, needsUpgrade: false }; }
export const logger = { error() {}, warn() {}, info() {} };
`, "utf8");

await writeFile(entryPath, `
export { createBusinessScopedRouter } from ${JSON.stringify(path.join(apiServerDir, "src/routes/businessScoped.ts"))};
export { state } from ${JSON.stringify(fixturePath)};
`, "utf8");

const stubPattern = /^(?:@workspace\/db|\.\.\/(?:services|lib|routes)\/[^/]+\.js|\.\/(?:userAuth|paymentsScoped)\.js)$/;
await build({
  entryPoints: [entryPath],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: modulePath,
  logLevel: "silent",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  nodePaths: [path.join(apiServerDir, "node_modules"), path.resolve(apiServerDir, "../../node_modules")],
  plugins: [{
    name: "traffic-flow-boundaries",
    setup(api) {
      api.onResolve({ filter: stubPattern }, (args) =>
        args.path.endsWith("/launchPolicy.js") ? undefined : { path: fixturePath }
      );
    },
  }],
});

const { createBusinessScopedRouter, state } = await import(pathToFileURL(modulePath).href);
const router = createBusinessScopedRouter();
after(async () => rm(tempDir, { recursive: true, force: true }));

function findRoute(method, routePath) {
  const layer = router.stack.find((item) => item.route?.path === routePath && item.route.methods?.[method]);
  assert.ok(layer, `${method.toUpperCase()} ${routePath} must be registered`);
  return layer.route;
}

async function invoke(method, routePath, {
  body = {}, params = {}, businessId = 41, authorization,
} = {}) {
  const route = findRoute(method, routePath);
  const req = {
    body,
    query: {},
    params: { businessSlug: businessId === 41 ? "owner" : "other", ...params },
    headers: authorization ? { authorization } : {},
    on() {},
    log: { error() {}, warn() {}, info() {} },
  };
  const res = {
    locals: {
      businessId,
      businessProfile: businessId === 41
        ? { id: 41, name: "Loja Owner", phone: "+244 923 456 789" }
        : { id: 42, name: "Loja Other", phone: "+244 924 000 000" },
    },
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    cookie() { return this; },
    clearCookie() { return this; },
    end() { return this; },
    setHeader() {},
    flushHeaders() {},
    write() {},
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

test("owner can create isolated image and video traffic links", async () => {
  for (const [mediaMimeType, expectedType, suffix] of [
    ["image/webp", "image", "image-upload"],
    ["video/mp4", "video", "video-upload"],
  ]) {
    const response = await invoke("post", "/traffic-creatives", {
      body: {
        description: `${expectedType} promotion`,
        objectPath: `/objects/traffic-creatives/owner/${suffix}`,
        mediaMimeType,
      },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.creative.mediaType, expectedType);
    assert.equal(response.body.creative.businessId, 41);
  }
});

test("public image and video links resolve only inside their business", async () => {
  for (const [slug, mediaType] of [["image-link", "image"], ["video-link", "video"]]) {
    const response = await invoke("get", "/traffic-creatives/:creativeSlug/public", {
      params: { creativeSlug: slug },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.creative.mediaType, mediaType);
  }

  for (const slug of ["paused-link", "missing-link", "other-business-link"]) {
    const response = await invoke("get", "/traffic-creatives/:creativeSlug/public", {
      params: { creativeSlug: slug },
    });
    assert.equal(response.statusCode, 404);
  }
});

test("UTMs and trusted creative context stay on one lead through catalog chat and human reply", async () => {
  const before = state.leads.length;
  const created = await invoke("post", "/leads/session", {
    body: {
      origin: {
        source: "meta",
        medium: "paid",
        campaign: "ignored-browser-label",
        content: "variant-a",
        term: "electric",
        trafficCreativeSlug: "image-link",
      },
      chatMessages: [],
      trafficClickKey: "00000000-0000-4000-8000-000000000777",
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(state.leads.length, before + 1);

  const lead = state.leads.at(-1);
  assert.deepEqual(lead.origin, {
    source: "meta",
    medium: "paid",
    campaign: "ignored-browser-label",
    content: "variant-a",
    term: "electric",
    trafficCreative: {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "image-link",
      description: "image creative",
      mediaType: "image",
      mediaMimeType: "image/webp",
      mediaUrl: "/api/storage/objects/traffic-creatives/owner/00000000-0000-4000-8000-000000000001",
    },
  });

  const authorization = `Visitor ${created.body.visitorToken}`;
  const chat = await invoke("post", "/leads/:id/chat", {
    params: { id: lead.id },
    body: { message: "Que produtos têm?" },
    authorization,
  });
  assert.equal(chat.statusCode, 200);
  assert.equal(chat.body.products[0].name, "Produto real");
  assert.equal(state.leads.length, before + 1, "chat must continue the attributed lead");

  const human = await invoke("post", "/leads/:id/owner-reply", {
    params: { id: lead.id },
    body: { message: "Um consultor vai continuar contigo." },
  });
  assert.equal(human.statusCode, 200);
  assert.equal(state.ownerReplies.at(-1).id, lead.id);
  assert.equal(state.leads.length, before + 1, "human handoff must not create a second lead");
});

test("concurrent retries with the same paid-click key reuse one lead", async () => {
  const before = state.leads.length;
  const body = {
    origin: { source: "meta", trafficCreativeSlug: "video-link" },
    chatMessages: [],
    trafficClickKey: "00000000-0000-4000-8000-000000000778",
  };
  const [first, second] = await Promise.all([
    invoke("post", "/leads/session", { body }),
    invoke("post", "/leads/session", { body }),
  ]);

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 201);
  assert.equal(first.body.leadId, second.body.leadId);
  assert.equal(state.leads.length, before + 1);
});

test("visitor consents to a normalized contact and opens an attributed WhatsApp handoff", async () => {
  const opened = await invoke("post", "/leads/session", {
    body: {
      origin: { source: "meta", trafficCreativeSlug: "image-link" },
      chatMessages: [],
      trafficClickKey: "00000000-0000-4000-8000-000000000880",
    },
  });
  const authorization = `Visitor ${opened.body.visitorToken}`;
  const invalid = await invoke("post", "/leads/:id/contact", {
    params: { id: opened.body.leadId },
    authorization,
    body: { action: "consent", phone: "123" },
  });
  assert.equal(invalid.statusCode, 400);

  const captured = await invoke("post", "/leads/:id/contact", {
    params: { id: opened.body.leadId },
    authorization,
    body: { action: "consent", phone: "923 111 222" },
  });
  assert.equal(captured.statusCode, 200);
  assert.equal(captured.body.contact.phone, "+244923111222");
  assert.equal(captured.body.contact.purpose, "business_follow_up");
  assert.equal(captured.body.contact.status, "consented");
  assert.match(captured.body.whatsappHandoff.url, /^https:\/\/wa\.me\/244923456789\?text=/);
  assert.doesNotMatch(captured.body.whatsappHandoff.url, /00000000|cap-|923111222/);

  const clicked = await invoke("post", "/leads/:id/whatsapp-click", {
    params: { id: opened.body.leadId },
    authorization,
  });
  assert.equal(clicked.statusCode, 204);
  const lead = state.leads.find((item) => item.id === opened.body.leadId);
  assert.equal(lead.whatsappClickCount, 1);
  assert.equal(lead.origin.trafficCreative.slug, "image-link");
});

test("contact access is business-scoped and visitors may decline without blocking chat", async () => {
  const opened = await invoke("post", "/leads/session", {
    body: { origin: {}, chatMessages: [] },
  });
  const authorization = `Visitor ${opened.body.visitorToken}`;
  const crossTenant = await invoke("post", "/leads/:id/contact", {
    businessId: 42,
    params: { id: opened.body.leadId },
    authorization,
    body: { action: "consent", phone: "923111222" },
  });
  assert.equal(crossTenant.statusCode, 401);

  const declined = await invoke("post", "/leads/:id/contact", {
    params: { id: opened.body.leadId },
    authorization,
    body: { action: "decline" },
  });
  assert.equal(declined.statusCode, 200);
  assert.equal(declined.body.contact.status, "declined");
  assert.equal(declined.body.contact.phone, null);
  assert.equal(declined.body.whatsappHandoff, null);

  const chat = await invoke("post", "/leads/:id/chat", {
    params: { id: opened.body.leadId },
    authorization,
    body: { message: "Quero continuar sem partilhar o número" },
  });
  assert.equal(chat.statusCode, 200);
});

test("a paid-click key cannot reopen an old private conversation", async () => {
  const before = state.leads.length;
  const body = {
    origin: { source: "meta", trafficCreativeSlug: "image-link" },
    chatMessages: [],
    trafficClickKey: "00000000-0000-4000-8000-000000000779",
  };
  const first = await invoke("post", "/leads/session", { body });
  const firstLead = state.leads.find((lead) => lead.id === first.body.leadId);
  firstLead.createdAt = new Date(Date.now() - 16_000);

  const second = await invoke("post", "/leads/session", { body });
  assert.equal(second.statusCode, 201);
  assert.notEqual(first.body.leadId, second.body.leadId);
  assert.equal(state.leads.length, before + 2);
});

test("paused, missing and cross-business creative slugs never create attributed leads", async () => {
  for (const trafficCreativeSlug of ["paused-link", "missing-link", "other-business-link"]) {
    const before = state.leads.length;
    const response = await invoke("post", "/leads/session", {
      body: { origin: { source: "meta", trafficCreativeSlug }, chatMessages: [] },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(state.leads.length, before);
  }
});