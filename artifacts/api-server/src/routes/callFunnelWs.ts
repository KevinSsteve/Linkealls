import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { createGeminiLiveSession } from "../services/geminiLive.js";
import { getOrCreateProfile, buildCallAgentPrompt } from "../services/businessProfile.js";
import { updateLeadOnCallStart, processCallCompletion } from "../services/leads.js";
import { logger } from "../lib/logger.js";

const CALL_VOICE = "Kore";

/**
 * Loads the stored business profile and derives the agent's prompt from it.
 * Falls back to the generic qualification script if the DB is unreachable or
 * the profile is still empty — a broken profile must never block calls.
 */
async function resolveCallConfig() {
  try {
    const profile = await getOrCreateProfile();
    const { systemPrompt, greetingText } = buildCallAgentPrompt(profile);
    return {
      voiceName: CALL_VOICE,
      systemPrompt,
      greetingText,
      businessName: profile.name || "o negócio",
    };
  } catch (err) {
    logger.error({ err }, "Failed to load business profile; using generic prompt");
    const { systemPrompt, greetingText } = buildCallAgentPrompt(null);
    return { voiceName: CALL_VOICE, systemPrompt, greetingText, businessName: "o negócio" };
  }
}

type ServerMessage =
  | { type: "ready" }
  | { type: "audio"; data: string }
  | { type: "turn_complete" }
  | { type: "interrupted" }
  | { type: "transcript"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "closed" }
  | { type: "error"; message: string };

export function setupCallFunnelWebSocket(server: Server): void {
  // noServer + explicit upgrade routing: multiple WebSocketServer({ server, path })
  // instances on one HTTP server abort each other's upgrades with HTTP 400.
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
    // Extract leadId from query string if provided
    const url = new URL(req.url ?? "/", "http://localhost");
    const leadId = url.searchParams.get("leadId") ?? null;

    logger.info({ leadId }, "Call Funnel WebSocket client connected");

    let geminiSession: Awaited<ReturnType<typeof createGeminiLiveSession>> | null = null;
    let closed = false;

    // Accumulate full transcript for post-call extraction
    const transcriptLines: string[] = [];
    let businessName = "o negócio";

    function sendToClient(msg: ServerMessage) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    }

    // Mark lead as in-progress when call starts
    if (leadId) {
      updateLeadOnCallStart(leadId).catch((err) =>
        logger.error({ err, leadId }, "Failed to mark lead em_atendimento"),
      );
    }

    resolveCallConfig()
      .then((config) => {
        businessName = config.businessName;
        return createGeminiLiveSession(config, {
          onAudio: (base64) => { if (!closed) sendToClient({ type: "audio", data: base64 }); },
          onTurnComplete: () => { if (!closed) sendToClient({ type: "turn_complete" }); },
          onInterrupted: () => { if (!closed) sendToClient({ type: "interrupted" }); },
          onTranscript: (text) => {
            // AI speech transcript
            transcriptLines.push(`Assistente: ${text}`);
            if (!closed) sendToClient({ type: "transcript", text });
          },
          onInputTranscript: (text) => {
            // User speech transcript
            transcriptLines.push(`Cliente: ${text}`);
            if (!closed) sendToClient({ type: "user_transcript", text });
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
        const msg = JSON.parse(data.toString()) as { type: string; data?: string };
        if (msg.type === "audio" && msg.data && geminiSession) {
          geminiSession.sendAudio(msg.data);
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

      // Post-call extraction
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
