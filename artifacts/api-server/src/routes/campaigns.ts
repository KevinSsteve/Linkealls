import { Router, type Request, type Response } from "express";
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  duplicateCampaign,
  updateCampaign,
  generateCampaignKit,
  getCampaignMetrics,
  generateOptimizationSuggestions,
} from "../services/campaigns.js";
import { createCampaignSchema, updateCampaignSchema } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── GET /campaigns ────────────────────────────────────────────────────────────

router.get("/campaigns", async (_req: Request, res: Response) => {
  try {
    const campaigns = await listCampaigns();
    res.json({ campaigns });
  } catch (err) {
    logger.error({ err }, "Failed to list campaigns");
    res.status(500).json({ error: "Erro ao carregar campanhas" });
  }
});

// ─── POST /campaigns ───────────────────────────────────────────────────────────

router.post("/campaigns", async (req: Request, res: Response) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error });
    return;
  }
  try {
    const campaign = await createCampaign(parsed.data);
    res.status(201).json({ campaign });
  } catch (err) {
    logger.error({ err }, "Failed to create campaign");
    // Postgres unique violation
    const pg = err as { code?: string };
    if (pg.code === "23505") {
      res.status(409).json({ error: "Já existe uma campanha com este nome. Escolhe um nome diferente." });
      return;
    }
    res.status(500).json({ error: "Erro ao criar campanha" });
  }
});

// ─── GET /campaigns/:id ────────────────────────────────────────────────────────

router.get("/campaigns/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"] ?? "");
  try {
    const campaign = await getCampaign(id);
    if (!campaign) { res.status(404).json({ error: "Campanha não encontrada" }); return; }
    res.json({ campaign });
  } catch (err) {
    logger.error({ err }, "Failed to get campaign");
    res.status(500).json({ error: "Erro ao carregar campanha" });
  }
});

// ─── PATCH /campaigns/:id ─────────────────────────────────────────────────────

router.patch("/campaigns/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"] ?? "");
  const parsed = updateCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }
  try {
    const campaign = await updateCampaign(id, parsed.data);
    if (!campaign) { res.status(404).json({ error: "Campanha não encontrada" }); return; }
    res.json({ campaign });
  } catch (err) {
    logger.error({ err }, "Failed to update campaign");
    res.status(500).json({ error: "Erro ao atualizar campanha" });
  }
});

// ─── POST /campaigns/:id/duplicate ────────────────────────────────────────────

router.post("/campaigns/:id/duplicate", async (req: Request, res: Response) => {
  const id = String(req.params["id"] ?? "");
  try {
    const campaign = await duplicateCampaign(id);
    res.status(201).json({ campaign });
  } catch (err) {
    logger.error({ err }, "Failed to duplicate campaign");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao duplicar campanha" });
  }
});

// ─── POST /campaigns/:id/generate ─────────────────────────────────────────────

router.post("/campaigns/:id/generate", async (req: Request, res: Response) => {
  const id = String(req.params["id"] ?? "");
  try {
    const campaign = await generateCampaignKit(id);
    res.json({ campaign });
  } catch (err) {
    logger.error({ err }, "Failed to generate campaign kit");
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao gerar kit" });
  }
});

// ─── GET /campaigns/:id/metrics ───────────────────────────────────────────────

router.get("/campaigns/:id/metrics", async (req: Request, res: Response) => {
  const id = String(req.params["id"] ?? "");
  try {
    const metrics = await getCampaignMetrics(id);
    if (!metrics) { res.status(404).json({ error: "Campanha não encontrada" }); return; }
    res.json({ metrics });
  } catch (err) {
    logger.error({ err }, "Failed to get campaign metrics");
    res.status(500).json({ error: "Erro ao carregar métricas" });
  }
});

// ─── GET /campaigns/:id/optimize ─────────────────────────────────────────────

router.get("/campaigns/:id/optimize", async (req: Request, res: Response) => {
  const id = String(req.params["id"] ?? "");
  try {
    const suggestions = await generateOptimizationSuggestions(id);
    res.json({ suggestions });
  } catch (err) {
    logger.error({ err }, "Failed to generate optimization suggestions");
    res.status(500).json({ error: "Erro ao gerar sugestões" });
  }
});

export default router;
