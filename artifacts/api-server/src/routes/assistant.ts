import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  chat,
  listMessages,
  clearMessages,
  confirmAction,
  subscribeToAssistantMessages,
  proactiveLeadQualified,
  proactiveDailySummary,
  proactiveStaleLeads,
  broadcastAssistantMessage,
} from "../services/assistant.js";
import { sendAssistantMessageSchema, confirmActionSchema } from "@workspace/db";
import { subscribeToLeadQualified } from "../services/leads.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Wire proactive events once at module load ────────────────────────────────

subscribeToLeadQualified(async (leadId) => {
  try {
    const msg = await proactiveLeadQualified(leadId);
    broadcastAssistantMessage(msg);
  } catch (err) {
    logger.error({ err, leadId }, "Failed to generate proactive lead-qualified message");
  }
});

// ─── GET /assistant/messages ─────────────────────────────────────────────────

router.get("/assistant/messages", async (_req: Request, res: Response) => {
  try {
    const messages = await listMessages(80);
    res.json({ messages });
  } catch (err) {
    logger.error({ err }, "Failed to list assistant messages");
    res.status(500).json({ error: "Erro ao carregar mensagens" });
  }
});

// ─── POST /assistant/chat ─────────────────────────────────────────────────────

router.post("/assistant/chat", async (req: Request, res: Response) => {
  const parsed = sendAssistantMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Mensagem inválida" });
    return;
  }
  try {
    const reply = await chat(parsed.data.message);
    // Broadcast to SSE subscribers (other tabs)
    broadcastAssistantMessage(reply);
    res.json({ message: reply });
  } catch (err) {
    logger.error({ err }, "Assistant chat failed");
    res.status(500).json({ error: "Erro ao processar mensagem" });
  }
});

// ─── POST /assistant/confirm ──────────────────────────────────────────────────

router.post("/assistant/confirm", async (req: Request, res: Response) => {
  const parsed = confirmActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }
  try {
    const reply = await confirmAction(parsed.data.messageId, parsed.data.confirmed);
    broadcastAssistantMessage(reply);
    res.json({ message: reply });
  } catch (err) {
    logger.error({ err }, "Failed to confirm action");
    res.status(500).json({ error: "Erro ao confirmar ação" });
  }
});

// ─── DELETE /assistant/messages ───────────────────────────────────────────────

router.delete("/assistant/messages", async (_req: Request, res: Response) => {
  try {
    await clearMessages();
    res.json({ cleared: true });
  } catch (err) {
    logger.error({ err }, "Failed to clear messages");
    res.status(500).json({ error: "Erro ao limpar histórico" });
  }
});

// ─── POST /assistant/proactive/daily ─────────────────────────────────────────

router.post("/assistant/proactive/daily", async (_req: Request, res: Response) => {
  try {
    const msg = await proactiveDailySummary();
    broadcastAssistantMessage(msg);
    res.json({ message: msg });
  } catch (err) {
    logger.error({ err }, "Failed to generate daily summary");
    res.status(500).json({ error: "Erro ao gerar resumo" });
  }
});

// ─── POST /assistant/proactive/stale ─────────────────────────────────────────

router.post("/assistant/proactive/stale", async (_req: Request, res: Response) => {
  try {
    const msg = await proactiveStaleLeads();
    if (msg) broadcastAssistantMessage(msg);
    res.json({ message: msg ?? null, found: !!msg });
  } catch (err) {
    logger.error({ err }, "Failed to check stale leads");
    res.status(500).json({ error: "Erro ao verificar leads parados" });
  }
});

// ─── GET /assistant/events (SSE) ──────────────────────────────────────────────
// MUST be before any /:id pattern in the mounted router.

router.get("/assistant/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const keepAlive = setInterval(() => res.write(": ping\n\n"), 20_000);

  const unsub = subscribeToAssistantMessages((msg) => {
    res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
  });

  req.on("close", () => {
    clearInterval(keepAlive);
    unsub();
  });
});

export default router;
