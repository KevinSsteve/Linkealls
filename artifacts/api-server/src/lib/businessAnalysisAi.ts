import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from "@google/genai";
import { logger } from "./logger.js";

type FailureKind = "timeout" | "busy" | "network" | "invalid_output" | "blocked" | "configuration" | "quota" | "unknown";
type Generate = (input: GenerateContentParameters) => Promise<GenerateContentResponse>;

/** Safe public error and allow-listed diagnostics: never include provider bodies or prompts. */
export class StartAnalysisError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
    public readonly diagnostic?: { kind: FailureKind; model: string; providerStatus?: number },
  ) {
    super(message);
    this.name = "StartAnalysisError";
  }
}

function classify(error: unknown): { kind: FailureKind; providerStatus?: number } {
  if (error instanceof StartAnalysisError && error.diagnostic) return error.diagnostic;
  const e = (error ?? {}) as { name?: string; message?: string; status?: number; code?: string };
  const providerStatus = Number.isInteger(e.status) ? e.status : undefined;
  if (e.name === "AbortError" || e.name === "TimeoutError" ||
      /timed?\s*out|timeout|deadline|aborted/i.test(e.message ?? "")) {
    return { kind: "timeout", providerStatus };
  }
  if (providerStatus === 429) return { kind: "quota", providerStatus };
  if (providerStatus === 400 || providerStatus === 401 || providerStatus === 403) {
    return { kind: "configuration", providerStatus };
  }
  if (providerStatus && providerStatus >= 500) return { kind: "busy", providerStatus };
  if (e.name === "SyntaxError") return { kind: "invalid_output", providerStatus };
  if (/fetch failed|ECONNRESET|ENOTFOUND|network/i.test(e.message ?? "")) return { kind: "network", providerStatus };
  return { kind: "unknown", providerStatus };
}

function publicFailure(kind: FailureKind, model: string, providerStatus?: number): StartAnalysisError {
  const diagnostic = { kind, model, providerStatus };
  if (kind === "timeout") {
    return new StartAnalysisError(
      "A análise demorou demasiado. Os dados continuam nesta página; tenta novamente ou usa a opção Texto.",
      504, "ANALYSIS_TIMEOUT", diagnostic,
    );
  }
  if (kind === "blocked") {
    return new StartAnalysisError(
      "Não foi possível analisar este conteúdo. Escolhe outra imagem ou descreve o negócio em Texto.",
      422, "UNREADABLE_CONTENT", diagnostic,
    );
  }
  if (kind === "invalid_output") {
    return new StartAnalysisError(
      "A IA não conseguiu estruturar a informação. Tenta uma captura mais legível ou usa a opção Texto.",
      502, "INVALID_ANALYSIS_OUTPUT", diagnostic,
    );
  }
  return new StartAnalysisError(
    "O serviço de IA está temporariamente indisponível. Os dados continuam nesta página; tenta mais tarde.",
    503, kind === "quota" ? "ANALYSIS_PROVIDER_LIMIT" : "ANALYSIS_UNAVAILABLE", diagnostic,
  );
}

async function generateWithGoogle(input: GenerateContentParameters): Promise<GenerateContentResponse> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw publicFailure("configuration", input.model);
  return new GoogleGenAI({ apiKey }).models.generateContent(input);
}

/**
 * OCR/profile extraction does not need unbounded reasoning. Keep BOTH attempts
 * below 50s, leaving 30s for website crawling within the route's 82s deadline.
 * Only retry transient failures or invalid JSON, never auth/quota/safety errors.
 */
export async function generateProfileJson(
  contents: GenerateContentParameters["contents"],
  responseSchema: NonNullable<NonNullable<GenerateContentParameters["config"]>["responseSchema"]>,
  generate: Generate = generateWithGoogle,
): Promise<unknown> {
  const attempts = [
    { model: "gemini-3-flash-preview", timeout: 25_000, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
    { model: "gemini-2.5-flash", timeout: 23_000, thinkingConfig: { thinkingBudget: 0 } },
  ];
  for (const [index, attempt] of attempts.entries()) {
    const started = Date.now();
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = publicFailure("timeout", attempt.model);
          controller.abort(error);
          reject(error);
        }, attempt.timeout);
        timer.unref?.();
      });
      const response = await Promise.race([
        generate({
          model: attempt.model,
          contents,
          config: {
            responseMimeType: "application/json",
            responseSchema,
            thinkingConfig: attempt.thinkingConfig,
            abortSignal: controller.signal,
            // The SDK must not add hidden retries outside our total time budget.
            httpOptions: { timeout: attempt.timeout, retryOptions: { attempts: 1 } },
          },
        }),
        timeout,
      ]);
      const finishReason = response.candidates?.[0]?.finishReason;
      if (response.promptFeedback?.blockReason ||
          ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "IMAGE_SAFETY", "RECITATION", "SPII"].includes(finishReason ?? "")) {
        throw publicFailure("blocked", attempt.model);
      }
      if (!response.text || finishReason === "MAX_TOKENS") throw publicFailure("invalid_output", attempt.model);
      const parsed: unknown = JSON.parse(response.text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw publicFailure("invalid_output", attempt.model);
      return parsed;
    } catch (error) {
      const { kind, providerStatus } = classify(error);
      const retry = index === 0 && ["timeout", "busy", "network", "invalid_output"].includes(kind);
      logger.warn({
        model: attempt.model, attempt: index + 1, elapsedMs: Date.now() - started,
        kind, providerStatus, retry,
      }, "business analysis provider attempt failed");
      if (!retry) throw publicFailure(kind, attempt.model, providerStatus);
    } finally {
      if (timer) clearTimeout(timer);
    }
    // One bounded backoff; never loop indefinitely or retry an upstream quota.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw publicFailure("unknown", attempts[1]!.model);
}