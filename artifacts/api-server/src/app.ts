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
import { isAllowedBrowserOrigin } from "./lib/httpSecurity";

const app: Express = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

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
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    callback(null, isAllowedBrowserOrigin(origin));
  },
}));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));
app.use(replitAuthMiddleware);

// ── SEO / GEO endpoints at root (before /api prefix) ─────────────────────────

app.get("/robots.txt", (_req, res) => {
  const base = canonicalProductionUrl();
  res.type("text/plain").send(
    `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`,
  );
});

function canonicalProductionUrl(): string {
  const configured = process.env["PUBLIC_BASE_URL"] ?? process.env["PRODUCTION_URL"] ?? "https://app.linkealls.com";
  try {
    const parsed = new URL(configured);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "https://app.linkealls.com";
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

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

    const base = canonicalProductionUrl();

    const urls = [
      `  <url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...rows.flatMap((r) => [
        `  <url><loc>${escapeXml(`${base}/${encodeURIComponent(r.slug!)}`)}</loc><changefreq>weekly</changefreq><priority>0.9</priority><lastmod>${r.updatedAt.toISOString().slice(0, 10)}</lastmod></url>`,
        `  <url><loc>${escapeXml(`${base}/e/${encodeURIComponent(r.slug!)}/`)}</loc><changefreq>weekly</changefreq><priority>0.8</priority><lastmod>${r.updatedAt.toISOString().slice(0, 10)}</lastmod></url>`,
        ...(r.catalogSlug ? [`  <url><loc>${escapeXml(`${base}/c/${encodeURIComponent(r.catalogSlug)}`)}</loc><changefreq>weekly</changefreq><priority>0.6</priority><lastmod>${r.updatedAt.toISOString().slice(0, 10)}</lastmod></url>`] : []),
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
