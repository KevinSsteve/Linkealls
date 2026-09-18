import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { consumeSharedRateLimit } from "../lib/rateLimit.js";
import {
  analyzeSiteDraft,
  assistFromDescription,
  assistFromImage,
  StartAnalysisError,
} from "../services/siteAnalysis.js";
import { getUserByToken, requestToken } from "./userAuth.js";

const router = Router();
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 82_000;
const inFlightUsers = new Set<string>();

const description = z.string().trim().min(20).max(6000);
const requestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("site"),
    url: z.string().trim().min(4).max(500),
  }).strict(),
  z.object({
    mode: z.literal("image"),
    imageBase64: z.string().min(4).max(4_194_304),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    description: z.string().trim().max(6000).optional(),
  }).strict(),
  z.object({
    mode: z.literal("description"),
    description,
  }).strict(),
]);

type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export function decodeValidatedImage(base64: string, mimeType: ImageMime): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw new StartAnalysisError("A imagem enviada não é válida.", 400);
  }
  const image = Buffer.from(base64, "base64");
  if (image.length === 0 || image.length > MAX_IMAGE_BYTES) {
    throw new StartAnalysisError("A imagem deve ter no máximo 3 MB.", 413);
  }
  // Ensure Node did not permissively discard malformed base64 characters.
  if (image.toString("base64") !== base64) {
    throw new StartAnalysisError("A imagem enviada não é válida.", 400);
  }
  const jpeg = image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  const png = image.length >= 8 && image.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  const webp = image.length >= 12 &&
    image.subarray(0, 4).toString("ascii") === "RIFF" &&
    image.subarray(8, 12).toString("ascii") === "WEBP";
  const signatureMatches =
    (mimeType === "image/jpeg" && jpeg) ||
    (mimeType === "image/png" && png) ||
    (mimeType === "image/webp" && webp);
  if (!signatureMatches) {
    throw new StartAnalysisError("O formato declarado não corresponde à imagem enviada.", 400);
  }
  return image;
}

async function withRequestTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new StartAnalysisError("A análise demorou demasiado. Tenta novamente.", 504));
    }, REQUEST_TIMEOUT_MS);
    timer.unref?.();
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errorCode(err: unknown): string {
  if (!(err instanceof StartAnalysisError)) return "ANALYSIS_UNAVAILABLE";
  if (err.statusCode === 504) return "ANALYSIS_TIMEOUT";
  if (err.statusCode === 413 || err.message.toLowerCase().includes("imagem")) return "INVALID_IMAGE";
  if (err.message.includes("aceder ao site")) return "SITE_UNAVAILABLE";
  if (err.statusCode === 422) return "UNREADABLE_CONTENT";
  if (err.statusCode === 400) return "INVALID_SOURCE";
  return "ANALYSIS_UNAVAILABLE";
}

router.post("/user-auth/business-analysis", async (req: Request, res: Response) => {
  let user: Awaited<ReturnType<typeof getUserByToken>>;
  try {
    user = await getUserByToken(requestToken(req));
  } catch {
    res.status(503).json({
      error: "Não foi possível validar a sessão neste momento. Tenta novamente.",
      code: "AUTH_UNAVAILABLE",
    });
    return;
  }
  if (!user) {
    res.status(401).json({ error: "Sessão inválida — inicia sessão novamente", code: "AUTH_REQUIRED" });
    return;
  }
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Pedido inválido. Confirma a fonte e os dados enviados.",
      code: "INVALID_REQUEST",
    });
    return;
  }

  try {
    const allowed = await consumeSharedRateLimit(
      "onboarding-business-analysis-user",
      user.id,
      8,
      60 * 60_000,
    );
    if (!allowed) {
      res.status(429).json({
        error: "Atingiste o limite de análises. Tenta novamente mais tarde.",
        code: "RATE_LIMITED",
      });
      return;
    }
  } catch {
    res.status(503).json({
      error: "Não foi possível validar o limite de análises. Tenta novamente.",
      code: "RATE_LIMIT_UNAVAILABLE",
    });
    return;
  }

  if (inFlightUsers.has(user.id)) {
    res.status(409).json({
      error: "Já existe uma análise em curso nesta sessão.",
      code: "ANALYSIS_IN_PROGRESS",
    });
    return;
  }

  inFlightUsers.add(user.id);
  try {
    const input = parsed.data;
    let result: { draft: Awaited<ReturnType<typeof assistFromDescription>>; sourceUrl?: string };
    if (input.mode === "site") {
      result = await withRequestTimeout(analyzeSiteDraft(input.url));
    } else if (input.mode === "image") {
      const image = decodeValidatedImage(input.imageBase64, input.mimeType);
      result = {
        draft: await withRequestTimeout(assistFromImage(image, input.mimeType, input.description)),
      };
    } else {
      result = {
        draft: await withRequestTimeout(assistFromDescription(input.description)),
      };
    }
    res.json(result);
  } catch (err) {
    const status = err instanceof StartAnalysisError ? err.statusCode : 503;
    const message = err instanceof StartAnalysisError
      ? err.message
      : "A IA não conseguiu analisar o negócio neste momento. Tenta novamente.";
    logger.warn({ userId: user.id, code: errorCode(err) }, "onboarding business analysis failed");
    res.status(status).json({ error: message, code: errorCode(err) });
  } finally {
    inFlightUsers.delete(user.id);
  }
});

export default router;