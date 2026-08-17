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
  sendToolResponse: (id: string, name: string, result: Record<string, unknown>) => void;
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
  /**
   * Called for each function call from the model.
   * `sendResponse(result)` MUST be called to unblock the model.
   * The bound function holds the correct call-ID and tool-name already.
   * `result` must be a plain object (SDK validates `{ id, name, response }`).
   */
  onToolCall?: (call: ToolCallData, sendResponse: (result: Record<string, unknown>) => void) => void;
  /** Called when the model sends a text-only message to display in the UI chat. */
  onAgentMessage?: (text: string) => void;
  onError: (err: unknown) => void;
  onClose: () => void;
}

/** initiate_checkout — creates an order and opens the payment panel for the client. */
const initiateCheckoutDecl = {
  name: "initiate_checkout",
  description:
    "Cria uma encomenda para o produto que o cliente quer comprar e abre o ecrã de pagamento Multicaixa Express no telemóvel do cliente. Usa APENAS quando o cliente confirmar claramente que quer comprar e fornecer o número de telefone. Não uses sem confirmação explícita.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      product_name: {
        type: Type.STRING,
        description: "Nome exacto do produto ou serviço, tal como aparece no catálogo",
      },
      quantity: {
        type: Type.INTEGER,
        description: "Quantidade a comprar (1 a 99)",
      },
      phone: {
        type: Type.STRING,
        description: "Número de telemóvel angolano do cliente, formato 9XXXXXXXX (sem espaços, sem +244)",
      },
      buyer_name: {
        type: Type.STRING,
        description: "Nome do cliente (opcional)",
      },
    },
    required: ["product_name", "quantity", "phone"],
  },
};

/** check_order_status — queries the current payment status of an order. */
const checkOrderStatusDecl = {
  name: "check_order_status",
  description:
    "Verifica o estado actual do pagamento de uma encomenda. Usa para saber se o cliente já pagou, se o pagamento falhou ou ainda está pendente.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      order_id: {
        type: Type.STRING,
        description: "ID da encomenda retornado pelo initiate_checkout",
      },
    },
    required: ["order_id"],
  },
};

/** show_product_catalog — displays visual product cards on the client. */
const showProductCatalogDecl = {
  name: "show_product_catalog",
  description:
    "Mostra visualmente no ecrã do cliente os produtos/serviços correspondentes ao pedido, com imagem, nome e preço. Usa sempre que o cliente perguntar sobre um produto, serviço ou categoria específica.",
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

/**
 * send_text_message — sends a formatted text bubble to the client's chat
 * during the voice call, so the agent can share phone numbers, addresses,
 * store info, prices, or any data that is better read than spoken.
 */
const sendTextMessageDecl = {
  name: "send_text_message",
  description:
    "Envia uma mensagem de texto visível no chat do cliente enquanto a chamada está a decorrer. Usa quando o cliente pede informações específicas por escrito: número de telefone, morada de uma loja, horário de funcionamento, código de desconto, link, ou qualquer dado que seja mais útil ler do que ouvir. Depois de enviar, continua a conversa normalmente por voz.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: {
        type: Type.STRING,
        description:
          "Mensagem a mostrar no chat. Pode usar quebras de linha (\\n) para formatar listas. Exemplo: 'Loja Talatona\\n📍 Rua da Samba, 42\\n📞 +244 923 000 000'",
      },
    },
    required: ["text"],
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

  // We need to call sendToolResponse from within onmessage callbacks.
  // The 'session' variable is assigned after ai.live.connect() resolves,
  // but tool calls only arrive after setupComplete + greeting, so 'session'
  // is always defined by the time we need it. We use a local wrapper to
  // keep the reference clean.
  let _session: Awaited<ReturnType<typeof ai.live.connect>> | null = null;

  /**
   * SDK requires: { id, name, response } — all three fields.
   * Missing 'name' throws "Could not parse function response, type 'object'".
   * The 'response' value must be a plain object (not nested under 'result').
   */
  function dispatchToolResponse(id: string, name: string, result: Record<string, unknown>) {
    if (!_session) {
      logger.error({ id, name }, "sendToolResponse called before session ready — dropped");
      return;
    }
    try {
      _session.sendToolResponse({
        functionResponses: [{ id, name, response: result }],
      });
    } catch (err) {
      logger.error({ err, id, name }, "Failed to send tool response to Gemini");
    }
  }

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
      tools: [{ functionDeclarations: [showProductCatalogDecl, sendTextMessageDecl, initiateCheckoutDecl, checkOrderStatusDecl] }],
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
        const toolCall = (message as unknown as Record<string, unknown>).toolCall as
          | { functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> }
          | undefined;

        if (toolCall?.functionCalls?.length) {
          for (const fc of toolCall.functionCalls) {
            if (!fc.name) continue;
            const callId = fc.id ?? fc.name;

            if (fc.name === "send_text_message") {
              // ── Handle inline: send text to client, auto-respond so model continues ──
              const text = (fc.args?.["text"] as string) ?? "";
               if (text) {
                 logger.info({ textLen: text.length }, "send_text_message called");
                 // Keep each WhatsApp-style bubble short instead of rendering
                 // one wall of text when the model sends a long message.
                 const chunks = text
                   .replace(/\n{2,}/g, "\n")
                   .split(/(?<=[.!?])\s+/)
                   .reduce<string[]>((out, sentence) => {
                     const current = out[out.length - 1];
                     if (current && `${current} ${sentence}`.length <= 220) {
                       out[out.length - 1] = `${current} ${sentence}`;
                     } else {
                       out.push(sentence);
                     }
                     return out;
                   }, [])
                   .slice(0, 3);
                 for (const chunk of chunks) {
                   if (chunk.trim()) callbacks.onAgentMessage?.(chunk.trim());
                 }
              }
              // Immediately respond so Gemini is unblocked and keeps speaking
              dispatchToolResponse(callId, fc.name, { status: "sent" });

            } else if (callbacks.onToolCall) {
              // ── Delegate to caller with a bound sendResponse so caller never
              //    needs a reference to the session or call-ID ──────────────────
              const toolName = fc.name;
              const sendResponse = (result: Record<string, unknown>) =>
                dispatchToolResponse(callId, toolName, result);
              callbacks.onToolCall(
                { id: callId, name: fc.name, args: fc.args ?? {} },
                sendResponse,
              );
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

  // Assign after connect() resolves — safe because tool calls only arrive
  // after setupComplete + greeting (well after this point).
  _session = session;

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
    sendToolResponse: (id: string, name: string, result: Record<string, unknown>) => {
      dispatchToolResponse(id, name, result);
    },
    close: () => {
      try { session.close(); } catch { /* already closed */ }
    },
  };
}
