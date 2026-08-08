import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { createGeminiLiveSession } from "../services/geminiLive.js";
import {
  getProfileBySlug,
  buildCallAgentPrompt,
} from "../services/businessProfile.js";
import { updateLeadOnCallStart, processCallCompletion } from "../services/leads.js";
import { logger } from "../lib/logger.js";
import type { Offering } from "@workspace/db";

const CALL_VOICE = "Kore";

/**
 * Resolves the call configuration for a business slug.
 * Returns null when the slug is missing or unknown — the call cannot
 * proceed without knowing which business the visitor is talking to.
 */
async function resolveCallConfig(businessSlug?: string | null) {
  if (!businessSlug) return null;
  const profile = await getProfileBySlug(businessSlug);
  if (!profile) return null;

  const { systemPrompt, greetingText } = buildCallAgentPrompt(profile);
  return {
    voiceName: CALL_VOICE,
    systemPrompt,
    greetingText,
    businessName: profile.name || "o negócio",
    offerings: profile.offerings,
    businessId: profile.id,
  };
}

export interface ProductCard {
  name: string;
  price: string;
  description: string;
  imageUrl?: string;
}

type ServerMessage =
  | { type: "ready" }
  | { type: "audio"; data: string }
  | { type: "turn_complete" }
  | { type: "interrupted" }
  | { type: "transcript"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "show_products"; products: ProductCard[] }
  | { type: "agent_message"; text: string }
  | { type: "closed" }
  | { type: "error"; message: string };

export function setupCallFunnelWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/call-funnel-ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const leadId = url.searchParams.get("leadId") ?? null;
    const businessSlug = url.searchParams.get("businessSlug") ?? null;

    logger.info({ leadId, businessSlug }, "Call Funnel WebSocket client connected");

    let geminiSession: Awaited<ReturnType<typeof createGeminiLiveSession>> | null = null;
    let closed = false;
    let sessionOfferings: Offering[] = [];
    let resolvedBusinessId: number | null = null;

    const transcriptLines: string[] = [];
    let businessName = "o negócio";

    function sendToClient(msg: ServerMessage) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    }

    resolveCallConfig(businessSlug)
      .then((config) => {
        if (!config) {
          sendToClient({ type: "error", message: "Negócio não encontrado" });
          ws.close();
          throw new Error(`Unknown business slug: ${businessSlug ?? "(none)"}`);
        }
        businessName = config.businessName;
        sessionOfferings = config.offerings;
        resolvedBusinessId = config.businessId;

        // Mark the lead as in-service — scoped so a leadId from another
        // business is a silent no-op (never mutates other tenants' data).
        if (leadId) {
          updateLeadOnCallStart(leadId, config.businessId).catch((err) =>
            logger.error({ err, leadId }, "Failed to mark lead em_atendimento"),
          );
        }
        return createGeminiLiveSession(config, {
          onAudio: (base64) => { if (!closed) sendToClient({ type: "audio", data: base64 }); },
          onTurnComplete: () => { if (!closed) sendToClient({ type: "turn_complete" }); },
          onInterrupted: () => { if (!closed) sendToClient({ type: "interrupted" }); },
          onTranscript: (text) => {
            transcriptLines.push(`Assistente: ${text}`);
            if (!closed) sendToClient({ type: "transcript", text });
          },
          onInputTranscript: (text) => {
            transcriptLines.push(`Cliente: ${text}`);
            if (!closed) sendToClient({ type: "user_transcript", text });
          },
          onToolCall: (call, sendResponse: (result: Record<string, unknown>) => void) => {
            if (call.name === "show_product_catalog") {
              const args = call.args as { query?: string; product_names?: string[] };
              const requestedNames: string[] = args.product_names ?? [];

              let products: ProductCard[] = requestedNames.length > 0
                ? sessionOfferings.filter((o) =>
                    requestedNames.some((n) =>
                      o.name.toLowerCase().includes(n.toLowerCase()) ||
                      n.toLowerCase().includes(o.name.toLowerCase()),
                    ),
                  )
                : sessionOfferings;

              if (products.length === 0 && args.query) {
                const q = args.query.toLowerCase();
                products = sessionOfferings.filter(
                  (o) =>
                    o.name.toLowerCase().includes(q) ||
                    o.description.toLowerCase().includes(q),
                );
              }

              if (products.length === 0) products = sessionOfferings;

              const cards: ProductCard[] = products.map((o) => ({
                name: o.name,
                price: o.price,
                description: o.description,
                imageUrl: o.imageUrl,
              }));

              logger.info({ query: args.query, count: cards.length }, "show_product_catalog called");

              if (!closed) {
                sendToClient({ type: "show_products", products: cards });
              }

              sendResponse({
                status: "success",
                message: `${cards.length} produto(s) mostrado(s) visualmente no ecrã do cliente.`,
              } as Record<string, unknown>);
            }
          },
          onAgentMessage: (text) => {
            if (!closed) sendToClient({ type: "agent_message", text });
          },
          onError: () => { if (!closed) sendToClient({ type: "error", message: "AI service error" }); },
          onClose: () => { if (!closed) sendToClient({ type: "closed" }); },
        });
      })
      .then((session) => {
        if (closed) { session.close(); return; }
        geminiSession = session;
        sendToClient({ type: "ready" });
        logger.info("Call Funnel session ready, sending greeting");
        session.sendGreeting();
      })
      .catch((err) => {
        logger.error({ err }, "Failed to create Call Funnel session");
        sendToClient({ type: "error", message: "Failed to connect to AI service" });
        ws.close();
      });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; data?: string; text?: string };
        if (msg.type === "audio" && msg.data && geminiSession) {
          geminiSession.sendAudio(msg.data);
        } else if (msg.type === "user_text" && msg.text && geminiSession) {
          transcriptLines.push(`Cliente: ${msg.text}`);
          geminiSession.sendText(msg.text);
        }
      } catch (err) {
        logger.error({ err }, "Failed to handle Call Funnel WebSocket message");
      }
    });

    ws.on("close", () => {
      logger.info({ leadId, businessSlug }, "Call Funnel WebSocket client disconnected");
      closed = true;
      geminiSession?.close();
      geminiSession = null;

      if (leadId && transcriptLines.length > 0 && resolvedBusinessId !== null) {
        const fullTranscript = transcriptLines.join("\n");
        processCallCompletion(leadId, fullTranscript, businessName, resolvedBusinessId).catch((err) =>
          logger.error({ err, leadId }, "processCallCompletion failed"),
        );
      }
    });

    ws.on("error", (err) => {
      logger.error({ err }, "Call Funnel WebSocket error");
      closed = true;
      geminiSession?.close();
      geminiSession = null;
    });
  });

  logger.info("Call Funnel WebSocket server initialised at /api/call-funnel-ws");
}
