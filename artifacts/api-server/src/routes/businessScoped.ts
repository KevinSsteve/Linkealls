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
import { createHash } from "crypto";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
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
  getLead,
  listLeads,
  updateLeadState,
  chatWithLead,
  appendOwnerReply,
  subscribeToLeadQualified,
  getLeadsAnalytics,
} from "../services/leads.js";
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
import { getUserByToken, requestToken } from "./userAuth.js";
import { createPaymentsScopedRouter } from "./paymentsScoped.js";

function bid(res: Response): number {
  return res.locals["businessId"] as number;
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

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
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

  router.put("/profile", requireOwner, async (req, res) => {
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

  router.post("/profile/analyze", requireOwner, async (req, res) => {
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
      const rows = await db
        .select({ ownerPin: businessProfilesTable.ownerPin })
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.id, bid(res)));
      const stored = rows[0]?.ownerPin ?? null;
      if (!stored) { res.json({ ok: false, noPin: true }); return; }
      res.json({ ok: hashPin(pin) === stored });
    } catch (err) {
      logger.error({ err }, "POST /auth/pin/verify failed");
      res.status(500).json({ ok: false, error: "Erro interno" });
    }
  });

  router.post("/auth/pin/set", requireOwner, async (req, res) => {
    const pin = String(req.body?.pin ?? "").trim();
    if (!pin || pin.length < 4) {
      res.status(400).json({ ok: false, error: "O PIN deve ter pelo menos 4 dígitos" });
      return;
    }
    const currentPin = String(req.body?.currentPin ?? "").trim();
    try {
      const rows = await db
        .select({ ownerPin: businessProfilesTable.ownerPin })
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.id, bid(res)));
      const stored = rows[0]?.ownerPin ?? null;
      if (stored && !currentPin) {
        res.status(403).json({ ok: false, error: "PIN actual obrigatório para alterar" });
        return;
      }
      if (stored && hashPin(currentPin) !== stored) {
        res.status(403).json({ ok: false, error: "PIN actual incorreto" });
        return;
      }
      await db
        .update(businessProfilesTable)
        .set({ ownerPin: hashPin(pin), updatedAt: new Date() })
        .where(eq(businessProfilesTable.id, bid(res)));
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "POST /auth/pin/set failed");
      res.status(500).json({ ok: false, error: "Erro interno" });
    }
  });

  // ── LEADS ─────────────────────────────────────────────────────────────────────
  //
  // PUBLIC visitor endpoints (deliberately NOT behind requireOwner):
  //   POST /leads/session     — a visitor starts a conversation with the business
  //   POST /leads/:id/chat    — the visitor continues THEIR OWN conversation
  // Visitors have no account; the unguessable lead UUID (returned only to the
  // browser that created the session) acts as the capability to continue that
  // conversation. Both endpoints are rate-limited per IP to bound AI usage.
  // Everything else under /leads is owner-only.

  // Minimal in-memory per-IP rate limiter for the public AI endpoints.
  const RATE_WINDOW_MS = 60_000;
  const RATE_MAX = 20;
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  function publicRateLimit(req: Request, res: Response, next: () => void): void {
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const bucket = rateBuckets.get(ip);
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
      if (rateBuckets.size > 10_000) {
        for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k);
      }
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > RATE_MAX) {
      res.status(429).json({ error: "Demasiados pedidos — tenta daqui a pouco" });
      return;
    }
    next();
  }

  // ── PAYMENTS (Multicaixa Express) ────────────────────────────────────────────
  // Public checkout + owner sales/wallet/subscription — see paymentsScoped.ts.
  router.use(createPaymentsScopedRouter(requireOwner, bid, publicRateLimit));

  const createSessionSchema = z.object({
    origin: leadOriginSchema.optional(),
    chatMessages: z.array(chatMessageSchema).max(50).optional(),
  });

  router.post("/leads/session", publicRateLimit, async (req, res) => {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Dados inválidos" }); return; }
    try {
      const lead = await createLead(
        parsed.data.origin ?? {},
        parsed.data.chatMessages ?? [],
        bid(res),
      );
      res.status(201).json({ leadId: lead.id });
    } catch (err) {
      logger.error({ err }, "POST /leads/session failed");
      res.status(500).json({ error: "Erro ao criar sessão" });
    }
  });

  router.get("/leads", requireOwner, async (_req, res) => {
    try {
      const leads = await listLeads(bid(res));
      res.json({ leads });
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

  router.get("/leads/:id", requireOwner, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const lead = await getLead(id, bid(res));
      if (!lead) { res.status(404).json({ error: "Lead não encontrado" }); return; }
      res.json({ lead });
    } catch (err) {
      logger.error({ err }, "GET /leads/:id failed");
      res.status(500).json({ error: "Erro ao carregar lead" });
    }
  });

  router.post("/leads/:id/chat", publicRateLimit, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    const schema = z.object({ message: z.string().min(1).max(2000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Mensagem inválida" }); return; }
    try {
      const { reply, products } = await chatWithLead(id, parsed.data.message, bid(res));
      res.json({ reply, products });
    } catch (err) {
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
      res.json({ lead });
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
      res.json({ lead });
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
        sector: profile.sector,
        description: profile.description,
        differentials: profile.differentials,
        offerings: profile.offerings,
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

  router.post("/campaigns", requireOwner, async (req, res) => {
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
  router.get("/campaigns/targeting/locations", requireOwner, async (req, res) => {
    const query = typeof req.query["q"] === "string" ? req.query["q"].slice(0, 80) : "";
    try {
      const results = await searchMetaTargeting("city", query);
      res.json({ results });
    } catch (err) {
      logger.warn({ err }, "GET Meta location suggestions failed");
      res.status(503).json({ error: "Não foi possível consultar localizações Meta" });
    }
  });

  router.get("/campaigns/targeting/interests", requireOwner, async (req, res) => {
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
      res.json({ campaign });
    } catch (err) {
      logger.error({ err }, "GET /campaigns/:id failed");
      res.status(500).json({ error: "Erro ao carregar campanha" });
    }
  });

  router.patch("/campaigns/:id", requireOwner, async (req, res) => {
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

  router.patch("/campaigns/:id/setup", requireOwner, async (req, res) => {
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

  router.delete("/campaigns/:id", requireOwner, async (req, res) => {
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

  router.post("/campaigns/:id/duplicate", requireOwner, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const campaign = await duplicateCampaign(id, bid(res));
      res.status(201).json({ campaign });
    } catch (err) {
      logger.error({ err }, "POST /campaigns/:id/duplicate failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao duplicar campanha" });
    }
  });

  router.post("/campaigns/:id/generate", requireOwner, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const campaign = await generateCampaignKit(id, bid(res));
      res.json({ campaign });
    } catch (err) {
      logger.error({ err }, "POST /campaigns/:id/generate failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao gerar kit" });
    }
  });

  router.post("/campaigns/:id/ai-recommendations", requireOwner, async (req, res) => {
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
  router.get("/campaigns/ads/quote", requireOwner, (req, res) => {
    const budget = Number(req.query["budget"] ?? 0);
    const rate = effectiveAoaPerUsd();
    res.json({
      fxRateAoaPerUsd: rate,
      minBudgetAoa: CAMPAIGN_MIN_BUDGET_AOA,
      budgetUsd: budget > 0 ? aoaToWholeUsd(budget, rate) : 0,
      simulated: IS_ZERNIO_SIMULATION,
    });
  });

  router.post("/campaigns/:id/pay", requireOwner, async (req, res) => {
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

  router.post("/campaigns/:id/creative", requireOwner, async (req, res) => {
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

  router.post("/campaigns/:id/publish", requireOwner, async (req, res) => {
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

  router.post("/campaigns/:id/control", requireOwner, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    const parsed = z.object({ action: z.enum(["pause", "resume", "end"]) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Ação inválida" }); return; }
    try {
      const campaign = await controlCampaignAd(id, bid(res), parsed.data.action);
      res.json({ campaign });
    } catch (err) {
      if (err instanceof PaymentError) { res.status(err.statusCode).json({ error: err.message }); return; }
      logger.error({ err }, "POST /campaigns/:id/control failed");
      res.status(500).json({ error: "Erro ao alterar o anúncio" });
    }
  });

  router.get("/campaigns/:id/optimize", requireOwner, async (req, res) => {
    const id = String(req.params["id"] ?? "");
    try {
      const suggestions = await generateOptimizationSuggestions(id, bid(res));
      res.json({ suggestions });
    } catch (err) {
      logger.error({ err }, "GET /campaigns/:id/optimize failed");
      res.status(500).json({ error: "Erro ao gerar sugestões" });
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

  router.post("/assistant/confirm", requireOwner, async (req, res) => {
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

  router.post("/assistant/proactive/daily", requireOwner, async (_req, res) => {
    try {
      const msg = await proactiveDailySummary(bid(res));
      broadcastAssistantMessage(msg);
      res.json({ message: msg });
    } catch (err) {
      logger.error({ err }, "POST /assistant/proactive/daily failed");
      res.status(500).json({ error: "Erro ao gerar resumo" });
    }
  });

  router.post("/assistant/proactive/stale", requireOwner, async (_req, res) => {
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
