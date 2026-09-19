/**
 * Storage routes — presigned-URL upload + object serving.
 * Single-tenant (no auth gate on this app); owner UI is the only caller.
 */
import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";
import { z } from "zod";
import { getUserByToken, requestToken } from "./userAuth.js";
import { and, eq } from "drizzle-orm";
import { db, businessProfilesTable, ordersTable } from "@workspace/db";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const RequestUploadUrlBody = z.object({
  name: z.string().trim().min(1).max(200),
  size: z.number().int().positive().max(50 * 1024 * 1024),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime"]),
  businessSlug: z.string().trim().min(1).max(80),
  purpose: z.enum(["traffic_creative", "general"]).optional().default("general"),
}).superRefine((value, ctx) => {
  if (value.purpose === "general" && value.size > 10 * 1024 * 1024) {
    ctx.addIssue({ code: "custom", path: ["size"], message: "O ficheiro não pode ultrapassar 10 MB" });
  }
  if (value.purpose === "traffic_creative" && value.size > 50 * 1024 * 1024) {
    ctx.addIssue({ code: "custom", path: ["size"], message: "O vídeo não pode ultrapassar 50 MB" });
  }
});

async function requireSession(req: Request, res: Response, next: () => void): Promise<void> {
  try {
    const user = await getUserByToken(requestToken(req));
    if (!user) {
      res.status(401).json({ error: "Sessão inválida — inicia sessão novamente" });
      return;
    }
    next();
  } catch (error) {
    logger.error({ err: error }, "Storage authentication failed");
    res.status(500).json({ error: "Erro interno" });
  }
}

/**
 * POST /storage/uploads/request-url
 * Single-tenant: no auth gate — this API is only reachable by the owner UI.
 */
router.post("/storage/uploads/request-url", requireSession, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid fields: name, size, contentType required" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;
    const user = await getUserByToken(requestToken(req));
    if (!user?.handle || user.handle !== parsed.data.businessSlug) {
      res.status(403).json({ error: "Sem permissão para carregar ficheiros neste negócio" });
      return;
    }
    const prefix = parsed.data.purpose === "traffic_creative"
      ? `traffic-creatives/${parsed.data.businessSlug}`
      : "uploads";
    const uploadURL = await objectStorageService.getObjectEntityUploadURL(prefix);
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    logger.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 * Unconditionally public — serves assets from PUBLIC_OBJECT_SEARCH_PATHS.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) { res.status(404).json({ error: "File not found" }); return; }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    logger.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 * Serves private object entities (product images, etc.).
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    // Order proofs use a dedicated private prefix. Unlike catalog assets,
    // they must only be readable by the owner of the matching business.
    if (wildcardPath.startsWith("order-proofs/")) {
      const user = await getUserByToken(requestToken(req));
      if (!user) {
        res.status(401).json({ error: "Sessão necessária" });
        return;
      }
      const objectPath = `/objects/${wildcardPath}`;
      const matches = await db
        .select({ slug: businessProfilesTable.slug })
        .from(ordersTable)
        .innerJoin(businessProfilesTable, eq(ordersTable.businessId, businessProfilesTable.id))
        .where(and(eq(ordersTable.proofObjectPath, objectPath), eq(ordersTable.proofStatus, "recebido")))
        .limit(1);
      if (!matches[0] || user.handle !== matches[0].slug) {
        res.status(403).json({ error: "Sem permissão para ver este comprovativo" });
        return;
      }
    }
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    logger.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
