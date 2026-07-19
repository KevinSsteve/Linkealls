import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  StartSensitivity,
  EndSensitivity,
} from "@google/genai";
import { logger } from "../lib/logger.js";

const MODEL = "gemini-3.1-flash-live-preview";

const SYSTEM_PROMPT = `
Você é um assistente virtual especializado em qualificação de leads.
O utilizador acabou de clicar num anúncio e atendeu uma chamada.

Fale em português de Angola, de forma natural, breve, profissional e acolhedora.

O objetivo é descobrir:
1. O que a pessoa procura exatamente
2. Qual é o orçamento aproximado
3. O prazo de decisão
4. A melhor forma de contacto

REGRAS IMPORTANTES:
- Faça UMA pergunta de cada vez
- Mantenha a conversa fluida e natural
- Aja como um consultor humano premium
- Respostas curtas e directas (máximo 2 frases)
- Nunca liste perguntas de uma vez
- Seja caloroso e confiante

RESPOND UNMISTAKABLY IN ANGOLAN PORTUGUESE. NUNCA mude de idioma.
`.trim();

const GREETING_TEXT = "Olá! Obrigado por atender. Em que posso ajudá-lo hoje?";

export interface CallFunnelSession {
  sendAudio: (base64Data: string) => void;
  sendGreeting: () => void;
  close: () => void;
}

export interface CallFunnelCallbacks {
  onAudio: (base64: string) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onTranscript: (text: string) => void;
  onInputTranscript: (text: string) => void;
  onError: (err: unknown) => void;
  onClose: () => void;
}

export async function createCallFunnelSession(
  callbacks: CallFunnelCallbacks,
): Promise<CallFunnelSession> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is required");

  const ai = new GoogleGenAI({ apiKey });
  let setupComplete = false;
  let pendingGreeting = false;

  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
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
      systemInstruction: SYSTEM_PROMPT,
    },
    callbacks: {
      onopen: () => logger.info("Call Funnel Gemini session opened"),

      onmessage: (message) => {
        if (message.setupComplete && !setupComplete) {
          setupComplete = true;
          logger.info("Call Funnel setupComplete received");
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
        logger.error({ error }, "Call Funnel Gemini error");
        callbacks.onError(error);
      },

      onclose: (event: { code?: number; reason?: string }) => {
        logger.info({ code: event?.code, reason: event?.reason }, "Call Funnel session closed");
        callbacks.onClose();
      },
    },
  });

  function sendGreetingInternal() {
    try {
      session.sendRealtimeInput({ text: GREETING_TEXT });
      logger.info("Call Funnel greeting sent");
    } catch (err) {
      logger.error({ err }, "Failed to send Call Funnel greeting");
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
