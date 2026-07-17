import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  StartSensitivity,
  EndSensitivity,
} from "@google/genai";
import { logger } from "../lib/logger.js";

// gemini-3.1-flash-live-preview: latest real-time voice model from Google.
// Optimised for very low latency, full-duplex conversation, and barge-in.
// Migrated from gemini-2.5-flash-native-audio-latest per official migration guide.
const MODEL = "gemini-3.1-flash-live-preview";

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
- Greet the user warmly once at the start and wait for them to speak.
- Stay on whatever topic the user wants — this is an open conversation loop.
- If you don't understand something, ask one short clarifying question.
- Never say "As an AI..." or disclaim your limitations unprompted.
`.trim();

// In gemini-3.1, sendClientContent is only for seeding initial history.
// Use sendRealtimeInput({ text }) to send text during an active session.
const GREETING_TEXT =
  "Olá! Estou aqui e pronto para conversar. Em que posso ajudar?";

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

      // Voice — Kore is clear and natural for Portuguese
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" },
        },
      },

      // gemini-3.1 uses thinkingLevel (not thinkingBudget).
      // MINIMAL is the default and optimises for lowest latency.
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },

      // Enable transcription of both AI output and user input
      outputAudioTranscription: {},
      inputAudioTranscription: {},

      // VAD tuning: detect speech start quickly, wait before ending turn
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

        // gemini-3.1: a SINGLE event may contain multiple parts simultaneously
        // (e.g. inlineData audio chunk + transcript text in the same parts array).
        // Iterate ALL parts and handle each type independently.
        const parts = sc.modelTurn?.parts ?? [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            // Audio chunk
            callbacks.onAudio(part.inlineData.data);
          }
          if (part.text) {
            // Text part within model turn (transcript or inline text response)
            callbacks.onTranscript(part.text);
          }
        }

        // outputTranscription / inputTranscription are separate serverContent
        // fields (present in both 2.5 and 3.1, delivered as their own events)
        const sc2 = sc as Record<string, unknown>;
        const outputTranscript = sc2.outputTranscription as
          | { text?: string }
          | undefined;
        if (outputTranscript?.text) {
          callbacks.onTranscript(outputTranscript.text);
        }

        const inputTranscript = sc2.inputTranscription as
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
      // gemini-3.1: use sendRealtimeInput for text sent during an active session.
      // sendClientContent is reserved for seeding initial history only.
      session.sendRealtimeInput({ text: GREETING_TEXT });
      logger.info("Gemini greeting sent via sendRealtimeInput");
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
