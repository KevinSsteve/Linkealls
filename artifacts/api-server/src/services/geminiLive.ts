import {
  GoogleGenAI,
  Modality,
  StartSensitivity,
  EndSensitivity,
} from "@google/genai";
import { logger } from "../lib/logger.js";

// gemini-2.0-flash-live-001 does NOT exist for AI Studio keys.
// gemini-2.5-flash-native-audio-latest is confirmed working with bidiGenerateContent.
const MODEL = "gemini-2.5-flash-native-audio-latest";

// Best practice (Google docs): explicitly command the output language with
// "UNMISTAKABLY" to ensure consistent Portuguese output.
const SYSTEM_PROMPT = `
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
- Greet the user once at the start and wait for them to speak.
- Stay on whatever topic the user wants — this is an open conversation loop.
- If you don't understand something, ask one short clarifying question.
- Never say "As an AI..." or disclaim your limitations unprompted.
`.trim();

const GREETING_TEXT = "Olá! Estou aqui e pronto para conversar. Em que posso ajudar?";

export interface GeminiLiveSession {
  sendAudio: (base64Data: string) => void;
  sendGreeting: () => void;
  close: () => void;
}

export interface GeminiLiveCallbacks {
  onAudio: (base64: string) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onTranscript: (text: string) => void;      // AI speech → text
  onInputTranscript: (text: string) => void; // User speech → text
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

  let setupComplete = false;
  let pendingGreeting = false;

  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],

      // Voice selection — Kore is clear and natural for Portuguese
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" },
        },
      },

      // Disable dynamic thinking for lowest latency (real-time conversation)
      // (gemini-2.5-flash uses thinkingBudget; 0 = disabled)
      thinkingConfig: { thinkingBudget: 0 },

      // Enable transcription of both AI output and user input
      outputAudioTranscription: {},
      inputAudioTranscription: {},

      // VAD tuning: detect speech start quickly, wait a bit before ending turn
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
          prefixPaddingMs: 200,
          silenceDurationMs: 1000,
        },
      },

      // Context compression: keep long sessions from hitting token limits
      // (~25 tokens/sec of audio accumulates fast)
      contextWindowCompression: {
        triggerTokens: "25600",
        slidingWindow: { targetTokens: "12800" },
      },

      systemInstruction: SYSTEM_PROMPT,
    },
    callbacks: {
      onopen: () => {
        logger.info("Gemini Live session opened");
      },

      onmessage: (message) => {
        // Gate everything on setupComplete
        if (message.setupComplete && !setupComplete) {
          setupComplete = true;
          logger.info("Gemini Live setupComplete received");
          if (pendingGreeting) {
            sendGreetingInternal();
          }
        }

        const sc = message.serverContent;
        if (!sc) return;

        // AI audio chunks
        const parts = sc.modelTurn?.parts ?? [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            callbacks.onAudio(part.inlineData.data);
          }
        }

        // AI speech transcription (what the AI just said, as text)
        const outputTranscript = (sc as Record<string, unknown>).outputTranscription as
          | { text?: string }
          | undefined;
        if (outputTranscript?.text) {
          callbacks.onTranscript(outputTranscript.text);
        }

        // User speech transcription (what the user just said, as text)
        const inputTranscript = (sc as Record<string, unknown>).inputTranscription as
          | { text?: string }
          | undefined;
        if (inputTranscript?.text) {
          callbacks.onInputTranscript(inputTranscript.text);
        }

        if (sc.turnComplete) {
          callbacks.onTurnComplete();
        }
        if (sc.interrupted) {
          callbacks.onInterrupted();
        }
      },

      onerror: (error) => {
        logger.error({ error }, "Gemini Live error");
        callbacks.onError(error);
      },

      onclose: (event: { code?: number; reason?: string }) => {
        logger.info(
          { code: event?.code, reason: event?.reason },
          "Gemini Live session closed",
        );
        callbacks.onClose();
      },
    },
  });

  function sendGreetingInternal() {
    try {
      session.sendClientContent({
        turns: [{ role: "user", parts: [{ text: `Please greet the user. Say exactly: "${GREETING_TEXT}"` }] }],
        turnComplete: true,
      });
      logger.info("Gemini greeting sent");
    } catch (err) {
      logger.error({ err }, "Failed to send Gemini greeting");
    }
  }

  return {
    sendAudio: (base64Data: string) => {
      session.sendRealtimeInput({
        audio: { data: base64Data, mimeType: "audio/pcm;rate=16000" },
      });
    },

    sendGreeting: () => {
      if (setupComplete) {
        sendGreetingInternal();
      } else {
        pendingGreeting = true;
      }
    },

    close: () => {
      try {
        session.close();
      } catch {
        // Already closed
      }
    },
  };
}
