/**
 * AI ad-creative generation — Gemini picks products from the business catalog
 * and produces channel-appropriate creative:
 *  - Meta (Facebook/Instagram): copy + a generated ad image (1:1).
 *  - TikTok: copy + a generated vertical AI video (9:16).
 *
 * Runs as a background job (same pattern as siteAnalysis): the route flips
 * `creativeStatus` to "a_gerar" and returns; the client polls the campaign.
 * Media is stored in private object storage and served via
 * /api/storage/objects/... .
 */
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  campaignsTable,
  businessProfilesTable,
  type Campaign,
  type AdCreative,
  type CampaignSetup,
} from "@workspace/db";
import { ai as managedGemini } from "@workspace/integrations-gemini-ai";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";

const TEXT_MODEL = process.env["GEMINI_TEXT_MODEL"] ?? "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-2.5-flash-image";
const VIDEO_MODEL = process.env["GEMINI_VIDEO_MODEL"] ?? "veo-3.0-fast-generate-001";

/** Meta/Zernio CTA enum values we allow the model to choose from. */
const ALLOWED_CTAS = ["SHOP_NOW", "LEARN_MORE", "CONTACT_US", "ORDER_NOW", "GET_OFFER"] as const;

function getAi(): GoogleGenAI {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
  return new GoogleGenAI({ apiKey });
}

interface CreativePlan {
  productNames: string[];
  headline: string;
  body: string;
  callToAction: string;
  visualPrompt: string;
  concept: string;
}

async function planCreative(
  campaign: Campaign,
  profile: { name: string; sector: string | null; description: string | null; offerings: Array<{ name: string; description: string; price: string; featured?: boolean }> },
  channel: "meta" | "tiktok",
): Promise<CreativePlan> {
  const catalog = profile.offerings
    .slice(0, 30)
    .map((o) => `- ${o.name} | ${o.price} | ${o.featured ? "DESTAQUE | " : ""}${o.description}`.slice(0, 300))
    .join("\n");

  const res = await managedGemini.models.generateContent({
    model: TEXT_MODEL,
    contents: [
      `És um criativo publicitário sénior em Luanda, Angola. Cria o anúncio para a campanha abaixo.`,
      `Negócio: ${profile.name} (${profile.sector ?? "geral"})`,
      `Descrição: ${profile.description ?? ""}`,
      `Catálogo:\n${catalog || "(sem produtos — anuncia o negócio em si)"}`,
      `Campanha: "${campaign.name}" — objetivo: ${campaign.objective}`,
      `Canal: ${channel === "tiktok" ? "TikTok (vídeo vertical 9:16, energia jovem)" : "Facebook/Instagram (imagem 1:1)"}`,
      `Regras: português de Angola, preços sempre em Kz, escolhe 1-3 produtos do catálogo (prioriza os em DESTAQUE e com preço), headline ≤ 40 caracteres, body ≤ 120 caracteres.`,
      `O visualPrompt é o prompt (em inglês) para gerar ${channel === "tiktok" ? "um vídeo vertical 9:16 de ~8s" : "uma imagem quadrada"} publicitário apelativo — descreve cena, produto, iluminação e ambiente angolano; sem texto sobreposto.`,
    ].join("\n\n"),
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          productNames: { type: Type.ARRAY, items: { type: Type.STRING } },
          headline: { type: Type.STRING },
          body: { type: Type.STRING },
          callToAction: { type: Type.STRING, enum: [...ALLOWED_CTAS] },
          visualPrompt: { type: Type.STRING },
          concept: { type: Type.STRING },
        },
        required: ["productNames", "headline", "body", "callToAction", "visualPrompt", "concept"],
      },
    },
  });
  const text = res.text;
  if (!text) throw new Error("A IA não devolveu o plano criativo");
  const plan = JSON.parse(text) as CreativePlan;
  if (!ALLOWED_CTAS.includes(plan.callToAction as (typeof ALLOWED_CTAS)[number])) {
    plan.callToAction = "LEARN_MORE";
  }
  return plan;
}

