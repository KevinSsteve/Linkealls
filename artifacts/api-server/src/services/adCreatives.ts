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
import { IS_ZERNIO_SIMULATION, searchMetaTargeting } from "./zernio.js";
import { META_AD_POLICY_PROMPT, META_AD_POLICY_VERSION } from "./metaAdPolicies.js";
import { assertAdvertisingNewActionsEnabled } from "../lib/launchPolicy.js";

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

interface ImageBasedAdCopy {
  headline: string;
  body: string;
  prompt: string;
  callToAction: string;
}

async function generateImageBasedAdCopy(
  buffer: Buffer,
  mime: string,
  objective: string,
  destination: string | undefined,
): Promise<ImageBasedAdCopy> {
  const response = await managedGemini.models.generateContent({
    model: TEXT_MODEL,
    contents: [{
      role: "user",
      parts: [
        {
          text: `Cria a copy de um anúncio Meta EXCLUSIVAMENTE a partir da imagem anexada.

Regras obrigatórias:
- A imagem é a única fonte para identificar o produto, serviço, marca e contexto.
- Não uses conhecimento externo, descrição de negócio, catálogo, sector ou nome de marca que não esteja visível na imagem.
- Não descrevas material eléctrico, ferramentas, ABB ou qualquer outro produto que não apareça claramente na imagem.
- Se houver texto ou marcas visíveis, podes usá-los apenas para descrever o que aparece, sem inventar autorização, preço, promoção ou benefício.
- Escreve em português de Angola.
- A headline deve ter no máximo 40 caracteres e o body no máximo 300 caracteres.
- O prompt visual deve manter o produto reconhecível e não deve adicionar texto à imagem.
- Objetivo técnico: ${objective}. Destino: ${destination ?? "catalog"}.
- Usa uma CTA compatível com o destino, mas não inventes informações sobre o produto.`,
        },
        { inlineData: { data: buffer.toString("base64"), mimeType: mime } },
      ],
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          body: { type: Type.STRING },
          prompt: { type: Type.STRING },
          callToAction: { type: Type.STRING, enum: [...ALLOWED_CTAS] },
        },
        required: ["headline", "body", "prompt", "callToAction"],
      },
    },
  });
  const copy = JSON.parse(response.text ?? "{}") as Partial<ImageBasedAdCopy>;
  return {
    headline: String(copy.headline ?? "").trim().slice(0, 40),
    body: String(copy.body ?? "").trim().slice(0, 300),
    prompt: String(copy.prompt ?? "").trim().slice(0, 1000),
    callToAction: ALLOWED_CTAS.includes(copy.callToAction as (typeof ALLOWED_CTAS)[number])
      ? String(copy.callToAction)
      : destination === "whatsapp" || destination === "linkealls_chat" ? "CONTACT_US" : "LEARN_MORE",
  };
}

