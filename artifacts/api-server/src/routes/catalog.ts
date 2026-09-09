/**
 * Public catalog endpoints — no authentication required.
 * Serves the business profile data in a public-safe shape for the /catalogo page.
 */
import { Router } from "express";
import { db, businessProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOrCreateProfile } from "../services/businessProfile.js";
import { logger } from "../lib/logger.js";

const router = Router();

/** Shared helper: build the public catalog payload from a profile. */
function buildCatalogPayload(profile: Awaited<ReturnType<typeof getOrCreateProfile>>) {
  const isReady = profile.name.trim().length > 0 && profile.offerings.length > 0;
  return {
    businessSlug: profile.slug ?? null,
    name: profile.name,
    avatarUrl: profile.avatarUrl ?? null,
    sector: profile.sector,
    description: profile.description,
    differentials: profile.differentials,
    offerings: profile.offerings,
    faq: profile.faq,
    catalogEnabled: profile.catalogEnabled,
    catalogSlug: profile.catalogSlug ?? null,
    isReady,
  };
}

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
