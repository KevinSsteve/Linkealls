import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { updateBusinessProfileSchema } from "@workspace/db";
import { getOrCreateProfile, updateProfile, isProfileFilled } from "../services/businessProfile.js";
import { startSiteAnalysis, assistFromDescription, StartAnalysisError } from "../services/siteAnalysis.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const analyzeBodySchema = z.object({
  url: z.string().min(4).max(500),
});

const assistBodySchema = z.object({
  description: z.string().min(20).max(8000),
});

/** Full profile + analysis status (frontend polls this during analysis). */
router.get("/business-profile", async (_req, res) => {
  try {
    const profile = await getOrCreateProfile();
    res.json({ profile, filled: isProfileFilled(profile) });
  } catch (err) {
    logger.error({ err }, "Failed to load business profile");
    res.status(500).json({ error: "Não foi possível carregar o perfil" });
  }
});

/** Owner edits of the profile. */
router.put("/business-profile", async (req, res) => {
  const parsed = updateBusinessProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    return;
  }
  try {
    const profile = await updateProfile(parsed.data);
    res.json({ profile, filled: isProfileFilled(profile) });
  } catch (err) {
    logger.error({ err }, "Failed to update business profile");
    res.status(500).json({ error: "Não foi possível guardar o perfil" });
  }
});

/** Kicks off (re-)analysis of the given site URL. */
router.post("/business-profile/analyze", async (req, res) => {
  const parsed = analyzeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "URL inválido" });
    return;
  }
  try {
    await startSiteAnalysis(parsed.data.url);
    res.status(202).json({ started: true });
  } catch (err) {
    if (err instanceof StartAnalysisError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    logger.error({ err }, "Failed to start site analysis");
    res.status(500).json({ error: "Não foi possível iniciar a análise" });
  }
});

/** AI-assisted manual fill: free-form description → structured profile draft. */
router.post("/business-profile/assist", async (req, res) => {
  const parsed = assistBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Descreve o negócio com pelo menos 20 caracteres" });
    return;
  }
  try {
    const draft = await assistFromDescription(parsed.data.description);
    res.json({ draft });
  } catch (err) {
    logger.error({ err }, "Assist from description failed");
    res.status(500).json({ error: "A IA não conseguiu estruturar a descrição. Tenta de novo." });
  }
});

export default router;
