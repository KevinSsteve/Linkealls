import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "http";
import { createGeminiLiveSession } from "../services/geminiLive.js";
import { logger } from "../lib/logger.js";

export function setupVoiceWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/api/voice-ws" });

  wss.on("connection", (ws: WebSocket) => {
    logger.info("Voice WebSocket client connected");
    let geminiSession: { sendAudio: (b64: string) => void; close: () => void } | null = null;
    let closed = false;

    const sendToClient = (payload: unknown) => {
      if (!closed && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    };

    // Initialise Gemini Live session
    createGeminiLiveSession({
      onAudio: (base64) => sendToClient({ type: "audio", data: base64 }),
      onTurnComplete: () => sendToClient({ type: "turn_complete" }),
      onInterrupted: () => sendToClient({ type: "interrupted" }),
      onError: (err) => {
        logger.error({ err }, "Gemini session error");
        sendToClient({ type: "error", message: "AI service error" });
      },
      onClose: () => {
        if (!closed) sendToClient({ type: "closed" });
      },
    })
      .then((session) => {
        if (closed) {
          session.close();
          return;
        }
        geminiSession = session;
        sendToClient({ type: "ready" });
        logger.info("Gemini Live session ready for client");
      })
      .catch((err) => {
        logger.error({ err }, "Failed to create Gemini session");
        sendToClient({ type: "error", message: "Failed to connect to AI service" });
        ws.close();
      });

    // Receive audio from browser and forward to Gemini
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; data?: string };
        if (msg.type === "audio" && msg.data && geminiSession) {
          geminiSession.sendAudio(msg.data);
        }
      } catch (err) {
        logger.error({ err }, "Failed to handle WebSocket message");
      }
    });

    ws.on("close", () => {
      logger.info("Voice WebSocket client disconnected");
      closed = true;
      geminiSession?.close();
      geminiSession = null;
    });

    ws.on("error", (err) => {
      logger.error({ err }, "Voice WebSocket error");
      closed = true;
      geminiSession?.close();
      geminiSession = null;
    });
  });

  logger.info("Voice WebSocket server initialised at /api/voice-ws");
}
