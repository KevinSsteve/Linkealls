import { GoogleGenAI, Modality } from "@google/genai";
import { logger } from "../lib/logger.js";

const MODEL = "models/gemini-2.0-flash-live-001";

const GREETING_PROMPT =
  "Greet the user warmly and tell them you're ready to chat. " +
  "Keep it short and friendly — one or two sentences. Respond in the same language as this instruction — use Portuguese if unsure.";

const SYSTEM_PROMPT =
  "You are a helpful AI assistant in a real-time voice call. " +
  "Be concise and conversational, as if on a phone call. " +
  "Respond in the same language the user speaks.";

export interface GeminiLiveSession {
  sendAudio: (base64Data: string) => void;
  sendGreeting: () => void;
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
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Aoede" },
        },
      },
      systemInstruction: SYSTEM_PROMPT,
    },
    callbacks: {
      onopen: () => {
        logger.info("Gemini Live session opened");
      },

      onmessage: (message) => {
        // Extract audio chunks from model turn
        const parts = message.serverContent?.modelTurn?.parts ?? [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            callbacks.onAudio(part.inlineData.data);
          }
        }

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

  // session is fully resolved here — safe to close over it
  return {
    sendAudio: (base64Data: string) => {
      session.sendRealtimeInput({
        audio: { data: base64Data, mimeType: "audio/pcm;rate=16000" },
      });
    },

    sendGreeting: () => {
      session.sendClientContent({
        turns: [{ role: "user", parts: [{ text: GREETING_PROMPT }] }],
        turnComplete: true,
      });
    },

    close: () => {
      try {
        session.close();
      } catch {
        // ignore
      }
    },
  };
}
