import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { businessProfilesTable } from "@workspace/db/schema";
import { and, isNotNull, eq } from "drizzle-orm";
import { replitAuthMiddleware } from "./middlewares/replitAuthMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(replitAuthMiddleware);

// ── SEO / GEO endpoints at root (before /api prefix) ─────────────────────────

app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(
    `User-agent: *\nAllow: /\n\nSitemap: ${process.env["PRODUCTION_URL"] ?? ""}/sitemap.xml\n`,
  );
});

app.get("/sitemap.xml", async (_req, res) => {
  try {
    const rows = await db
      .select({
        slug: businessProfilesTable.slug,
        catalogSlug: businessProfilesTable.catalogSlug,
        updatedAt: businessProfilesTable.updatedAt,
      })
      .from(businessProfilesTable)
      .where(
        and(
          isNotNull(businessProfilesTable.slug),
          eq(businessProfilesTable.catalogEnabled, true),
        ),
      );

    const base = process.env["PRODUCTION_URL"] ?? "https://app.linkealls.com";

    const urls = [
      `  <url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...rows.flatMap((r) => [
        `  <url><loc>${base}/${r.slug}</loc><changefreq>weekly</changefreq><priority>0.9</priority><lastmod>${r.updatedAt.toISOString().slice(0, 10)}</lastmod></url>`,
        `  <url><loc>${base}/e/${r.slug}/</loc><changefreq>weekly</changefreq><priority>0.8</priority><lastmod>${r.updatedAt.toISOString().slice(0, 10)}</lastmod></url>`,
        `  <url><loc>${base}/${r.slug}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
        ...(r.catalogSlug ? [`  <url><loc>${base}/c/${r.catalogSlug}</loc><changefreq>weekly</changefreq><priority>0.6</priority><lastmod>${r.updatedAt.toISOString().slice(0, 10)}</lastmod></url>`] : []),
      ]),
    ].join("\n");

    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
    );
  } catch {
    res.status(500).send("<?xml version=\"1.0\"?><urlset/>");
  }
});

app.use("/api", router);

export default app;
