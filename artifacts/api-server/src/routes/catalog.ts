/**
 * Public catalog endpoints — no authentication required.
 * Serves the business profile data in a public-safe shape for the /catalogo page.
 */
import { Request, Response, Router } from "express";
import { db, businessProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateProfile } from "../services/businessProfile.js";
import { logger } from "../lib/logger.js";
import {
  getOfferingAnalyticsKey,
  recordCatalogEvent,
  withOfferingAnalyticsKey,
} from "../services/catalogAnalytics.js";
import { z } from "zod/v4";

const router = Router();

// Catalog events are deliberately lightweight, but still public. Keep abusive
// clients from turning the endpoint into an unbounded write surface.
const ANALYTICS_RATE_WINDOW_MS = 60_000;
const ANALYTICS_RATE_MAX = 60;
const analyticsRateBuckets = new Map<string, { count: number; resetAt: number }>();
function catalogAnalyticsRateLimit(req: Request, res: Response, next: () => void): void {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? "unknown";
  const now = Date.now();
  const bucket = analyticsRateBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    analyticsRateBuckets.set(ip, { count: 1, resetAt: now + ANALYTICS_RATE_WINDOW_MS });
    if (analyticsRateBuckets.size > 10_000) {
      for (const [key, value] of analyticsRateBuckets) {
        if (value.resetAt < now) analyticsRateBuckets.delete(key);
      }
    }
    next();
    return;
  }
  bucket.count += 1;
  if (bucket.count > ANALYTICS_RATE_MAX) {
    res.status(429).json({ error: "Demasiados eventos — tenta daqui a pouco" });
    return;
  }
  next();
}

/** Shared helper: build the public catalog payload from a profile. */
function buildCatalogPayload(profile: Awaited<ReturnType<typeof getOrCreateProfile>>) {
  // A catalog can be public before its first product is added. Keep the
  // enabled/disabled switch as the source of truth and let the UI explain the
  // empty state instead of presenting an enabled catalog as unavailable.
  const isReady = profile.name.trim().length > 0;
  return {
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
  };
}

const catalogEventSchema = z.object({
  businessSlug: z.string().min(1).max(100),
  eventType: z.enum(["view", "click"]),
  offeringKey: z.string().length(24).optional(),
  visitorId: z.string().min(16).max(128),
});

/** POST /catalog/analytics — anonymous, deduplicated catalog engagement. */
router.post("/catalog/analytics", catalogAnalyticsRateLimit, async (req, res) => {
  const parsed = catalogEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Evento de catálogo inválido" });
    return;
  }

  try {
    const [profile] = await db
      .select()
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.slug, parsed.data.businessSlug.toLowerCase()))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Catálogo não encontrado" });
      return;
    }

    if (parsed.data.eventType === "click") {
      const validKeys = new Set(profile.offerings.map(getOfferingAnalyticsKey));
      if (!parsed.data.offeringKey || !validKeys.has(parsed.data.offeringKey)) {
        res.status(400).json({ error: "Produto inválido" });
        return;
      }
    }

    await recordCatalogEvent({
      businessId: profile.id,
      eventType: parsed.data.eventType,
      offeringKey: parsed.data.offeringKey,
      visitorId: parsed.data.visitorId,
    });
    res.status(202).json({ recorded: true });
  } catch (err) {
    logger.error({ err }, "POST /catalog/analytics failed");
    res.status(500).json({ error: "Não foi possível registar a métrica" });
  }
});

/** GET /catalog/by-handle/:handle — canonical public URL: /:handle. */
router.get("/catalog/by-handle/:handle", async (req, res) => {
  const handle = req.params.handle?.toLowerCase();
  if (!handle || !/^[a-z0-9-]+$/.test(handle)) {
    res.status(404).json({ error: "Catálogo não encontrado" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.slug, handle))
      .limit(1);
    if (rows.length === 0) {
      res.status(404).json({ error: "Catálogo não encontrado" });
      return;
    }
    res.json(buildCatalogPayload(rows[0]!));
  } catch (err) {
    logger.error({ err }, "Failed to load catalog by handle");
    res.status(500).json({ error: "Erro ao carregar catálogo" });
  }
});

/** GET /catalog/by-slug/:slug — resolve a vanity slug to catalog data. */
router.get("/catalog/by-slug/:slug", async (req, res) => {
  const slug = req.params.slug?.toLowerCase();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    res.status(404).json({ error: "Catálogo não encontrado" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.catalogSlug, slug))
      .limit(1);
    if (rows.length === 0) {
      res.status(404).json({ error: "Catálogo não encontrado" });
      return;
    }
    res.json(buildCatalogPayload(rows[0]!));
  } catch (err) {
    logger.error({ err }, "Failed to load catalog by slug");
    res.status(500).json({ error: "Erro ao carregar catálogo" });
  }
});

/** GET /catalog/slug-check/:slug — returns { available: boolean } for real-time validation. */
router.get("/catalog/slug-check/:slug", async (req, res) => {
  const slug = req.params.slug?.toLowerCase();
  if (!slug || !/^[a-z0-9-]+$/.test(slug) || slug.length < 3 || slug.length > 60) {
    res.json({ available: false, reason: "invalid" });
    return;
  }
  try {
    const rows = await db
      .select({ id: businessProfilesTable.id })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.catalogSlug, slug))
      .limit(1);
    res.json({ available: rows.length === 0 });
  } catch (err) {
    logger.error({ err }, "Failed to check slug availability");
    res.status(500).json({ error: "Erro ao verificar slug" });
  }
});

// Note: catalog toggle is performed via the standard PUT /business-profile endpoint
// with { catalogEnabled: boolean } — this goes through the owner-controlled mutation
// path that validates the full updateBusinessProfileSchema, consistent with all other
// owner writes in this single-tenant system.

export default router;
