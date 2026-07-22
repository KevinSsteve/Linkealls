import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  StartSensitivity,
  EndSensitivity,
} from "@google/genai";
import { logger } from "../lib/logger.js";

const MODEL = "gemini-3.1-flash-live-preview";

export interface GeminiSessionConfig {
  systemPrompt: string;
  greetingText: string;
  voiceName: string;
}

export interface GeminiLiveSession {
  sendAudio: (base64Data: string) => void;
  sendGreeting: () => void;
  close: () => void;
}

export interface GeminiLiveCallbacks {
  onAudio: (base64: string) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onTranscript: (text: string) => void;
  onInputTranscript: (text: string) => void;
  onError: (err: unknown) => void;
  onClose: () => void;
}

export async function createGeminiLiveSession(
  config: GeminiSessionConfig,
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
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: config.voiceName },
        },
      },
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
          prefixPaddingMs: 200,
          silenceDurationMs: 1000,
        },
      },
      contextWindowCompression: {
        triggerTokens: "25600",
        slidingWindow: { targetTokens: "12800" },
      },
      systemInstruction: config.systemPrompt,
    },
    callbacks: {
      onopen: () => {
        logger.info({ voice: config.voiceName }, "Gemini Live session opened");
      },

      onmessage: (message) => {
        if (message.setupComplete && !setupComplete) {
          setupComplete = true;
          logger.info("Gemini Live setupComplete received");
          if (pendingGreeting) sendGreetingInternal();
        }

        const sc = message.serverContent;
        if (!sc) return;

        const parts = sc.modelTurn?.parts ?? [];
        for (const part of parts) {
          if (part.inlineData?.data) callbacks.onAudio(part.inlineData.data);
          if (part.text) callbacks.onTranscript(part.text);
        }

        const sc2 = sc as Record<string, unknown>;
        const outputT = sc2.outputTranscription as { text?: string } | undefined;
        if (outputT?.text) callbacks.onTranscript(outputT.text);

        const inputT = sc2.inputTranscription as { text?: string } | undefined;
        if (inputT?.text) callbacks.onInputTranscript(inputT.text);

        if (sc.turnComplete) callbacks.onTurnComplete();
        if (sc.interrupted) callbacks.onInterrupted();
      },

      onerror: (error) => {
        logger.error({ error }, "Gemini Live error");
        callbacks.onError(error);
      },

      onclose: (event: { code?: number; reason?: string }) => {
        logger.info({ code: event?.code, reason: event?.reason }, "Gemini Live session closed");
        callbacks.onClose();
      },
    },
  });

  function sendGreetingInternal() {
    try {
      session.sendRealtimeInput({ text: config.greetingText });
      logger.info({ greeting: config.greetingText }, "Gemini greeting sent");
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
      if (setupComplete) sendGreetingInternal();
      else pendingGreeting = true;
    },
    close: () => {
      try { session.close(); } catch { /* already closed */ }
    },
  };
}
