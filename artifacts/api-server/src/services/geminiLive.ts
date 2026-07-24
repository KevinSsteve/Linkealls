import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  StartSensitivity,
  EndSensitivity,
  Type,
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
  sendText: (text: string) => void;
  sendGreeting: () => void;
  sendToolResponse: (id: string, result: unknown) => void;
  close: () => void;
}

export interface ToolCallData {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiLiveCallbacks {
  onAudio: (base64: string) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onTranscript: (text: string) => void;
  onInputTranscript: (text: string) => void;
  onToolCall?: (call: ToolCallData) => void;
  onError: (err: unknown) => void;
  onClose: () => void;
}

/** show_product_catalog — tool the model calls to display a visual product card in the client UI. */
const showProductCatalogDecl = {
  name: "show_product_catalog",
  description:
    "Mostra visualmente no ecrã do cliente os produtos/serviços correspondentes ao pedido, com imagem, nome e preço. Usa sempre que o cliente perguntar sobre um produto, serviço ou categoria específica. Chama com os nomes exactos dos produtos do catálogo.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "O que o cliente pediu, ex: 'frango', 'menu família', 'ar condicionado'",
      },
      product_names: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Nomes exactos dos produtos/serviços a mostrar, retirados do catálogo disponível",
      },
    },
    required: ["query", "product_names"],
  },
};

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
      tools: [{ functionDeclarations: [showProductCatalogDecl] }],
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

        // ── Tool calls ───────────────────────────────────────────────────────
        const toolCall = (message as Record<string, unknown>).toolCall as
          | { functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> }
          | undefined;
        if (toolCall?.functionCalls?.length && callbacks.onToolCall) {
          for (const fc of toolCall.functionCalls) {
            if (fc.name) {
              callbacks.onToolCall({
                id: fc.id ?? fc.name,
                name: fc.name,
                args: fc.args ?? {},
              });
            }
          }
        }

        // ── Audio / transcripts ──────────────────────────────────────────────
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
    sendText: (text: string) => {
      try {
        session.sendClientContent({
          turns: [{ role: "user", parts: [{ text }] }],
          turnComplete: true,
        });
      } catch (err) {
        logger.error({ err }, "Failed to send text to Gemini");
      }
    },
    sendGreeting: () => {
      if (setupComplete) sendGreetingInternal();
      else pendingGreeting = true;
    },
    sendToolResponse: (id: string, result: unknown) => {
      try {
        session.sendToolResponse({
          functionResponses: [{ id, response: { result } }],
        });
      } catch (err) {
        logger.error({ err }, "Failed to send tool response to Gemini");
      }
    },
    close: () => {
      try { session.close(); } catch { /* already closed */ }
    },
  };
}
