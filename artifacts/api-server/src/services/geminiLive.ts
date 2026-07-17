import { GoogleGenAI } from "@google/genai";
import { logger } from "../lib/logger.js";

const MODEL = "models/gemini-2.0-flash-live-001";

const SYSTEM_PROMPT =
  "You are a helpful AI assistant. Speak naturally and concisely as if in a real-time phone conversation. " +
  "Keep your responses brief and conversational. Respond in the same language the user speaks.";

export interface GeminiLiveSession {
  sendAudio: (base64Data: string) => void;
  close: () => void;
}

export interface GeminiLiveCallbacks {
  onAudio: (base64: string) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onError: (err: unknown) => void;
  onClose: () => void;
}

export async function createGeminiLiveSession(
  callbacks: GeminiLiveCallbacks,
): Promise<GeminiLiveSession> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const ai = new GoogleGenAI({ apiKey });

  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Aoede" },
        },
      },
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
    },
    callbacks: {
      onopen: () => {
        logger.info("Gemini Live session opened");
      },
      onmessage: (message) => {
        // Handle audio parts from model turn
        const parts = message.serverContent?.modelTurn?.parts ?? [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            callbacks.onAudio(part.inlineData.data);
          }
        }

        // Handle turn state
        if (message.serverContent?.turnComplete) {
          callbacks.onTurnComplete();
        }
        if (message.serverContent?.interrupted) {
          callbacks.onInterrupted();
        }
      },
      onerror: (error) => {
        logger.error({ error }, "Gemini Live error");
        callbacks.onError(error);
      },
      onclose: (event) => {
        logger.info({ event }, "Gemini Live session closed");
        callbacks.onClose();
      },
    },
  });

  return {
    sendAudio: (base64Data: string) => {
      session.send({
        realtimeInput: {
          mediaChunks: [
            { mimeType: "audio/pcm;rate=16000", data: base64Data },
          ],
        },
      });
    },
    close: () => {
      try {
        session.close();
      } catch {
        // Ignore close errors
      }
    },
  };
}