async function generateImage(
  prompt: string,
  reference?: { buffer: Buffer; mime: string },
): Promise<{ buffer: Buffer; mime: string }> {
  const contents = reference
    ? [{
        role: "user" as const,
        parts: [
          { text: `Create a polished square 1:1 advertising image. Use the reference image as visual guidance, but improve the composition and keep the advertised product recognizable. ${prompt}` },
          { inlineData: { data: reference.buffer.toString("base64"), mimeType: reference.mime } },
        ],
      }]
    : `Professional advertising photo, square 1:1. ${prompt}`;
  const res = await managedGemini.models.generateContent({
    model: IMAGE_MODEL,
    contents,
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data;
    if (data) {
      return { buffer: Buffer.from(data, "base64"), mime: part.inlineData?.mimeType ?? "image/png" };
    }
  }
  throw new Error("O modelo não devolveu nenhuma imagem");
}

async function generateVideo(prompt: string): Promise<{ buffer: Buffer; mime: string }> {
  const ai = getAi();
  let operation = await ai.models.generateVideos({
    model: VIDEO_MODEL,
    prompt: `Vertical 9:16 short-form ad video for TikTok. ${prompt}`,
    config: { aspectRatio: "9:16", numberOfVideos: 1 },
  });
  const deadline = Date.now() + 5 * 60_000;
  while (!operation.done) {
    if (Date.now() > deadline) throw new Error("Geração de vídeo demorou demasiado (timeout 5 min)");
    await new Promise((r) => setTimeout(r, 8000));
    operation = await ai.operations.getVideosOperation({ operation });
  }
  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video?.uri) throw new Error("O modelo não devolveu nenhum vídeo");
  const apiKey = process.env["GEMINI_API_KEY"] ?? "";
  const sep = video.uri.includes("?") ? "&" : "?";
  const dl = await fetch(`${video.uri}${sep}key=${apiKey}`);
  if (!dl.ok) throw new Error(`Falha ao descarregar o vídeo gerado (${dl.status})`);
  return { buffer: Buffer.from(await dl.arrayBuffer()), mime: "video/mp4" };
}

function userFacingCreativeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/RESOURCE_EXHAUSTED|quota|free.?tier|429/i.test(message)) {
    return `A integração Gemini da Replit não tem créditos/quota disponíveis para gerar imagens neste momento (modelo ${IMAGE_MODEL}). Verifica os créditos da Replit ou usa uma imagem da tua galeria.`;
  }
  if (/PERMISSION_DENIED|forbidden|unauthenticated/i.test(message)) {
    return "O Gemini recusou o pedido. Verifica se a chave tem acesso ao modelo de imagem e se pertence ao projeto correcto.";
  }
  if (/NOT_FOUND|not found|model.*(invalid|does not exist)/i.test(message)) {
    return `O modelo de imagem ${IMAGE_MODEL} não está disponível para esta chave Gemini. Configura um modelo de imagem suportado.`;
  }
  if (/SAFETY|blocked|safety ratings/i.test(message)) {
    return "O Gemini bloqueou o criativo pelos filtros de segurança. Tenta remover conteúdo sensível do catálogo ou da descrição.";
  }
  return "Não foi possível gerar o criativo com o Gemini. Tenta novamente mais tarde ou usa uma imagem da tua galeria.";
}

/**
 * Marks the campaign "a_gerar" and kicks the generation in the background.
 * Returns the updated campaign row immediately.
 */
export async function startCreativeGeneration(
  campaignId: string,
  businessId: number,
): Promise<Campaign | null> {
  // Atomic gate: the creative is intentionally generated before payment so the
  // owner can review the complete ad before any money moves.
  const updated = await db
    .update(campaignsTable)
    .set({ creativeStatus: "a_gerar", creativeError: null, updatedAt: new Date() })
    .where(and(
      eq(campaignsTable.id, campaignId),
      eq(campaignsTable.businessId, businessId),
      sql`${campaignsTable.creativeStatus} <> 'a_gerar'`,
      inArray(campaignsTable.publishStatus, ["nao_publicada", "erro", "rejeitada"]),
    ))
    .returning();
  const campaign = updated[0];
  if (!campaign) return null;

  setImmediate(() => {
    void runCreativeGeneration(campaign).catch((err) => {
      logger.error({ err, campaignId }, "creative generation crashed");
    });
  });
  return campaign;
}

