import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  createLead,
  getLead,
  listLeads,
  updateLeadState,
  chatWithLead,
  subscribeToLeadQualified,
} from "../services/leads.js";
import { leadOriginSchema, chatMessageSchema, updateLeadStateSchema } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Create session (visitor lands → lead created) ────────────────────────────

const createSessionSchema = z.object({
  origin: leadOriginSchema.optional(),
  chatMessages: z.array(chatMessageSchema).max(50).optional(),
});

router.post("/leads/session", async (req: Request, res: Response) => {
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }
  try {
    const lead = await createLead(
      parsed.data.origin ?? {},
      parsed.data.chatMessages ?? [],
    );
    res.status(201).json({ leadId: lead.id });
  } catch (err) {
    logger.error({ err }, "Failed to create lead session");
    res.status(500).json({ error: "Erro ao criar sessão" });
  }
});

// ─── List leads (owner inbox) ─────────────────────────────────────────────────

router.get("/leads", async (_req: Request, res: Response) => {
  try {
    const leads = await listLeads();
    res.json({ leads });
  } catch (err) {
    logger.error({ err }, "Failed to list leads");
    res.status(500).json({ error: "Erro ao carregar leads" });
  }
});

// ─── SSE: real-time notifications for owner ───────────────────────────────────
// MUST be declared before /leads/:id so "events" is not captured as :id.

router.get("/leads/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 20_000);

  const unsubscribe = subscribeToLeadQualified((leadId) => {
    res.write(`event: lead_qualified\ndata: ${JSON.stringify({ leadId })}\n\n`);
  });

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

// ─── Get single lead ──────────────────────────────────────────────────────────

router.get("/leads/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"] ?? "");
  try {
    const lead = await getLead(id);
    if (!lead) {
      res.status(404).json({ error: "Lead não encontrado" });
      return;
    }
    res.json({ lead });
  } catch (err) {
    logger.error({ err }, "Failed to get lead");
    res.status(500).json({ error: "Erro ao carregar lead" });
  }
});

// ─── Visitor text chat (Gemini) ───────────────────────────────────────────────

router.post("/leads/:id/chat", async (req: Request, res: Response) => {
  const id = String(req.params["id"] ?? "");
  const schema = z.object({ message: z.string().min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Mensagem inválida" });
    return;
  }
  try {
    const { reply } = await chatWithLead(id, parsed.data.message);
    res.json({ reply });
  } catch (err) {
    logger.error({ err, id }, "Lead text chat failed");
    res.status(500).json({ error: "Erro ao processar mensagem" });
  }
});

// ─── Update lead state ────────────────────────────────────────────────────────

router.patch("/leads/:id/state", async (req: Request, res: Response) => {
  const id = String(req.params["id"] ?? "");
  const parsed = updateLeadStateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Estado inválido" });
    return;
  }
  try {
    const lead = await updateLeadState(id, parsed.data.state);
    if (!lead) {
      res.status(404).json({ error: "Lead não encontrado" });
      return;
    }
    res.json({ lead });
  } catch (err) {
    logger.error({ err }, "Failed to update lead state");
    res.status(500).json({ error: "Erro ao atualizar estado" });
  }
});

export default router;
