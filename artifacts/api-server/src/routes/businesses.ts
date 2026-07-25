/**
 * GET /api/businesses
 * Public endpoint — returns all businesses with a slug and catalogEnabled=true.
 * Used by the Linkealls homepage and sitemap generator.
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
      ...r,
      slug: r.slug!,
    }));

    res.json({ businesses });
  } catch {
    res.status(500).json({ error: "Erro ao listar negócios" });
  }
});

export default router;
