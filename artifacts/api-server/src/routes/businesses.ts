/**
 * GET /api/businesses
 * Public endpoint — returns all businesses with a slug.
 * Used by the Linkealls homepage, sitemap generator, and the Mercado discovery page.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { businessProfilesTable } from "@workspace/db/schema";
import { and, isNotNull, eq } from "drizzle-orm";

const router = Router();

export interface PublicBusiness {
  id: number;
  slug: string;
  name: string;
  sector: string;
  description: string;
  /** True when the AI profile has been fully configured (analysisStatus = 'done') */
  hasActiveAI: boolean;
  /** True when the public catalog is enabled */
  catalogEnabled: boolean;
}

router.get("/businesses", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: businessProfilesTable.id,
        slug: businessProfilesTable.slug,
        name: businessProfilesTable.name,
        sector: businessProfilesTable.sector,
        description: businessProfilesTable.description,
        analysisStatus: businessProfilesTable.analysisStatus,
        catalogEnabled: businessProfilesTable.catalogEnabled,
      })
      .from(businessProfilesTable)
      .where(
        and(
          isNotNull(businessProfilesTable.slug),
          eq(businessProfilesTable.catalogEnabled, true),
        ),
      );

    // slug is guaranteed non-null by the WHERE clause
    const businesses: PublicBusiness[] = rows.map((r) => ({
      id: r.id,
      slug: r.slug!,
      name: r.name,
      sector: r.sector,
      description: r.description,
      hasActiveAI: r.analysisStatus === "done",
      catalogEnabled: r.catalogEnabled ?? false,
    }));

    res.json({ businesses });
  } catch {
    res.status(500).json({ error: "Erro ao listar negócios" });
  }
});

export default router;
