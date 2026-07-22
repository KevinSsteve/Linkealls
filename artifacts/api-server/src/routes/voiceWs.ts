import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { createGeminiLiveSession } from "../services/geminiLive.js";
import { logger } from "../lib/logger.js";

const VOICE_CONFIG = {
  voiceName: "Kore",
  systemPrompt: `
You are a friendly and helpful AI voice assistant named Gemini.
Your role is to have a natural, real-time voice conversation with the user.

PERSONA:
- Warm, concise, and conversational — as if on a phone call.
- Keep answers short (1-3 sentences) unless the user explicitly wants detail.
- Never list items or use bullet points — speak naturally.
- Do not repeat what the user said back to them.

LANGUAGE:
RESPOND UNMISTAKABLY IN EUROPEAN PORTUGUESE (Portugal). If the user switches language, follow them.

CONVERSATIONAL RULES:
- Greet the user warmly once at the start and wait for them to speak.
- Stay on whatever topic the user wants — this is an open conversation loop.
- If you don't understand something, ask one short clarifying question.
- Never say "As an AI..." or disclaim your limitations unprompted.
`.trim(),
  greetingText: "Olá! Estou aqui e pronto para conversar. Em que posso ajudar?",
};

type ServerMessage =
  | { type: "ready" }
  | { type: "audio"; data: string }
  | { type: "turn_complete" }
  | { type: "interrupted" }
  | { type: "transcript"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "closed" }
  | { type: "error"; message: string };

export function setupVoiceWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/api/voice-ws" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    logger.info("Voice WebSocket client connected");

    let geminiSession: Awaited<ReturnType<typeof createGeminiLiveSession>> | null = null;
    let closed = false;

    function sendToClient(msg: ServerMessage) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    }

    createGeminiLiveSession(VOICE_CONFIG, {
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
        logger.info("Voice session ready, sending greeting");
        session.sendGreeting();
      })
      .catch((err) => {
        logger.error({ err }, "Failed to create Voice session");
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
        logger.error({ err }, "Failed to handle Voice WebSocket message");
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
