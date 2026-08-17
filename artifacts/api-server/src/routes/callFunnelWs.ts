import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { createGeminiLiveSession } from "../services/geminiLive.js";
import {
  getProfileBySlug,
  buildCallAgentPrompt,
} from "../services/businessProfile.js";
import { updateLeadOnCallStart, processCallCompletion } from "../services/leads.js";
import { createProductOrder, getOrderPublicStatus } from "../services/payments.js";
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
  | { type: "checkout"; orderId: string; offeringName: string; amount: number; simulated: boolean; merchantTransactionId: string }
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

            } else if (call.name === "initiate_checkout") {
              const args = call.args as { product_name: string; quantity: number; phone: string; buyer_name?: string };
              if (resolvedBusinessId === null) {
                sendResponse({ status: "error", message: "Negócio não disponível para pagamentos." } as Record<string, unknown>);
                return;
              }

              // Validate & normalise phone: strip +244 / spaces, require 9XXXXXXXX
              const rawPhone = String(args.phone ?? "").replace(/[\s\-+]/g, "").replace(/^244/, "");
              if (!/^9\d{8}$/.test(rawPhone)) {
                sendResponse({ status: "error", message: "Número de telemóvel inválido. Pedir ao cliente o número completo no formato 9XXXXXXXX." } as Record<string, unknown>);
                return;
              }

              // Validate quantity
              const qty = Math.round(Number(args.quantity));
              if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
                sendResponse({ status: "error", message: "Quantidade inválida. Deve ser entre 1 e 99." } as Record<string, unknown>);
                return;
              }

              // Fire the order creation asynchronously so we can respond to Gemini quickly
              createProductOrder(resolvedBusinessId, {
                offeringName: String(args.product_name ?? "").trim(),
                quantity: qty,
                phone: rawPhone,
                buyerName: args.buyer_name,
              })
                .then(({ order, simulated }) => {
                  if (!closed) {
                    sendToClient({
                      type: "checkout",
                      orderId: order.id,
                      offeringName: order.offeringName,
                      amount: Number(order.amount),
                      simulated,
                      merchantTransactionId: order.merchantTransactionId,
                    });
                  }
                  sendResponse({
                    status: "success",
                    order_id: order.id,
                    message: `Encomenda criada. O ecrã de pagamento Multicaixa Express abriu no telemóvel do cliente.`,
                  } as Record<string, unknown>);
                  transcriptLines.push(`Sistema: checkout iniciado para ${args.product_name} (${order.id})`);
                  logger.info({ orderId: order.id, offeringName: args.product_name }, "initiate_checkout: order created");
                })
                .catch((err: Error) => {
                  logger.error({ err }, "initiate_checkout: failed to create order");
                  sendResponse({ status: "error", message: err.message ?? "Erro ao criar encomenda." } as Record<string, unknown>);
                });

            } else if (call.name === "check_order_status") {
              const args = call.args as { order_id: string };
              if (resolvedBusinessId === null) {
                sendResponse({ status: "error", message: "Negócio não disponível." } as Record<string, unknown>);
                return;
              }
              const scopedBusinessId = resolvedBusinessId;
              getOrderPublicStatus(args.order_id)
                .then((order) => {
                  if (!order) {
                    sendResponse({ status: "error", message: "Encomenda não encontrada." } as Record<string, unknown>);
                    return;
                  }
                  // Enforce business ownership — do NOT disclose other businesses' orders
                  if (order.businessId !== scopedBusinessId) {
                    sendResponse({ status: "error", message: "Encomenda não encontrada." } as Record<string, unknown>);
                    return;
                  }
                  const statusMap: Record<string, string> = {
                    pendente: "pendente — aguarda aprovação do cliente",
                    paga: "paga — pagamento confirmado com sucesso",
                    falhada: "falhada — pagamento recusado ou expirado",
                    expirada: "expirada — tempo limite ultrapassado",
                  };
                  sendResponse({
                    status: "success",
                    order_status: order.status,
                    description: statusMap[order.status] ?? order.status,
                    order_id: order.id,
                  } as Record<string, unknown>);
                })
                .catch((err: Error) => {
                  logger.error({ err }, "check_order_status: failed");
                  sendResponse({ status: "error", message: "Erro ao consultar pagamento." } as Record<string, unknown>);
                });
            } else {
              sendResponse({ status: "error", message: `Tool "${call.name}" not implemented.` } as Record<string, unknown>);
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
        const msg = JSON.parse(data.toString()) as { type: string; data?: string; text?: string; orderId?: string; status?: string; offeringName?: string };
        if (msg.type === "audio" && msg.data && geminiSession) {
          geminiSession.sendAudio(msg.data);
        } else if (msg.type === "user_text" && msg.text && geminiSession) {
          transcriptLines.push(`Cliente: ${msg.text}`);
          geminiSession.sendText(msg.text);
        } else if (msg.type === "payment_result" && msg.orderId && msg.status && geminiSession) {
          // Client notifies the agent of the payment outcome so it can react naturally
          const statusPt =
            msg.status === "paga" ? "confirmado com sucesso" :
            msg.status === "falhada" ? "falhado" : "expirado";
          const productLabel = msg.offeringName ? ` de "${msg.offeringName}"` : "";
          const systemMsg = `[Sistema] O pagamento${productLabel} foi ${statusPt}. Reagir naturalmente.`;
          transcriptLines.push(`Sistema: pagamento ${msg.status} para ${msg.offeringName ?? msg.orderId}`);
          geminiSession.sendText(systemMsg);
          logger.info({ orderId: msg.orderId, status: msg.status }, "Payment result forwarded to Gemini");
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
