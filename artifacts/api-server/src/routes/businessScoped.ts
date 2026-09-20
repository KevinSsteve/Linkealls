/**
 * Business-scoped router — handles /api/b/:businessSlug/...
 *
 * A middleware resolves the slug to a businessId (stored in res.locals).
 * Every route handler reads the businessId from res.locals and passes it
 * to the relevant service functions, keeping all reads/writes isolated per
 * business.  The legacy non-scoped routes (/api/leads, /api/campaigns, …)
 * continue to exist for backward compatibility during the migration.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import {
  db,
  businessProfilesTable,
  updateBusinessProfileSchema,
  leadOriginSchema,
  chatMessageSchema,
  updateLeadStateSchema,
  sendAssistantMessageSchema,
  confirmActionSchema,
  createCampaignSchema,
  updateCampaignSchema,
  campaignSetupSchema,
  createTrafficCreativeSchema,
  updateTrafficCreativeSchema,
  proposeBusinessKnowledgeSchema,
  reviewBusinessKnowledgeSchema,
  salesOutcomeEventsTable,
} from "@workspace/db";
import {
  getProfileBySlug,
  updateProfile,
  isProfileFilled,
  getOrCreateProfile,
} from "../services/businessProfile.js";
import { startSiteAnalysis, assistFromDescription, StartAnalysisError } from "../services/siteAnalysis.js";
import {
  createLead,
  createOrReuseTrafficLead,
  getLead,
  listLeads,
  updateLeadState,
  chatWithLead,
  appendOwnerReply,
  subscribeToLeadQualified,
  getLeadsAnalytics,
  claimTrafficWelcome,
  finishTrafficWelcome,
  captureLeadContact,
  recordLeadWhatsAppClick,
  normalizeAngolanMobilePhone,
  leadContactView,
  buildWhatsAppHandoff,
  ownerLeadView,
  correctCommercialMemory,
} from "../services/leads.js";
import {
  listStrategies,
  saveStrategyOverride,
  simulateSalesPreview,
} from "../services/salesStrategy.js";
import { salesStrategyConfigSchema } from "@workspace/db";
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  duplicateCampaign,
  deleteCampaign,
  CampaignDeleteError,
  updateCampaign,
  CampaignLockedError,
  updateCampaignSetup,
  generateCampaignKit,
  getCampaignMetrics,
  generateOptimizationSuggestions,
  resolveTrustedCampaignAttribution,
} from "../services/campaigns.js";
import {
  payCampaignFromWallet,
  payCampaignWithMulticaixa,
  publishCampaign,
  controlCampaignAd,
  CAMPAIGN_MIN_BUDGET_AOA,
} from "../services/campaignAds.js";
import { analyzeCampaignImage, startCreativeGeneration } from "../services/adCreatives.js";
import { effectiveAoaPerUsd, aoaToWholeUsd } from "../services/fx.js";
import { IS_ZERNIO_SIMULATION, searchMetaTargeting } from "../services/zernio.js";
import { PaymentError } from "../services/payments.js";
import { aoPhoneSchema } from "@workspace/db";
import {
  chat,
  listMessages,
  clearMessages,
  confirmAction,
  subscribeToAssistantMessages,
  broadcastAssistantMessage,
  proactiveDailySummary,
  proactiveStaleLeads,
} from "../services/assistant.js";
import {
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
} from "../services/notifications.js";
import type { PushSubscriptionJSON } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { getUserByToken, hasRecentSensitiveAuth, requestToken } from "./userAuth.js";
import { createPaymentsScopedRouter } from "./paymentsScoped.js";
import { getCatalogAnalytics, withOfferingAnalyticsKey } from "../services/catalogAnalytics.js";
import { clientIp } from "../lib/httpSecurity.js";
import {
  createTrafficCreative,
  listTrafficCreatives,
  updateTrafficCreative,
  resolvePublicTrafficCreative,
  getTrafficCreativeBySlug,
  publicTrafficCreativeContext,
} from "../services/trafficCreatives.js";
import { hashPin, verifyPin } from "../lib/pinSecurity.js";
import { consumeSharedRateLimit } from "../lib/rateLimit.js";
import {
  issueConversationCapability,
  verifyVisitorCapability,
  visitorTokenFromAuthorization,
  VisitorCapabilityError,
} from "../lib/visitorCapabilities.js";
import {
  assertAdvertisingNewActionsEnabled,
  assertNonessentialSummariesEnabled,
  LaunchFeaturePausedError,
  launchFeaturePausedPayload,
  PAID_CAMPAIGN_PENDING_REVIEW_MESSAGE,
} from "../lib/launchPolicy.js";
import {
  createVisitorRecoveryFamily,
  readCookie,
  revokeVisitorRecovery,
  rotateVisitorRecovery,
  visitorRecoveryTokenForLead,
  visitorRecoveryCookieName,
  VISITOR_RECOVERY_TTL_MS,
} from "../services/visitorConversationRecovery.js";
import {
  listBusinessAiEvaluations,
  listBusinessKnowledge,
  proposeBusinessKnowledge,
  reviewBusinessKnowledge,
} from "../services/businessBrain.js";
import {
  assessProfileGaps,
  createProfileChangeProposal,
  listProfileChangeProposals,
  reviewProfileChangeProposal,
  adjustProfileChangeProposal,
  applyProfileChangeProposal,
  reverseProfileChangeProposal,
  reopenProfileChangeProposal,
  createResourceRequest,
  listResourceRequests,
  createResource,
  updateResource,
  listResources,
  approveResource,
  reviewResource,
  updateResourceRequestStatus,
  deliverResource,
  ProfileImprovementError,
} from "../services/profileImprovements.js";
import {
  profileChangeProposalInputSchema,
  resourceRequestInputSchema,
  resourceInputSchema,
} from "@workspace/db";

function bid(res: Response): number {
  return res.locals["businessId"] as number;
}

function businessSlug(req: Request): string {
  return (req.params as { businessSlug?: string }).businessSlug ?? "";
}

function setVisitorRecoveryCookie(res: Response, slug: string, token: string): void {
  res.cookie(visitorRecoveryCookieName(slug), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: VISITOR_RECOVERY_TTL_MS,
    path: "/",
  });
}

function clearVisitorRecoveryCookie(res: Response, slug: string): void {
  res.clearCookie(visitorRecoveryCookieName(slug), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
  });
}

function visitorWhatsAppHandoff(res: Response, lead: import("@workspace/db").Lead) {
  if (lead.contactConsentStatus !== "consented") return null;
  const profile = res.locals["businessProfile"] as {
    name?: string | null;
    phone?: string | null;
  };
  return buildWhatsAppHandoff(
    profile.phone,
    profile.name ?? "",
    lead.origin.trafficCreative?.description,
  );
}

/**
 * Owner-only guard: the caller must present a valid session token AND the
 * authenticated user's handle must match the business slug of this router
 * (user = business model: handle === slug).
 *
 * Accepts the token via `Authorization: Bearer …` or, for SSE endpoints
 * (EventSource cannot set headers), via `?token=`.
 */
async function requireOwner(req: Request, res: Response, next: () => void): Promise<void> {
  try {
    const user = await getUserByToken(requestToken(req));
    if (!user) {
      res.status(401).json({ error: "Sessão inválida — inicia sessão novamente" });
      return;
    }
    const slug = (req.params as { businessSlug?: string }).businessSlug ?? "";
    if (!user.handle || user.handle !== slug) {
      res.status(403).json({ error: "Sem permissão para gerir este negócio" });
      return;
    }
    next();
  } catch (err) {
    logger.error({ err }, "requireOwner failed");
    res.status(500).json({ error: "Erro interno" });
  }
}