export interface CampaignImageRecommendations {
  audience: CampaignSetup["audience"];
  description: {
    headline: string;
    body: string;
    prompt: string;
    callToAction: string;
  };
  budget: {
    recommendedBudgetAoa: number;
    expectedReach: string;
    expectedReturn: string;
    budgetReason: string;
  };
  audienceReason: string;
  imageAnalysis: NonNullable<CampaignSetup["imageAnalysis"]>;
  suggestedImagePath: string | null;
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

export async function analyzeCampaignImage(
  campaignId: string,
  businessId: number,
): Promise<CampaignImageRecommendations> {
  assertAdvertisingNewActionsEnabled();
  const campaign = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, campaignId), eq(campaignsTable.businessId, businessId)))
    .limit(1)
    .then((rows) => rows[0]);
  if (!campaign) throw new Error("Campanha não encontrada");

  const setup = campaign.campaignSetup as CampaignSetup | null;
  const imagePath = setup?.creative.source === "upload"
    ? setup.creative.originalMediaPath ?? setup.creative.mediaPath
    : setup?.creative.referenceImagePath;
  if (!imagePath) throw new Error("Adiciona uma imagem antes de pedir recomendações");

  const profile = await db
    .select({
      name: businessProfilesTable.name,
      sector: businessProfilesTable.sector,
      description: businessProfilesTable.description,
      offerings: businessProfilesTable.offerings,
    })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, businessId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!profile) throw new Error("Negócio não encontrado");

  const storage = new ObjectStorageService();
  const file = await storage.getObjectEntityFile(imagePath);
  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  const mime = setup?.creative.mediaMimeType ?? String(metadata.contentType ?? "image/png");

  const response = await managedGemini.models.generateContent({
    model: TEXT_MODEL,
    contents: [{
      role: "user",
      parts: [
        {
          text: `Analisa esta imagem de anúncio para a Linkealls e recomenda a campanha mais simples e eficaz para Angola.
Negócio: ${profile.name} (${profile.sector ?? "geral"})
Descrição do negócio: ${profile.description ?? "não disponível"}
Produtos/serviços: ${profile.offerings.slice(0, 20).map((item) => item.name).join(", ") || "não disponíveis"}
Campanha: ${campaign.name}
Objetivo escolhido: ${campaign.objective}

Regras:
- Responde em português de Angola.
- Não inventes uma promessa de vendas garantidas.
- Escolhe um público amplo, realista e fácil de activar no Meta.
- O orçamento é total da campanha, em Kz, no mínimo 5.000 Kz.
- expectedReturn deve ser uma expectativa prudente (ex.: mais conversas, visitas ou pedidos), não uma garantia.
 - Cria uma headline até 40 caracteres e uma descrição até 300 caracteres.
 - Extrai o texto visível e os objectos/produtos identificados na imagem.
 - Faz a verificação de conformidade segundo a política abaixo.

${META_AD_POLICY_PROMPT}`,
        },
        { inlineData: { data: buffer.toString("base64"), mimeType: mime } },
      ],
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          audience: {
            type: Type.OBJECT,
            properties: {
              location: { type: Type.STRING },
              ageMin: { type: Type.INTEGER },
              ageMax: { type: Type.INTEGER },
              gender: { type: Type.STRING, enum: ["all", "female", "male"] },
              interests: { type: Type.ARRAY, items: { type: Type.STRING } },
              excludedAudiences: { type: Type.STRING },
              audienceReason: { type: Type.STRING },
            },
            required: ["location", "ageMin", "ageMax", "gender", "interests", "excludedAudiences", "audienceReason"],
          },
          description: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              body: { type: Type.STRING },
              prompt: { type: Type.STRING },
              callToAction: { type: Type.STRING, enum: [...ALLOWED_CTAS] },
            },
            required: ["headline", "body", "prompt", "callToAction"],
          },
          imageAnalysis: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              detectedText: { type: Type.ARRAY, items: { type: Type.STRING } },
              detectedObjects: { type: Type.ARRAY, items: { type: Type.STRING } },
              policyStatus: { type: Type.STRING, enum: ["approved", "needs_review", "rejected"] },
              policyIssues: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["summary", "detectedText", "detectedObjects", "policyStatus", "policyIssues"],
          },
          budget: {
            type: Type.OBJECT,
            properties: {
              recommendedBudgetAoa: { type: Type.INTEGER },
              expectedReach: { type: Type.STRING },
              expectedReturn: { type: Type.STRING },
              budgetReason: { type: Type.STRING },
            },
            required: ["recommendedBudgetAoa", "expectedReach", "expectedReturn", "budgetReason"],
          },
        },
        required: ["audience", "description", "budget", "imageAnalysis"],
      },
    },
  });

  const raw = JSON.parse(response.text ?? "{}") as {
    audience?: {
      location?: string;
      ageMin?: number;
      ageMax?: number;
      gender?: "all" | "female" | "male";
      interests?: string[];
      excludedAudiences?: string;
      audienceReason?: string;
    };
    description?: { headline?: string; body?: string; prompt?: string; callToAction?: string };
    budget?: {
      recommendedBudgetAoa?: number;
      expectedReach?: string;
      expectedReturn?: string;
      budgetReason?: string;
    };
    imageAnalysis?: {
      summary?: string;
      detectedText?: string[];
      detectedObjects?: string[];
      policyStatus?: "approved" | "needs_review" | "rejected";
      policyIssues?: string[];
    };
  };
  const rawAudience = raw.audience ?? {};
  const locationName = String(rawAudience.location ?? setup?.audience.location ?? "Luanda").trim() || "Luanda";
  let location = locationName;
  let locationId = setup?.audience.locationId ?? null;
  try {
    const matches = await searchMetaTargeting("city", locationName);
    if (matches[0]) {
      location = matches[0].name;
      locationId = matches[0].id;
    }
  } catch (error) {
    logger.warn({ error, campaignId }, "AI audience city lookup failed");
  }
  if (!locationId && IS_ZERNIO_SIMULATION) {
    locationId = `simulation-city-${locationName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }

  const interestNames = Array.isArray(rawAudience.interests)
    ? rawAudience.interests.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
    : [];
  const resolvedInterests = await Promise.all(interestNames.map(async (name) => {
    try {
      const matches = await searchMetaTargeting("interest", name);
      return matches[0] ? { name: matches[0].name, id: matches[0].id } : null;
    } catch (error) {
      logger.warn({ error, campaignId, interest: name }, "AI audience interest lookup failed");
      return null;
    }
  }));
  const interests = resolvedInterests.filter((item): item is { name: string; id: string } => item !== null);
  const ageMin = Math.min(65, Math.max(18, Math.round(rawAudience.ageMin ?? 18)));
  const ageMax = Math.max(ageMin, Math.min(65, Math.round(rawAudience.ageMax ?? 55)));
  const recommendedBudgetAoa = Math.min(
    10_000_000,
    Math.max(5_000, Math.round(Number(raw.budget?.recommendedBudgetAoa ?? 15_000) / 500) * 500),
  );
  const policyStatus =
    raw.imageAnalysis?.policyStatus === "approved" ||
    raw.imageAnalysis?.policyStatus === "needs_review" ||
    raw.imageAnalysis?.policyStatus === "rejected"
      ? raw.imageAnalysis.policyStatus
      : "needs_review";
  const imageAnalysis = {
    summary: String(raw.imageAnalysis?.summary ?? "A imagem foi analisada para preparar o anúncio.").slice(0, 1000),
    detectedText: Array.isArray(raw.imageAnalysis?.detectedText)
      ? raw.imageAnalysis.detectedText.map((item) => String(item).slice(0, 200)).slice(0, 30)
      : [],
    detectedObjects: Array.isArray(raw.imageAnalysis?.detectedObjects)
      ? raw.imageAnalysis.detectedObjects.map((item) => String(item).slice(0, 160)).slice(0, 30)
      : [],
    policyStatus,
    policyIssues: Array.isArray(raw.imageAnalysis?.policyIssues)
      ? raw.imageAnalysis.policyIssues.map((item) => String(item).slice(0, 300)).slice(0, 20)
      : [],
    policyVersion: META_AD_POLICY_VERSION,
    reviewedAt: new Date().toISOString(),
  } as NonNullable<CampaignSetup["imageAnalysis"]>;

  let imageCopy: ImageBasedAdCopy = {
    headline: "Produto em destaque",
    body: imageAnalysis.summary.slice(0, 300),
    prompt: "Create a clean, compliant Meta ad image based only on the visible product in this image. Keep it recognizable, with no added claims or text.",
    callToAction: setup?.destination === "whatsapp" || setup?.destination === "linkealls_chat" ? "CONTACT_US" : "LEARN_MORE",
  };
  try {
    imageCopy = await generateImageBasedAdCopy(buffer, mime, campaign.objective, setup?.destination);
  } catch (error) {
    logger.warn({ error, campaignId }, "Image-only ad copy generation failed; using visual analysis summary");
  }

  let suggestedImagePath: string | null = null;
  try {
    const suggested = await generateImage(
      `Create a compliant Meta ad image based on this product photo. Keep the product recognizable, use a clean commercial composition, natural Angolan context, no extra claims and no text over the image. ${imageCopy.prompt}`,
      { buffer, mime },
    );
    suggestedImagePath = await storage.uploadObjectEntity(suggested.buffer, suggested.mime);
  } catch (error) {
    logger.warn({ error, campaignId }, "Suggested ad image generation failed; keeping original image");
  }

  return {
    audience: {
      location,
      locationId,
      ageMin,
      ageMax,
      gender: rawAudience.gender === "female" || rawAudience.gender === "male" ? rawAudience.gender : "all",
      interests: interests.map((item) => item.name).join(", "),
      interestIds: interests.map((item) => item.id),
      excludedAudiences: String(rawAudience.excludedAudiences ?? ""),
    },
    description: {
      headline: imageCopy.headline,
      body: imageCopy.body,
      prompt: imageCopy.prompt,
      callToAction: imageCopy.callToAction,
    },
    budget: {
      recommendedBudgetAoa,
      expectedReach: String(raw.budget?.expectedReach ?? "A IA vai estimar o alcance depois da publicação.").slice(0, 160),
      expectedReturn: String(raw.budget?.expectedReturn ?? "Mais pessoas a conhecer e contactar o negócio.").slice(0, 300),
      budgetReason: String(raw.budget?.budgetReason ?? "Orçamento inicial recomendado pela IA para testar o anúncio.").slice(0, 600),
    },
    audienceReason: String(rawAudience.audienceReason ?? "Público recomendado pela análise da imagem e do negócio.").slice(0, 600),
    imageAnalysis,
    suggestedImagePath,
  };
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
  assertAdvertisingNewActionsEnabled();
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
