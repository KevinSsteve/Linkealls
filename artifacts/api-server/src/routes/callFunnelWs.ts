import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { createCallFunnelSession } from "../services/callFunnelGemini.js";
import { logger } from "../lib/logger.js";

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
  const wss = new WebSocketServer({ server, path: "/api/call-funnel-ws" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    logger.info("Call Funnel WebSocket client connected");

    let geminiSession: Awaited<ReturnType<typeof createCallFunnelSession>> | null = null;
    let closed = false;

    function sendToClient(msg: ServerMessage) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    }

    createCallFunnelSession({
      onAudio: (base64) => { if (!closed) sendToClient({ type: "audio", data: base64 }); },
      onTurnComplete: () => { if (!closed) sendToClient({ type: "turn_complete" }); },
      onInterrupted: () => { if (!closed) sendToClient({ type: "interrupted" }); },
      onTranscript: (text) => { if (!closed) sendToClient({ type: "transcript", text }); },
      onInputTranscript: (text) => { if (!closed) sendToClient({ type: "user_transcript", text }); },
      onError: () => { if (!closed) sendToClient({ type: "error", message: "AI service error" }); },
      onClose: () => { if (!closed) sendToClient({ type: "closed" }); },
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
      logger.info("Call Funnel WebSocket client disconnected");
      closed = true;
      geminiSession?.close();
      geminiSession = null;
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
