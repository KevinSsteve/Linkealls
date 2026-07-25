import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { createGeminiLiveSession } from "../services/geminiLive.js";
import { getOrCreateProfile, buildCallAgentPrompt } from "../services/businessProfile.js";
import { updateLeadOnCallStart, processCallCompletion } from "../services/leads.js";
import { logger } from "../lib/logger.js";
import type { Offering } from "@workspace/db";

const CALL_VOICE = "Kore";

async function resolveCallConfig() {
  try {
    const profile = await getOrCreateProfile();
    const { systemPrompt, greetingText } = buildCallAgentPrompt(profile);
    return {
      voiceName: CALL_VOICE,
      systemPrompt,
      greetingText,
      businessName: profile.name || "o negócio",
      offerings: profile.offerings,
    };
  } catch (err) {
    logger.error({ err }, "Failed to load business profile; using generic prompt");
    const { systemPrompt, greetingText } = buildCallAgentPrompt(null);
    return { voiceName: CALL_VOICE, systemPrompt, greetingText, businessName: "o negócio", offerings: [] as Offering[] };
  }
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

    logger.info({ leadId }, "Call Funnel WebSocket client connected");

    let geminiSession: Awaited<ReturnType<typeof createGeminiLiveSession>> | null = null;
    let closed = false;
    let sessionOfferings: Offering[] = [];

    const transcriptLines: string[] = [];
    let businessName = "o negócio";

    function sendToClient(msg: ServerMessage) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    }

    if (leadId) {
      updateLeadOnCallStart(leadId).catch((err) =>
        logger.error({ err, leadId }, "Failed to mark lead em_atendimento"),
      );
    }

    resolveCallConfig()
      .then((config) => {
        businessName = config.businessName;
        sessionOfferings = config.offerings;
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
          onToolCall: (call) => {
            if (call.name === "show_product_catalog") {
              const args = call.args as { query?: string; product_names?: string[] };
              const requestedNames: string[] = args.product_names ?? [];

              // Filter offerings by requested product names (case-insensitive fuzzy match)
              let products: ProductCard[] = requestedNames.length > 0
                ? sessionOfferings.filter((o) =>
                    requestedNames.some((n) =>
                      o.name.toLowerCase().includes(n.toLowerCase()) ||
                      n.toLowerCase().includes(o.name.toLowerCase()),
                    ),
                  )
                : sessionOfferings; // If no specific names, show all

              // Fallback: search by query text if no exact matches
              if (products.length === 0 && args.query) {
                const q = args.query.toLowerCase();
                products = sessionOfferings.filter(
                  (o) =>
                    o.name.toLowerCase().includes(q) ||
                    o.description.toLowerCase().includes(q),
                );
              }

              // Final fallback: show all offerings
              if (products.length === 0) {
                products = sessionOfferings;
              }

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

              // Send function response back to Gemini
              geminiSession?.sendToolResponse(call.id, {
                status: "success",
                message: `${cards.length} produto(s) mostrado(s) visualmente no ecrã do cliente.`,
              });
            }
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
          // Lead selected a product or sent a text message during the call
          transcriptLines.push(`Cliente: ${msg.text}`);
          geminiSession.sendText(msg.text);
        }
      } catch (err) {
        logger.error({ err }, "Failed to handle Call Funnel WebSocket message");
      }
    });

    ws.on("close", () => {
      logger.info({ leadId }, "Call Funnel WebSocket client disconnected");
      closed = true;
      geminiSession?.close();
      geminiSession = null;

      if (leadId && transcriptLines.length > 0) {
        const fullTranscript = transcriptLines.join("\n");
        processCallCompletion(leadId, fullTranscript, businessName).catch((err) =>
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