async function runCreativeGeneration(campaign: Campaign): Promise<void> {
  const fail = async (message: string) => {
    await db
      .update(campaignsTable)
      .set({ creativeStatus: "erro", creativeError: message, updatedAt: new Date() })
      .where(eq(campaignsTable.id, campaign.id));
  };
  try {
    const rows = await db
      .select({
        name: businessProfilesTable.name,
        sector: businessProfilesTable.sector,
        description: businessProfilesTable.description,
        offerings: businessProfilesTable.offerings,
      })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.id, campaign.businessId!))
      .limit(1);
    const profile = rows[0];
    if (!profile) { await fail("Negócio não encontrado"); return; }

    const channel = campaign.platform === "tiktok" ? "tiktok" : "meta";
    const setup = campaign.campaignSetup as CampaignSetup | null;
    if (channel === "meta" && setup?.creative.source === "upload") {
      if (!setup.creative.mediaPath) throw new Error("Carrega uma imagem antes de continuar");
      const creative: AdCreative = {
        productNames: [],
        headline: setup.creative.headline,
        body: setup.creative.body,
        callToAction: setup.creative.callToAction,
        mediaType: "image",
        mediaUrl: `/api/storage${setup.creative.mediaPath}`,
        concept: "Imagem carregada pelo dono",
        generatedAt: new Date().toISOString(),
      };
      await db
        .update(campaignsTable)
        .set({ creativeStatus: "pronto", creativeJson: creative, creativeError: null, updatedAt: new Date() })
        .where(eq(campaignsTable.id, campaign.id));
      return;
    }
    const plan = await planCreative(campaign, profile, channel);

    let reference: { buffer: Buffer; mime: string } | undefined;
    if (channel === "meta" && setup?.creative.referenceImagePath) {
      const storage = new ObjectStorageService();
      const file = await storage.getObjectEntityFile(setup.creative.referenceImagePath);
      const [buffer] = await file.download();
      const [metadata] = await file.getMetadata();
      reference = {
        buffer,
        mime: setup.creative.mediaMimeType ?? String(metadata.contentType ?? "image/png"),
      };
    }

    const media = channel === "tiktok"
      ? await generateVideo(plan.visualPrompt)
      : await generateImage(
          setup?.creative.prompt?.trim()
            ? `${plan.visualPrompt}. Extra direction from the owner: ${setup.creative.prompt}`
            : plan.visualPrompt,
          reference,
        );

    const storage = new ObjectStorageService();
    const entityPath = await storage.uploadObjectEntity(media.buffer, media.mime);

    const creative: AdCreative = {
      productNames: plan.productNames,
      headline: plan.headline,
      body: plan.body,
      callToAction: plan.callToAction,
      mediaType: channel === "tiktok" ? "video" : "image",
      mediaUrl: `/api/storage${entityPath}`,
      concept: plan.concept,
      generatedAt: new Date().toISOString(),
    };

    const nextSetup = setup && channel === "meta"
      ? {
          ...setup,
          creative: {
            ...setup.creative,
            mediaPath: entityPath,
            mediaMimeType: media.mime,
          },
        }
      : undefined;

    await db
      .update(campaignsTable)
      .set({
        creativeStatus: "pronto",
        creativeJson: creative,
        creativeError: null,
        ...(nextSetup ? { campaignSetup: nextSetup } : {}),
        updatedAt: new Date(),
      })
      .where(eq(campaignsTable.id, campaign.id));
    logger.info({ campaignId: campaign.id, channel }, "ad creative generated");
  } catch (err) {
    logger.error({ err, campaignId: campaign.id, imageModel: IMAGE_MODEL }, "ad creative generation failed");
    await fail(userFacingCreativeError(err));
  }
}
