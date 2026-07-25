/**
 * Public catalog endpoints — no authentication required.
 * Serves the business profile data in a public-safe shape for the /catalogo page.
 */
import { Router } from "express";
import { getOrCreateProfile } from "../services/businessProfile.js";
import { logger } from "../lib/logger.js";

const router = Router();

/** GET /catalog — public endpoint: returns business data for the catalog page. */
router.get("/catalog", async (_req, res) => {
  try {
    const profile = await getOrCreateProfile();
    const isReady =
      profile.name.trim().length > 0 && profile.offerings.length > 0;

    res.json({
      name: profile.name,
      sector: profile.sector,
      description: profile.description,
      differentials: profile.differentials,
      offerings: profile.offerings,
      faq: profile.faq,
      catalogEnabled: profile.catalogEnabled,
      isReady,
    });
  } catch (err) {
    logger.error({ err }, "Failed to load catalog");
    res.status(500).json({ error: "Erro ao carregar catálogo" });
  }
});

// Note: catalog toggle is performed via the standard PUT /business-profile endpoint
// with { catalogEnabled: boolean } — this goes through the owner-controlled mutation
// path that validates the full updateBusinessProfileSchema, consistent with all other
// owner writes in this single-tenant system.

export default router;
