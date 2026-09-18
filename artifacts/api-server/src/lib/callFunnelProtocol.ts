/**
 * Runtime validation and cost budgets for untrusted voice WebSocket messages.
 * TypeScript declarations do not validate JSON received from a browser.
 */
export const MAX_AUDIO_BASE64_CHARS = 32 * 1024;
export const MAX_USER_TEXT_CHARS = 2_000;
export const MAX_OFFERING_NAME_CHARS = 200;
export const MAX_RAW_CLIENT_MESSAGE_CHARS = 40 * 1024;

export type CallClientMessage =
  | { type: "authenticate"; leadId: string; visitorToken: string }
  | { type: "audio"; data: string }
  | { type: "user_text"; text: string }
  | {
      type: "payment_result";
      orderId: string;
      status: "paga" | "falhada" | "expirada";
      offeringName?: string;
    };

export type ClientMessageParseResult =
  | { ok: true; message: CallClientMessage }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBase64(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_AUDIO_BASE64_CHARS &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value)
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCallClientMessage(raw: string): ClientMessageParseResult {
  if (raw.length > MAX_RAW_CLIENT_MESSAGE_CHARS) {
    return { ok: false, reason: "Mensagem demasiado grande" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "JSON inválido" };
  }
  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return { ok: false, reason: "Formato de mensagem inválido" };
  }

  if (parsed.type === "authenticate") {
    if (
      typeof parsed.leadId !== "string" || !UUID_RE.test(parsed.leadId) ||
      typeof parsed.visitorToken !== "string" ||
      parsed.visitorToken.length > 2048 ||
      !/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(parsed.visitorToken)
    ) {
      return { ok: false, reason: "Acesso de visitante inválido" };
    }
    return { ok: true, message: {
      type: "authenticate", leadId: parsed.leadId, visitorToken: parsed.visitorToken,
    } };
  }

  if (parsed.type === "audio") {
    if (typeof parsed.data !== "string" || !isBase64(parsed.data)) {
      return { ok: false, reason: "Áudio inválido" };
    }
    return { ok: true, message: { type: "audio", data: parsed.data } };
  }

  if (parsed.type === "user_text") {
    if (
      typeof parsed.text !== "string" ||
      parsed.text.length === 0 ||
      parsed.text.length > MAX_USER_TEXT_CHARS
    ) {
      return { ok: false, reason: "Texto inválido" };
    }
    return { ok: true, message: { type: "user_text", text: parsed.text } };
  }

  if (parsed.type === "payment_result") {
    if (
      typeof parsed.orderId !== "string" ||
      !UUID_RE.test(parsed.orderId) ||
      !["paga", "falhada", "expirada"].includes(String(parsed.status)) ||
      (parsed.offeringName !== undefined &&
        (typeof parsed.offeringName !== "string" ||
          parsed.offeringName.length > MAX_OFFERING_NAME_CHARS))
    ) {
      return { ok: false, reason: "Resultado de pagamento inválido" };
    }
    return {
      ok: true,
      message: {
        type: "payment_result",
        orderId: parsed.orderId,
        status: parsed.status as "paga" | "falhada" | "expirada",
        ...(parsed.offeringName === undefined ? {} : { offeringName: parsed.offeringName as string }),
      },
    };
  }

  return { ok: false, reason: "Tipo de mensagem não permitido" };
}

export interface CallInputBudgetOptions {
  maxMessages?: number;
  maxAudioBytes?: number;
  windowMs?: number;
}

/**
 * Fixed-window budget sized for 16 kHz PCM sent in 30 ms chunks (~1.9 MB/min),
 * while rejecting substantially higher rates before they reach Gemini.
 */
export class CallInputBudget {
  private readonly maxMessages: number;
  private readonly maxAudioBytes: number;
  private readonly windowMs: number;
  private windowStartedAt = 0;
  private messageCount = 0;
  private audioBytes = 0;

  constructor(options: CallInputBudgetOptions = {}) {
    this.maxMessages = options.maxMessages ?? 2_500;
    this.maxAudioBytes = options.maxAudioBytes ?? 2_500_000;
    this.windowMs = options.windowMs ?? 60_000;
  }

  consume(message: CallClientMessage, now = Date.now()): boolean {
    if (this.windowStartedAt === 0 || now - this.windowStartedAt >= this.windowMs) {
      this.windowStartedAt = now;
      this.messageCount = 0;
      this.audioBytes = 0;
    }

    const audioBytes =
      message.type === "audio" ? Math.floor((message.data.length * 3) / 4) : 0;
    if (
      this.messageCount + 1 > this.maxMessages ||
      this.audioBytes + audioBytes > this.maxAudioBytes
    ) {
      return false;
    }
    this.messageCount += 1;
    this.audioBytes += audioBytes;
    return true;
  }
}