async function requireRecentReauth(req: Request, res: Response, next: () => void): Promise<void> {
  try {
    if (!(await hasRecentSensitiveAuth(requestToken(req)))) {
      res.status(403).json({
        error: "Confirma o PIN do teu negócio antes de continuar",
        code: "SENSITIVE_AUTH_REQUIRED",
      });
      return;
    }
    next();
  } catch (err) {
    logger.error({ err }, "requireRecentReauth failed");
    res.status(500).json({ error: "Não foi possível confirmar a identidade" });
  }
}

function requireAdvertisingNewActions(_req: Request, res: Response, next: () => void): void {
  try {
    assertAdvertisingNewActionsEnabled();
    next();
  } catch (err) {
    if (err instanceof LaunchFeaturePausedError) {
      res.status(err.statusCode).json(launchFeaturePausedPayload(err));
      return;
    }
    throw err;
  }
}

function requireNonessentialSummaries(_req: Request, res: Response, next: () => void): void {
  try {
    assertNonessentialSummariesEnabled();
    next();
  } catch (err) {
    if (err instanceof LaunchFeaturePausedError) {
      res.status(err.statusCode).json(launchFeaturePausedPayload(err));
      return;
    }
    throw err;
  }
}

export function createBusinessScopedRouter(): Router {
  const router = Router({ mergeParams: true });

  // ── Middleware: slug → businessId ────────────────────────────────────────────
  router.use(async (req: Request, res: Response, next) => {
    const slug = (req.params as { businessSlug?: string }).businessSlug ?? "";
    if (!slug) {
      res.status(404).json({ error: "Negócio não encontrado" });
      return;
    }
    try {
      const profile = await getProfileBySlug(slug);
      if (!profile) {
        res.status(404).json({ error: "Negócio não encontrado" });
        return;
      }
      res.locals["businessId"] = profile.id;
      res.locals["businessProfile"] = profile;
      next();
    } catch (err) {
      logger.error({ err, slug }, "Failed to resolve business slug");
      res.status(500).json({ error: "Erro interno" });
    }
  });

  // ── PROFILE ──────────────────────────────────────────────────────────────────

  router.get("/profile", requireOwner, async (_req, res) => {
    try {
      const profile = await getOrCreateProfile(bid(res));
      res.json({ profile, filled: isProfileFilled(profile) });
    } catch (err) {
      logger.error({ err }, "GET /profile failed");
      res.status(500).json({ error: "Não foi possível carregar o perfil" });
    }
  });

  router.put("/profile", requireOwner, requireRecentReauth, async (req, res) => {
    const parsed = updateBusinessProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      return;
    }
    try {
      const profile = await updateProfile(parsed.data, bid(res));
      res.json({ profile, filled: isProfileFilled(profile) });
    } catch (err) {
      logger.error({ err }, "PUT /profile failed");
      res.status(500).json({ error: "Não foi possível guardar o perfil" });
    }
  });

  // ── VERSIONED SALES STRATEGY ──────────────────────────────────────────────
  router.get("/sales-strategies", requireOwner, async (_req, res) => {
    res.json({ strategies: await listStrategies(bid(res)) });
  });
  const overrideSchema = z.object({
    sourceType: z.enum(["campaign", "traffic_creative"]),
    sourceId: z.string().uuid(),
    strategyVersionId: z.string().uuid().optional(),
    config: z.object({
      focusedOffer: z.string().max(200).optional(),
      expectedIntent: z.string().max(300).optional(),
      objective: z.enum(["purchase", "quote", "appointment_request", "visit_request", "contact"]).optional(),
      minimumQuestions: z.array(z.string().max(500)).max(10).optional(),
      cta: z.string().max(200).optional(),
    }),
  });
  router.put("/sales-strategies/override/source", requireOwner, requireRecentReauth, async (req, res) => {
    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Variação inválida" }); return; }
    try {
      res.json({ override: await saveStrategyOverride(bid(res), { ...parsed.data, approved: true }) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Origem inválida" });
    }
  });
  router.post("/sales-strategies/simulate", requireOwner, async (req, res) => {
    const parsed = z.object({
      config: salesStrategyConfigSchema.optional(),
      strategyVersionId: z.string().uuid().optional(),
      source: z.object({ type: z.enum(["campaign", "traffic_creative"]), id: z.string().uuid() }).optional(),
      message: z.string().trim().min(1).max(2000),
      contactDeclined: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Cenário inválido" }); return; }
    try {
      res.json({ result: await simulateSalesPreview(bid(res), parsed.data) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Não foi possível simular" });
    }
  });

  router.post("/profile/analyze", requireOwner, requireRecentReauth, async (req, res) => {
    const schema = z.object({ url: z.string().min(4).max(500) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "URL inválido" });
      return;
    }
    try {
      await startSiteAnalysis(parsed.data.url, bid(res));
      res.status(202).json({ started: true });
    } catch (err) {
      if (err instanceof StartAnalysisError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "POST /profile/analyze failed");
      res.status(500).json({ error: "Não foi possível iniciar a análise" });
    }
  });

  router.post("/profile/assist", requireOwner, async (req, res) => {
    const schema = z.object({ description: z.string().min(20).max(8000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Descreve o negócio com pelo menos 20 caracteres" });
      return;
    }
    try {
      const draft = await assistFromDescription(parsed.data.description);
      res.json({ draft });
    } catch (err) {
      logger.error({ err }, "POST /profile/assist failed");
      res.status(500).json({ error: "A IA não conseguiu estruturar a descrição. Tenta de novo." });
    }
  });

  // ── PROFILE IMPROVEMENTS / RESOURCE LIBRARY ─────────────────────────────────
  router.get("/profile-improvements/gaps", requireOwner, async (_req, res) => {
    try { res.json({ gaps: await assessProfileGaps(bid(res)) }); }
    catch (err) { logger.error({ err }, "GET profile improvement gaps failed"); res.status(500).json({ error: "Não foi possível analisar o perfil" }); }
  });
  router.get("/profile-improvements/proposals", requireOwner, async (_req, res) => {
    try { res.json({ proposals: await listProfileChangeProposals(bid(res)) }); }
    catch (err) { logger.error({ err }, "GET profile proposals failed"); res.status(500).json({ error: "Não foi possível carregar propostas" }); }
  });
  router.get("/profile-improvements", requireOwner, async (_req, res) => {
    try {
      const [proposals, requests] = await Promise.all([listProfileChangeProposals(bid(res)), listResourceRequests(bid(res))]);
      res.json({ proposals, requests });
    } catch (err) { logger.error({ err }, "GET profile improvements failed"); res.status(500).json({ error: "Não foi possível carregar melhorias" }); }
  });
  router.post("/profile-improvements/proposals", requireOwner, async (req, res) => {
    const parsed = profileChangeProposalInputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Proposta inválida", details: parsed.error.issues }); return; }
    try { res.status(201).json({ proposal: await createProfileChangeProposal(bid(res), parsed.data) }); }
    catch (err) { const e = err as ProfileImprovementError; res.status(e.code ? 400 : 500).json({ error: e.message ?? "Não foi possível criar a proposta" }); }
  });
  router.patch("/profile-improvements/proposals/:id", requireOwner, async (req, res) => {
    const parsed = z.object({
      decision: z.enum(["approve", "reject"]).optional(),
      proposedValue: z.unknown().optional(),
      reason: z.string().trim().min(3).max(2000).optional(),
      expectedUpdatedAt: z.string().datetime(),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Revisão inválida" }); return; }
    if (!parsed.data.decision && parsed.data.proposedValue === undefined) {
      res.status(400).json({ error: "Indica a decisão ou um valor ajustado" });
      return;
    }
    try {
      const proposal = parsed.data.decision
        ? await reviewProfileChangeProposal(
            bid(res), String(req.params["id"]), parsed.data.decision,
            new Date(parsed.data.expectedUpdatedAt),
            parsed.data.proposedValue, parsed.data.reason,
          )
        : await adjustProfileChangeProposal(
            bid(res), String(req.params["id"]), parsed.data.proposedValue,
            new Date(parsed.data.expectedUpdatedAt), parsed.data.reason,
          );
      res.json({ proposal });
    }
    catch (err) { const e = err as ProfileImprovementError; res.status(e.code ? 409 : 500).json({ error: e.message ?? "Não foi possível rever a proposta" }); }
  });
  router.post("/profile-improvements/proposals/:id/apply", requireOwner, requireRecentReauth, async (req, res) => {
    const parsed = z.object({ idempotencyKey: z.string().trim().min(8).max(200) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Chave de idempotência obrigatória" }); return; }
    try { res.json({ proposal: await applyProfileChangeProposal(bid(res), String(req.params["id"]), parsed.data.idempotencyKey) }); }
    catch (err) { const e = err as ProfileImprovementError; res.status(e.code === "CONFLICT" ? 409 : 400).json({ error: e.message ?? "Não foi possível aplicar a proposta" }); }
  });
  router.post("/profile-improvements/proposals/:id/reverse", requireOwner, requireRecentReauth, async (req, res) => {
    const parsed = z.object({ idempotencyKey: z.string().trim().min(8).max(200) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Chave de idempotência obrigatória" }); return; }
    try { res.json({ proposal: await reverseProfileChangeProposal(bid(res), String(req.params["id"]), parsed.data.idempotencyKey) }); }
    catch (err) { const e = err as ProfileImprovementError; res.status(e.code === "CONFLICT" ? 409 : 400).json({ error: e.message ?? "Não foi possível reverter" }); }
  });
  router.post("/profile-improvements/proposals/:id/reopen", requireOwner, async (req, res) => {
    const parsed = z.object({ expectedUpdatedAt: z.string().datetime() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Versão revista obrigatória" }); return; }
    try {
      res.json({ proposal: await reopenProfileChangeProposal(
        bid(res), String(req.params["id"]), new Date(parsed.data.expectedUpdatedAt),
      ) });
    } catch (err) {
      const e = err as ProfileImprovementError;
      res.status(e.code === "CONFLICT" ? 409 : 400).json({ error: e.message ?? "Não foi possível reabrir" });
    }
  });
  router.get("/resources/requests", requireOwner, async (_req, res) => {
    try { res.json({ requests: await listResourceRequests(bid(res)) }); }
    catch (err) { logger.error({ err }, "GET resource requests failed"); res.status(500).json({ error: "Não foi possível carregar pedidos" }); }
  });
  router.post("/resources/requests", requireOwner, async (req, res) => {
    const parsed = resourceRequestInputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Pedido inválido" }); return; }
    try { res.status(201).json({ request: await createResourceRequest(bid(res), parsed.data) }); }
    catch (err) { const e = err as ProfileImprovementError; res.status(400).json({ error: e.message }); }
  });
  router.patch("/resources/requests/:id", requireOwner, async (req, res) => {
    const parsed = z.object({ status: z.enum(["open", "fulfilled", "cancelled"]) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Estado inválido" }); return; }
    try { res.json({ request: await updateResourceRequestStatus(bid(res), String(req.params["id"]), parsed.data.status) }); }
    catch (err) { const e = err as ProfileImprovementError; res.status(400).json({ error: e.message }); }
  });
  router.get("/resources", requireOwner, async (_req, res) => {
    try {
      const resources = await listResources(bid(res));
      res.json({ resources: resources.map((resource) => ({ ...resource, textContent: resource.content, purposes: [resource.purpose] })) });
    }
    catch (err) { logger.error({ err }, "GET resources failed"); res.status(500).json({ error: "Não foi possível carregar recursos" }); }
  });
  router.post("/resources", requireOwner, async (req, res) => {
    const requestId = z.string().uuid().optional().safeParse(req.body?.requestId);
    if (!requestId.success) { res.status(400).json({ error: "Pedido associado inválido" }); return; }
    const parsed = resourceInputSchema.safeParse({
      ...req.body,
      purpose: req.body?.purpose ?? req.body?.purposes?.[0],
      content: req.body?.content ?? req.body?.textContent,
    });
    if (!parsed.success) { res.status(400).json({ error: "Recurso inválido" }); return; }
    try {
      const resource = await createResource(bid(res), parsed.data, requestId.data);
      res.status(201).json({ resource: { ...resource, textContent: resource.content, purposes: [resource.purpose] } });
    }
    catch (err) { const e = err as ProfileImprovementError; res.status(400).json({ error: e.message }); }
  });
  router.patch("/resources/:id", requireOwner, async (req, res) => {
    try {
      const resource = await updateResource(bid(res), String(req.params["id"]), req.body);
      res.json({ resource: { ...resource, textContent: resource.content, purposes: [resource.purpose] } });
    } catch (err) { const e = err as ProfileImprovementError; res.status(400).json({ error: e.message }); }
  });
  router.post("/resources/:id/approve", requireOwner, requireRecentReauth, async (req, res) => {
    const parsed = z.object({ expectedUpdatedAt: z.string().datetime() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Versão revista obrigatória" }); return; }
    try { res.json({ resource: await approveResource(bid(res), String(req.params["id"]), new Date(parsed.data.expectedUpdatedAt)) }); }
    catch (err) { const e = err as ProfileImprovementError; res.status(e.code === "CONFLICT" ? 409 : 400).json({ error: e.message }); }
  });
  router.post("/resources/:id/review", requireOwner, requireRecentReauth, async (req, res) => {
    const parsed = z.object({ decision: z.enum(["approve", "reject"]), expectedUpdatedAt: z.string().datetime() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Revisão inválida" }); return; }
    try { res.json({ resource: await reviewResource(bid(res), String(req.params["id"]), parsed.data.decision, new Date(parsed.data.expectedUpdatedAt)) }); }
    catch (err) { const e = err as ProfileImprovementError; res.status(e.code === "CONFLICT" ? 409 : 400).json({ error: e.message }); }
  });
  router.post("/resources/:id/send", requireOwner, requireRecentReauth, async (req, res) => {
    const parsed = z.object({ leadId: z.string().uuid(), purpose: z.string().min(1).max(200), idempotencyKey: z.string().min(8).max(200) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Dados de envio inválidos" }); return; }
    try { res.json({ resource: await deliverResource(bid(res), String(req.params["id"]), parsed.data.leadId, parsed.data.purpose, parsed.data.idempotencyKey) }); }
    catch (err) { const e = err as ProfileImprovementError; res.status(e.code === "CONFLICT" ? 409 : 400).json({ error: e.message }); }
  });

  // ── AUTH / PIN ────────────────────────────────────────────────────────────────

  router.get("/auth/pin/status", requireOwner, async (_req, res) => {
    try {
      const rows = await db
        .select({ ownerPin: businessProfilesTable.ownerPin })
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.id, bid(res)));
      res.json({ hasPin: !!(rows[0]?.ownerPin) });
    } catch (err) {
      logger.error({ err }, "GET /auth/pin/status failed");
      res.status(500).json({ hasPin: false });
    }
  });

  router.post("/auth/pin/verify", requireOwner, async (req, res) => {
    const pin = String(req.body?.pin ?? "").trim();
    if (!pin) { res.status(400).json({ ok: false, error: "PIN obrigatório" }); return; }
    try {
      const [ipAllowed, accountAllowed] = await Promise.all([
        consumeSharedRateLimit("business-pin-ip", `${bid(res)}:${clientIp(req)}`, 8, 10 * 60_000),
        consumeSharedRateLimit("business-pin-account", String(bid(res)), 20, 60 * 60_000),
      ]);
      if (!ipAllowed || !accountAllowed) {
        res.status(429).json({ ok: false, error: "Demasiadas tentativas — tenta daqui a pouco" });
        return;
      }
      const rows = await db
        .select({ ownerPin: businessProfilesTable.ownerPin })
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.id, bid(res)));
      const stored = rows[0]?.ownerPin ?? null;
      if (!stored) { res.json({ ok: false, noPin: true }); return; }
      const result = await verifyPin(pin, stored);
      if (result.valid && result.needsUpgrade) {
        await db.update(businessProfilesTable)
          .set({ ownerPin: await hashPin(pin), updatedAt: new Date() })
          .where(eq(businessProfilesTable.id, bid(res)));
      }
      res.json({ ok: result.valid });
    } catch (err) {
      logger.error({ err }, "POST /auth/pin/verify failed");
      res.status(503).json({ ok: false, error: "Não foi possível confirmar o limite de tentativas" });
    }
  });

  router.post("/auth/pin/set", requireOwner, requireRecentReauth, async (req, res) => {
    const pin = String(req.body?.pin ?? "").trim();
    if (!pin || pin.length < 4) {
      res.status(400).json({ ok: false, error: "O PIN deve ter pelo menos 4 dígitos" });
      return;
    }
    const currentPin = String(req.body?.currentPin ?? "").trim();
    try {
      const [ipAllowed, accountAllowed] = await Promise.all([
        consumeSharedRateLimit("business-pin-ip", `${bid(res)}:${clientIp(req)}`, 8, 10 * 60_000),
        consumeSharedRateLimit("business-pin-account", String(bid(res)), 20, 60 * 60_000),
      ]);
      if (!ipAllowed || !accountAllowed) {
        res.status(429).json({ ok: false, error: "Demasiadas tentativas — tenta daqui a pouco" });
        return;
      }
      const rows = await db
        .select({ ownerPin: businessProfilesTable.ownerPin })
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.id, bid(res)));
      const stored = rows[0]?.ownerPin ?? null;
      if (stored && !currentPin) {
        res.status(403).json({ ok: false, error: "PIN actual obrigatório para alterar" });
        return;
      }
      if (stored && !(await verifyPin(currentPin, stored)).valid) {
        res.status(403).json({ ok: false, error: "PIN actual incorreto" });
        return;
      }
      await db
        .update(businessProfilesTable)
        .set({ ownerPin: await hashPin(pin), updatedAt: new Date() })
        .where(eq(businessProfilesTable.id, bid(res)));
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "POST /auth/pin/set failed");
      res.status(503).json({ ok: false, error: "Não foi possível confirmar o limite de tentativas" });
    }
  });

  // ── LEADS ─────────────────────────────────────────────────────────────────────
  //
  // PUBLIC visitor endpoints (deliberately NOT behind requireOwner):
  //   POST /leads/session     — a visitor starts a conversation with the business
  //   POST /leads/:id/chat    — the visitor continues THEIR OWN conversation
  // UUIDs are locators only. Each session gets a signed, expiring capability
  // returned once and subsequently supplied as `Authorization: Visitor …`.
  // Both endpoints are rate-limited per IP to bound AI usage.
  // Everything else under /leads is owner-only.

  // Shared fixed windows apply consistently across replicas and fail closed if
  // the backing store is unavailable.
  const RATE_WINDOW_MS = 60_000;
  const RATE_MAX = 20;
  async function publicRateLimit(req: Request, res: Response, next: () => void): Promise<void> {
    try {
      const allowed = await consumeSharedRateLimit(
        "business-public-ip",
        `${bid(res)}:${clientIp(req)}`,
        RATE_MAX,
        RATE_WINDOW_MS,
      );
      if (!allowed) {
        res.status(429).json({ error: "Demasiados pedidos — tenta daqui a pouco" });
        return;
      }
      next();
    } catch (err) {
      logger.error({ err }, "public visitor rate limit unavailable");
      res.status(503).json({ error: "Serviço temporariamente indisponível" });
    }
  }

  // ── PAYMENTS (Multicaixa Express) ────────────────────────────────────────────
  // Public checkout + owner sales/wallet/subscription — see paymentsScoped.ts.
  router.use(createPaymentsScopedRouter(requireOwner, requireRecentReauth, bid, publicRateLimit));

  const createSessionSchema = z.object({
    origin: leadOriginSchema.optional(),
    chatMessages: z.array(chatMessageSchema).max(50).optional(),
    trafficClickKey: z.string().uuid().optional(),
  });

  router.post("/leads/session", publicRateLimit, async (req, res) => {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Dados inválidos" }); return; }
    try {
      const rawOrigin = parsed.data.origin ?? {};
      const { trafficCreativeSlug, ...allowedOrigin } = rawOrigin;
      const origin: import("@workspace/db").LeadOrigin = { ...allowedOrigin };
      if (origin.campaign) {
        const campaign = await resolveTrustedCampaignAttribution(bid(res), origin.campaign);
        if (campaign) origin.trustedCampaign = campaign;
      }
      if (trafficCreativeSlug) {
        const creative = await getTrafficCreativeBySlug(bid(res), trafficCreativeSlug);
        if (!creative || !creative.active) {
          res.status(400).json({ error: "Este link de aquisição já não está activo" });
          return;
        }
        origin.campaign = origin.campaign ?? creative.publicSlug;
        origin.trafficCreative = publicTrafficCreativeContext(creative);
      }
      if (origin.trafficCreative && !parsed.data.trafficClickKey) {
        res.status(400).json({ error: "Identificador de abertura do anúncio em falta" });
        return;
      }
      const recovery = createVisitorRecoveryFamily();
      const lead = origin.trafficCreative
        ? await createOrReuseTrafficLead(
          origin,
          parsed.data.chatMessages ?? [],
          bid(res),
          parsed.data.trafficClickKey!,
          recovery,
        )
        : await createLead(
          origin,
          parsed.data.chatMessages ?? [],
          bid(res),
          {
            visitorRecoveryFamilyId: recovery.familyId,
            visitorRecoveryExpiresAt: recovery.expiresAt,
            trafficWelcomeStatus: null,
          },
        );
      const recoveryToken = visitorRecoveryTokenForLead(bid(res), lead);
      setVisitorRecoveryCookie(res, businessSlug(req), recoveryToken);
      res.status(201).json({
        leadId: lead.id,
        visitorToken: issueConversationCapability(bid(res), lead.id),
      });
    } catch (err) {
      logger.error({ err }, "POST /leads/session failed");
      res.status(500).json({ error: "Erro ao criar sessão" });
    }
  });

  router.post("/leads/recovery", publicRateLimit, async (req, res) => {
    const slug = businessSlug(req);
    try {
      const token = readCookie(req.headers.cookie, visitorRecoveryCookieName(slug));
      if (!token) {
        res.status(404).json({ error: "Conversa guardada não encontrada" });
        return;
      }
      const recovered = await rotateVisitorRecovery(bid(res), token);
      if (!recovered) {
        res.status(404).json({ error: "Conversa guardada não encontrada ou expirada" });
        return;
      }
      setVisitorRecoveryCookie(res, slug, recovered.token);
      res.json({
        leadId: recovered.leadId,
        visitorToken: issueConversationCapability(bid(res), recovered.leadId),
      });
    } catch (err) {
      logger.error({ err }, "POST /leads/recovery failed");
      res.status(500).json({ error: "Não foi possível recuperar a conversa" });
    }
  });

  router.delete("/leads/recovery", publicRateLimit, async (req, res) => {
    const slug = businessSlug(req);
    try {
      const token = readCookie(req.headers.cookie, visitorRecoveryCookieName(slug));
      if (token) await revokeVisitorRecovery(bid(res), token);
      clearVisitorRecoveryCookie(res, slug);
      res.status(204).end();
    } catch (err) {
      logger.error({ err }, "DELETE /leads/recovery failed");
      res.status(500).json({ error: "Não foi possível terminar a conversa" });
    }
  });

  router.get("/leads/:id/session", publicRateLimit, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(404).json({ error: "Conversa não encontrada" });
      return;
    }
    try {
      verifyVisitorCapability(visitorTokenFromAuthorization(req.headers.authorization), {
        businessId: bid(res),
        leadId: id,
      });
      const lead = await getLead(id, bid(res));
      if (!lead) {
        res.status(404).json({ error: "Conversa não encontrada" });
        return;
      }
      res.json({
        leadId: lead.id,
        chatMessages: lead.chatMessages,
        trafficCreative: lead.origin.trafficCreative ?? null,
        trafficWelcomeStatus: lead.trafficWelcomeStatus,
        contact: leadContactView(lead),
        whatsappHandoff: visitorWhatsAppHandoff(res, lead),
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        commercial: {
          stage: lead.commercialMemory.stage,
          pendingAction: lead.commercialMemory.pendingAction ?? null,
          humanControl: lead.commercialMemory.humanControl,
        },
      });
    } catch (err) {
      if (err instanceof VisitorCapabilityError) {
        res.status(401).json({ error: "Acesso à conversa inválido ou expirado" });
        return;
      }
      logger.error({ err, id }, "GET /leads/:id/session failed");
      res.status(500).json({ error: "Erro ao carregar conversa" });
    }
  });

  router.post("/leads/:id/traffic-welcome", publicRateLimit, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(404).json({ error: "Conversa não encontrada" });
      return;
    }
    try {
      verifyVisitorCapability(visitorTokenFromAuthorization(req.headers.authorization), {
        businessId: bid(res),
        leadId: id,
      });
      const lead = await getLead(id, bid(res));
      if (!lead?.origin.trafficCreative) {
        res.status(400).json({ error: "Esta conversa não veio de um anúncio" });
        return;
      }
      const claimToken = await claimTrafficWelcome(id, bid(res));
      if (!claimToken) {
        const current = await getLead(id, bid(res));
        res.json({ started: false, status: current?.trafficWelcomeStatus ?? "failed" });
        return;
      }
      try {
        const result = await chatWithLead(
          id,
          "Quero saber mais sobre este anúncio",
          bid(res),
          { trafficWelcomeClaimToken: claimToken, requestContactConsent: true },
        );
        res.json({ started: true, status: "complete", ...result });
      } catch (err) {
        await finishTrafficWelcome(id, bid(res), claimToken, "failed");
        throw err;
      }
    } catch (err) {
      if (err instanceof VisitorCapabilityError) {
        res.status(401).json({ error: "Acesso à conversa inválido ou expirado" });
        return;
      }
      logger.error({ err, id }, "POST /leads/:id/traffic-welcome failed");
      res.status(500).json({ error: "Não foi possível iniciar a resposta do assistente" });
    }
  });

  router.post("/leads/:id/contact", publicRateLimit, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    const parsed = z.discriminatedUnion("action", [
      z.object({ action: z.literal("consent"), phone: z.string().trim().min(7).max(40) }),
      z.object({ action: z.literal("decline") }),
    ]).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Escolhe um número válido ou continua sem partilhar" });
      return;
    }
    try {
      verifyVisitorCapability(visitorTokenFromAuthorization(req.headers.authorization), {
        businessId: bid(res),
        leadId: id,
      });
      const normalized = parsed.data.action === "consent"
        ? normalizeAngolanMobilePhone(parsed.data.phone)
        : null;
      if (parsed.data.action === "consent" && !normalized) {
        res.status(400).json({ error: "Usa um número móvel angolano válido, por exemplo 923 456 789" });
        return;
      }
      const lead = await captureLeadContact(
        id,
        bid(res),
        parsed.data.action === "consent"
          ? { action: "consent", phone: normalized! }
          : { action: "decline" },
      );
      if (!lead) {
        res.status(404).json({ error: "Conversa não encontrada" });
        return;
      }
      try {
        await db.insert(salesOutcomeEventsTable).values({
          businessId: bid(res),
          leadId: id,
          strategyVersionId: lead.commercialMemory?.strategyVersionId,
          event: parsed.data.action === "decline" ? "cta_declined" : "cta_accepted",
        });
      } catch (eventError) {
        logger.warn({ err: eventError, id }, "Failed to record contact CTA outcome");
      }
      res.json({
        contact: leadContactView(lead),
        whatsappHandoff: visitorWhatsAppHandoff(res, lead),
      });
    } catch (err) {
      if (err instanceof VisitorCapabilityError) {
        res.status(401).json({ error: "Acesso à conversa inválido ou expirado" });
        return;
      }
      logger.error({ err, id }, "POST /leads/:id/contact failed");
      res.status(500).json({ error: "Não foi possível guardar o contacto" });
    }
  });

  router.post("/leads/:id/whatsapp-click", publicRateLimit, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      verifyVisitorCapability(visitorTokenFromAuthorization(req.headers.authorization), {
        businessId: bid(res),
        leadId: id,
      });
      if (!(await recordLeadWhatsAppClick(id, bid(res)))) {
        res.status(409).json({ error: "O contacto ainda não foi autorizado" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      if (err instanceof VisitorCapabilityError) {
        res.status(401).json({ error: "Acesso à conversa inválido ou expirado" });
        return;
      }
      logger.error({ err, id }, "POST /leads/:id/whatsapp-click failed");
      res.status(500).json({ error: "Não foi possível registar o clique" });
    }
  });

  router.post("/leads/:id/sales-event", publicRateLimit, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    const parsed = z.object({ event: z.enum(["cta_accepted", "cta_declined"]) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Evento inválido" }); return; }
    try {
      verifyVisitorCapability(visitorTokenFromAuthorization(req.headers.authorization), { businessId: bid(res), leadId: id });
      const lead = await getLead(id, bid(res));
      if (!lead) { res.status(404).json({ error: "Conversa não encontrada" }); return; }
      await db.insert(salesOutcomeEventsTable).values({
        businessId: bid(res), leadId: id, strategyVersionId: lead.commercialMemory.strategyVersionId, event: parsed.data.event,
      });
      res.status(204).end();
    } catch (err) {
      if (err instanceof VisitorCapabilityError) { res.status(401).json({ error: "Acesso inválido" }); return; }
      logger.error({ err, id }, "POST sales event failed");
      res.status(500).json({ error: "Não foi possível registar o resultado" });
    }
  });

  router.get("/leads", requireOwner, async (_req, res) => {
    try {
      const leads = await listLeads(bid(res));
      res.json({ leads: leads.map(ownerLeadView) });
    } catch (err) {
      logger.error({ err }, "GET /leads failed");
      res.status(500).json({ error: "Erro ao carregar leads" });
    }
  });

  // SSE — must be before /leads/:id
  router.get("/leads/events", requireOwner, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const businessId = bid(res);
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 20_000);
    const unsubscribe = subscribeToLeadQualified((leadId) => {
      getLead(leadId).then((lead) => {
        if (!lead) return;
        if (lead.businessId === businessId) {
          res.write(`event: lead_qualified\ndata: ${JSON.stringify({ leadId })}\n\n`);
        }
      }).catch(() => {});
    });
    req.on("close", () => { clearInterval(keepAlive); unsubscribe(); });
  });

  router.get("/leads/analytics", requireOwner, async (_req, res) => {
    try {
      const analytics = await getLeadsAnalytics(bid(res));
      res.json({ analytics });
    } catch (err) {
      logger.error({ err }, "GET /leads/analytics failed");
      res.status(500).json({ error: "Erro ao carregar analytics" });
    }
  });

  router.get("/catalog/analytics", requireOwner, async (_req, res) => {
    try {
      const analytics = await getCatalogAnalytics(bid(res), await getOrCreateProfile(bid(res)));
      res.json({ analytics });
    } catch (err) {
      logger.error({ err }, "GET /catalog/analytics failed");
      res.status(500).json({ error: "Erro ao carregar métricas do catálogo" });
    }
  });

  router.get("/leads/:id", requireOwner, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const lead = await getLead(id, bid(res));
      if (!lead) { res.status(404).json({ error: "Lead não encontrado" }); return; }
      res.json({ lead: ownerLeadView(lead) });
    } catch (err) {
      logger.error({ err }, "GET /leads/:id failed");
      res.status(500).json({ error: "Erro ao carregar lead" });
    }
  });

  router.patch("/leads/:id/commercial", requireOwner, async (req, res) => {
    const parsed = z.object({
      expectedRevision: z.number().int().nonnegative(),
      patch: z.object({
        goal: z.string().trim().max(500).optional(),
        interests: z.array(z.string().trim().min(1).max(300)).max(10).optional(),
        objections: z.array(z.object({ text: z.string().trim().min(1).max(500), status: z.enum(["pending", "resolved"]) })).max(10).optional(),
        stage: z.enum(["welcome", "understand", "recommend", "clarify", "next_step", "handoff", "follow_up", "disinterested"]).optional(),
        pendingAction: z.string().max(100).optional(),
        factualSummary: z.string().max(2000).optional(),
        recommendationReason: z.string().max(1000).optional(),
        missingData: z.array(z.string().max(300)).max(20).optional(),
        escalationReason: z.string().max(1000).optional(),
        humanControl: z.enum(["ai", "owner"]).optional(),
      }),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Correcção inválida" }); return; }
    try {
      const lead = await correctCommercialMemory(String(req.params["id"]), bid(res), parsed.data.expectedRevision, parsed.data.patch);
      res.json({ lead: ownerLeadView(lead) });
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : "Não foi possível corrigir" });
    }
  });

  router.post("/leads/:id/chat", publicRateLimit, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    const schema = z.object({
      message: z.string().min(1).max(2000),
      requestId: z.string().uuid(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Mensagem inválida" }); return; }
    try {
      verifyVisitorCapability(visitorTokenFromAuthorization(req.headers.authorization), {
        businessId: bid(res),
        leadId: id,
      });
      const { reply, products, nextAction } = await chatWithLead(id, parsed.data.message, bid(res), {
        requestId: parsed.data.requestId,
      });
      res.json({ reply, products, nextAction });
    } catch (err) {
      if (err instanceof VisitorCapabilityError) {
        res.status(401).json({ error: "Acesso à conversa inválido ou expirado" });
        return;
      }
      if (err instanceof Error && err.message === "O dono está a atender esta conversa") {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof Error && (err.message === "Esta mensagem já está a ser processada" || err.message === "A operação desta resposta já não está activa")) {
        res.status(409).json({ error: err.message });
        return;
      }
      logger.error({ err, id }, "POST /leads/:id/chat failed");
      res.status(500).json({ error: "Erro ao processar mensagem" });
    }
  });

  router.post("/leads/:id/owner-reply", requireOwner, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    const schema = z.object({ message: z.string().min(1).max(2000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Mensagem inválida" }); return; }
    try {
      const lead = await appendOwnerReply(id, parsed.data.message, bid(res));
      res.json({ lead: ownerLeadView(lead) });
    } catch (err) {
      logger.error({ err }, "POST /leads/:id/owner-reply failed");
      res.status(500).json({ error: "Erro ao guardar resposta" });
    }
  });

  router.patch("/leads/:id/state", requireOwner, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    const parsed = updateLeadStateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Estado inválido" }); return; }
    try {
      const lead = await updateLeadState(id, parsed.data.state, bid(res));
      if (!lead) { res.status(404).json({ error: "Lead não encontrado" }); return; }
      res.json({ lead: ownerLeadView(lead) });
    } catch (err) {
      logger.error({ err }, "PATCH /leads/:id/state failed");
      res.status(500).json({ error: "Erro ao atualizar estado" });
    }
  });

  // ── CATALOG ───────────────────────────────────────────────────────────────────

  router.get("/catalog", async (_req, res) => {
    try {
      const profile = await getOrCreateProfile(bid(res));
      const isReady = profile.name.trim().length > 0;
      res.json({
        businessSlug: profile.slug ?? null,
        name: profile.name,
          avatarUrl: profile.avatarUrl ?? null,
        sector: profile.sector,
        description: profile.description,
        differentials: profile.differentials,
        publicLinks: profile.publicLinks,
        offerings: profile.offerings.map(withOfferingAnalyticsKey),
        faq: profile.faq,
        catalogEnabled: profile.catalogEnabled,
        catalogSlug: profile.catalogSlug ?? null,
        isReady,
        hasProducts: profile.offerings.length > 0,
      });
    } catch (err) {
      logger.error({ err }, "GET /catalog failed");
      res.status(500).json({ error: "Erro ao carregar catálogo" });
    }
  });

  // ── SIMPLE PAID TRAFFIC ─────────────────────────────────────────────────────
  // This surface is deliberately independent from legacy paid campaigns:
  // there is no budget, payment, provider publishing, or launch-policy gate.
  router.get("/traffic-creatives", requireOwner, async (_req, res) => {
    try {
      res.json({ creatives: await listTrafficCreatives(bid(res)) });
    } catch (err) {
      logger.error({ err }, "GET /traffic-creatives failed");
      res.status(500).json({ error: "Não foi possível carregar os anúncios" });
    }
  });

  router.post("/traffic-creatives", requireOwner, async (req, res) => {
    const parsed = createTrafficCreativeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Indica uma descrição e uma imagem ou vídeo válido" });
      return;
    }
    try {
      const creative = await createTrafficCreative(
        parsed.data,
        bid(res),
        String(req.params.businessSlug ?? ""),
      );
      res.status(201).json({ creative });
    } catch (err) {
      logger.warn({ err }, "POST /traffic-creatives rejected");
      res.status(400).json({ error: err instanceof Error ? err.message : "Não foi possível criar o anúncio" });
    }
  });

  router.patch("/traffic-creatives/:id", requireOwner, async (req, res) => {
    const parsed = updateTrafficCreativeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Dados inválidos" });
      return;
    }
    try {
      const creative = await updateTrafficCreative(String(req.params.id), parsed.data, bid(res));
      if (!creative) {
        res.status(404).json({ error: "Anúncio não encontrado" });
        return;
      }
      res.json({ creative });
    } catch (err) {
      logger.error({ err }, "PATCH /traffic-creatives failed");
      res.status(500).json({ error: "Não foi possível actualizar o anúncio" });
    }
  });

  // Public resolver: only safe creative fields are returned. The server
  // increments visits and never accepts creative content from the browser.
  router.get("/traffic-creatives/:creativeSlug/public", publicRateLimit, async (req, res) => {
    try {
      const creative = await resolvePublicTrafficCreative(bid(res), String(req.params.creativeSlug));
      if (!creative) {
        res.status(404).json({ error: "Anúncio não encontrado" });
        return;
      }
      res.json({ creative });
    } catch (err) {
      logger.error({ err }, "GET public traffic creative failed");
      res.status(500).json({ error: "Não foi possível carregar este anúncio" });
    }
  });

  // ── CAMPAIGNS ─────────────────────────────────────────────────────────────────

  router.get("/campaigns", requireOwner, async (_req, res) => {
    try {
      const campaigns = await listCampaigns(bid(res));
      res.json({ campaigns });
    } catch (err) {
      logger.error({ err }, "GET /campaigns failed");
      res.status(500).json({ error: "Erro ao carregar campanhas" });
    }
  });

  router.post("/campaigns", requireOwner, requireAdvertisingNewActions, async (req, res) => {
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Dados inválidos", details: parsed.error });
      return;
    }
    try {
      const campaign = await createCampaign(parsed.data, bid(res));
      res.status(201).json({ campaign });
    } catch (err) {
      logger.error({ err }, "POST /campaigns failed");
      const pg = err as { code?: string };
      if (pg.code === "23505") {
        res.status(409).json({ error: "Já existe uma campanha com este nome. Escolhe um nome diferente." });
        return;
      }
      res.status(500).json({ error: "Erro ao criar campanha" });
    }
  });

  // These routes must precede /campaigns/:id so "targeting" is not treated as
  // a campaign UUID. The Meta account remains server-side.
  router.get("/campaigns/targeting/locations", requireOwner, requireAdvertisingNewActions, async (req, res) => {
    const query = typeof req.query["q"] === "string" ? req.query["q"].slice(0, 80) : "";
    try {
      const results = await searchMetaTargeting("city", query);
      res.json({ results });
    } catch (err) {
      logger.warn({ err }, "GET Meta location suggestions failed");
      res.status(503).json({ error: "Não foi possível consultar localizações Meta" });
    }
  });

  router.get("/campaigns/targeting/interests", requireOwner, requireAdvertisingNewActions, async (req, res) => {
    const query = typeof req.query["q"] === "string" ? req.query["q"].slice(0, 80) : "";
    try {
      const results = await searchMetaTargeting("interest", query);
      res.json({ results });
    } catch (err) {
      logger.warn({ err }, "GET Meta interest suggestions failed");
      res.status(503).json({ error: "Não foi possível consultar interesses Meta" });
    }
  });

  router.get("/campaigns/:id", requireOwner, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const campaign = await getCampaign(id, bid(res));
      if (!campaign) { res.status(404).json({ error: "Campanha não encontrada" }); return; }
      const launchNotice =
        campaign.paymentStatus === "pago" &&
        ["nao_publicada", "erro", "rejeitada"].includes(campaign.publishStatus)
          ? PAID_CAMPAIGN_PENDING_REVIEW_MESSAGE
          : null;
      res.json({ campaign, launchNotice });
    } catch (err) {
      logger.error({ err }, "GET /campaigns/:id failed");
      res.status(500).json({ error: "Erro ao carregar campanha" });
    }
  });

  router.patch("/campaigns/:id", requireOwner, requireAdvertisingNewActions, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    const parsed = updateCampaignSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Dados inválidos" }); return; }
    try {
      const campaign = await updateCampaign(id, parsed.data, bid(res));
      if (!campaign) { res.status(404).json({ error: "Campanha não encontrada" }); return; }
      res.json({ campaign });
    } catch (err) {
      if (err instanceof CampaignLockedError) { res.status(err.statusCode).json({ error: err.message }); return; }
      logger.error({ err }, "PATCH /campaigns/:id failed");
      res.status(500).json({ error: "Erro ao atualizar campanha" });
    }
  });

  router.patch("/campaigns/:id/setup", requireOwner, requireAdvertisingNewActions, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    const parsed = campaignSetupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Configuração inválida", details: parsed.error });
      return;
    }
    try {
      const campaign = await updateCampaignSetup(id, parsed.data, bid(res));
      if (!campaign) { res.status(404).json({ error: "Campanha não encontrada" }); return; }
      res.json({ campaign });
    } catch (err) {
      if (err instanceof CampaignLockedError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "PATCH /campaigns/:id/setup failed");
      res.status(500).json({ error: "Erro ao guardar a configuração da campanha" });
    }
  });

  router.delete("/campaigns/:id", requireOwner, requireAdvertisingNewActions, requireRecentReauth, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const deleted = await deleteCampaign(id, bid(res));
      if (!deleted) {
        res.status(404).json({ error: "Campanha não encontrada" });
        return;
      }
      res.json({ deleted: true });
    } catch (err) {
      if (err instanceof CampaignDeleteError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      logger.error({ err }, "DELETE /campaigns/:id failed");
      res.status(500).json({ error: "Erro ao eliminar campanha" });
    }
  });

  router.post("/campaigns/:id/duplicate", requireOwner, requireAdvertisingNewActions, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const campaign = await duplicateCampaign(id, bid(res));
      res.status(201).json({ campaign });
    } catch (err) {
      logger.error({ err }, "POST /campaigns/:id/duplicate failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao duplicar campanha" });
    }
  });

  router.post("/campaigns/:id/generate", requireOwner, requireAdvertisingNewActions, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const campaign = await generateCampaignKit(id, bid(res));
      res.json({ campaign });
    } catch (err) {
      logger.error({ err }, "POST /campaigns/:id/generate failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao gerar kit" });
    }
  });

  router.post("/campaigns/:id/ai-recommendations", requireOwner, requireAdvertisingNewActions, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const recommendations = await analyzeCampaignImage(id, bid(res));
      res.json({ recommendations });
    } catch (err) {
      logger.error({ err }, "POST /campaigns/:id/ai-recommendations failed");
      res.status(502).json({
        error: err instanceof Error ? err.message : "Não foi possível analisar a imagem",
      });
    }
  });

  router.get("/campaigns/:id/metrics", requireOwner, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const metrics = await getCampaignMetrics(id, bid(res));
      if (!metrics) { res.status(404).json({ error: "Campanha não encontrada" }); return; }
      res.json({ metrics });
    } catch (err) {
      logger.error({ err }, "GET /campaigns/:id/metrics failed");
      res.status(500).json({ error: "Erro ao carregar métricas" });
    }
  });

  // ── Real ads (Zernio, paid in Kz) ──────────────────────────────────────────

  /** Quote: FX rate + USD estimate for a given AOA budget. */
  router.get("/campaigns/ads/quote", requireOwner, requireAdvertisingNewActions, (req, res) => {
    const budget = Number(req.query["budget"] ?? 0);
    const rate = effectiveAoaPerUsd();
    res.json({
      fxRateAoaPerUsd: rate,
      minBudgetAoa: CAMPAIGN_MIN_BUDGET_AOA,
      budgetUsd: budget > 0 ? aoaToWholeUsd(budget, rate) : 0,
      simulated: IS_ZERNIO_SIMULATION,
    });
  });

  router.post("/campaigns/:id/pay", requireOwner, requireAdvertisingNewActions, requireRecentReauth, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    const schema = z.discriminatedUnion("method", [
      z.object({ method: z.literal("carteira") }),
      z.object({ method: z.literal("multicaixa"), phone: aoPhoneSchema }),
    ]);
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Dados inválidos" }); return; }
    try {
      const campaign = parsed.data.method === "carteira"
        ? await payCampaignFromWallet(id, bid(res))
        : await payCampaignWithMulticaixa(id, bid(res), parsed.data.phone);
      res.json({ campaign });
    } catch (err) {
      if (err instanceof PaymentError) { res.status(err.statusCode).json({ error: err.message }); return; }
      logger.error({ err }, "POST /campaigns/:id/pay failed");
      res.status(500).json({ error: "Erro ao pagar a campanha" });
    }
  });

  router.post("/campaigns/:id/creative", requireOwner, requireAdvertisingNewActions, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const campaign = await startCreativeGeneration(id, bid(res));
      if (!campaign) {
        res.status(409).json({ error: "Não é possível gerar agora — termina a configuração, evita gerações simultâneas e confirma que a campanha ainda não foi publicada" });
        return;
      }
      res.json({ campaign });
    } catch (err) {
      logger.error({ err }, "POST /campaigns/:id/creative failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao gerar criativo" });
    }
  });

  router.post("/campaigns/:id/publish", requireOwner, requireAdvertisingNewActions, requireRecentReauth, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const campaign = await publishCampaign(id, bid(res));
      res.json({ campaign });
    } catch (err) {
      if (err instanceof PaymentError) { res.status(err.statusCode).json({ error: err.message }); return; }
      logger.error({ err }, "POST /campaigns/:id/publish failed");
      res.status(500).json({ error: "Erro ao publicar a campanha" });
    }
  });

  router.post("/campaigns/:id/control", requireOwner, requireRecentReauth, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    const parsed = z.object({ action: z.enum(["pause", "resume", "end"]) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Ação inválida" }); return; }
    if (parsed.data.action === "resume") {
      try {
        assertAdvertisingNewActionsEnabled();
      } catch (err) {
        if (err instanceof LaunchFeaturePausedError) {
          res.status(err.statusCode).json(launchFeaturePausedPayload(err));
          return;
        }
        throw err;
      }
    }
    try {
      const campaign = await controlCampaignAd(id, bid(res), parsed.data.action);
      res.json({ campaign });
    } catch (err) {
      if (err instanceof PaymentError) { res.status(err.statusCode).json({ error: err.message }); return; }
      logger.error({ err }, "POST /campaigns/:id/control failed");
      res.status(500).json({ error: "Erro ao alterar o anúncio" });
    }
  });

  router.get("/campaigns/:id/optimize", requireOwner, requireAdvertisingNewActions, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const suggestions = await generateOptimizationSuggestions(id, bid(res));
      res.json({ suggestions });
    } catch (err) {
      logger.error({ err }, "GET /campaigns/:id/optimize failed");
      res.status(500).json({ error: "Erro ao gerar sugestões" });
    }
  });

  // ── BUSINESS BRAIN ─────────────────────────────────────────────────────────────

  router.get("/brain/knowledge", requireOwner, async (_req, res) => {
    try {
      res.json({ entries: await listBusinessKnowledge(bid(res)) });
    } catch (err) {
      logger.error({ err }, "GET /brain/knowledge failed");
      res.status(500).json({ error: "Erro ao carregar o conhecimento" });
    }
  });

  router.post("/brain/knowledge", requireOwner, async (req, res) => {
    const parsed = proposeBusinessKnowledgeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Proposta de conhecimento inválida", details: parsed.error.issues });
      return;
    }
    try {
      const entry = await proposeBusinessKnowledge(bid(res), {
        ...parsed.data,
        provenance: parsed.data.provenance ?? {
          source: "owner",
          reviewedAt: new Date().toISOString(),
        },
      });
      res.status(201).json({ entry });
    } catch (err) {
      logger.error({ err }, "POST /brain/knowledge failed");
      res.status(500).json({ error: "Erro ao guardar a proposta" });
    }
  });

  router.post("/brain/knowledge/:id/review", requireOwner, requireRecentReauth, async (req, res) => {
    const parsed = reviewBusinessKnowledgeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Revisão inválida" });
      return;
    }
    try {
      const entry = await reviewBusinessKnowledge(
        bid(res),
        String(req.params["id"] ?? ""),
        parsed.data.decision,
        parsed.data.comment,
      );
      if (!entry) {
        res.status(404).json({ error: "Proposta pendente não encontrada" });
        return;
      }
      res.json({ entry });
    } catch (err) {
      logger.error({ err }, "POST /brain/knowledge/:id/review failed");
      res.status(500).json({ error: "Erro ao rever a proposta" });
    }
  });

  router.get("/brain/evaluations", requireOwner, async (_req, res) => {
    try {
      res.json({ evaluations: await listBusinessAiEvaluations(bid(res)) });
    } catch (err) {
      logger.error({ err }, "GET /brain/evaluations failed");
      res.status(500).json({ error: "Erro ao carregar avaliações" });
    }
  });

  // ── ASSISTANT ─────────────────────────────────────────────────────────────────

  router.get("/assistant/messages", requireOwner, async (_req, res) => {
    try {
      const messages = await listMessages(bid(res), 80);
      res.json({ messages });
    } catch (err) {
      logger.error({ err }, "GET /assistant/messages failed");
      res.status(500).json({ error: "Erro ao carregar mensagens" });
    }
  });

  router.post("/assistant/chat", requireOwner, async (req, res) => {
    const parsed = sendAssistantMessageSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Mensagem inválida" }); return; }
    try {
      const reply = await chat(parsed.data.message, bid(res));
      broadcastAssistantMessage(reply);
      res.json({ message: reply });
    } catch (err) {
      logger.error({ err }, "POST /assistant/chat failed");
      res.status(500).json({ error: "Erro ao processar mensagem" });
    }
  });

  router.post("/assistant/confirm", requireOwner, requireRecentReauth, async (req, res) => {
    const parsed = confirmActionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Dados inválidos" }); return; }
    try {
      const reply = await confirmAction(parsed.data.messageId, parsed.data.confirmed, bid(res));
      broadcastAssistantMessage(reply);
      res.json({ message: reply });
    } catch (err) {
      logger.error({ err }, "POST /assistant/confirm failed");
      res.status(500).json({ error: "Erro ao confirmar ação" });
    }
  });

  router.delete("/assistant/messages", requireOwner, async (_req, res) => {
    try {
      await clearMessages(bid(res));
      res.json({ cleared: true });
    } catch (err) {
      logger.error({ err }, "DELETE /assistant/messages failed");
      res.status(500).json({ error: "Erro ao limpar histórico" });
    }
  });

  router.post("/assistant/proactive/daily", requireOwner, requireNonessentialSummaries, async (_req, res) => {
    try {
      const msg = await proactiveDailySummary(bid(res));
      broadcastAssistantMessage(msg);
      res.json({ message: msg });
    } catch (err) {
      logger.error({ err }, "POST /assistant/proactive/daily failed");
      res.status(500).json({ error: "Erro ao gerar resumo" });
    }
  });

  router.post("/assistant/proactive/stale", requireOwner, requireNonessentialSummaries, async (_req, res) => {
    try {
      const msg = await proactiveStaleLeads(bid(res));
      if (msg) broadcastAssistantMessage(msg);
      res.json({ message: msg ?? null, found: !!msg });
    } catch (err) {
      logger.error({ err }, "POST /assistant/proactive/stale failed");
      res.status(500).json({ error: "Erro ao verificar leads parados" });
    }
  });

  router.get("/assistant/events", requireOwner, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const businessId = bid(res);
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 20_000);
    const unsub = subscribeToAssistantMessages((msg) => {
      if (msg.businessId !== businessId) return;
      res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
    });
    req.on("close", () => { clearInterval(keepAlive); unsub(); });
  });

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

  router.get("/notifications/vapid-key", requireOwner, (_req, res) => {
    const key = getVapidPublicKey();
    if (!key) { res.status(503).json({ error: "Push notifications não configuradas" }); return; }
    res.json({ vapidPublicKey: key });
  });

  router.post("/notifications/subscribe", requireOwner, async (req, res) => {
    try {
      await saveSubscription(req.body as PushSubscriptionJSON, bid(res));
      res.json({ subscribed: true });
    } catch (err) {
      logger.error({ err }, "POST /notifications/subscribe failed");
      res.status(500).json({ error: "Erro ao guardar subscrição" });
    }
  });

  router.delete("/notifications/subscribe", requireOwner, async (req, res) => {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) { res.status(400).json({ error: "endpoint obrigatório" }); return; }
    try {
      await removeSubscription(endpoint, bid(res));
      res.json({ unsubscribed: true });
    } catch (err) {
      logger.error({ err }, "DELETE /notifications/subscribe failed");
      res.status(500).json({ error: "Erro ao remover subscrição" });
    }
  });

  return router;
}
