/**
 * Estrategista de Campanhas — CRUD + geração de kit Gemini + métricas de atribuição.
 */
import { GoogleGenAI } from "@google/genai";
import {
  db,
  campaignsTable,
  leadsTable,
  type Campaign,
  type CampaignKit,
  type CampaignPlatform,
  type CampaignStatus,
  type CampaignSetup,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getOrCreateProfile } from "./businessProfile.js";
import { listLeads } from "./leads.js";

const MODEL = "gemini-3-flash-preview";

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listCampaigns(businessId?: number): Promise<Campaign[]> {
  if (businessId !== undefined) {
    return db.select().from(campaignsTable)
      .where(eq(campaignsTable.businessId, businessId))
      .orderBy(desc(campaignsTable.createdAt));
  }
  return db.select().from(campaignsTable).orderBy(desc(campaignsTable.createdAt));
}

export async function getCampaign(id: string, businessId?: number): Promise<Campaign | null> {
  const rows = await db
    .select()
    .from(campaignsTable)
    .where(
      businessId !== undefined
        ? and(eq(campaignsTable.id, id), eq(campaignsTable.businessId, businessId))
        : eq(campaignsTable.id, id),
    );
  return rows[0] ?? null;
}

export async function createCampaign(
  data: { name: string; platform: CampaignPlatform; objective: string; budget: number },
  businessId?: number,
): Promise<Campaign> {
  const utmSlug = slugify(data.name);
  const inserted = await db
    .insert(campaignsTable)
    .values({ ...data, utmSlug, ...(businessId !== undefined ? { businessId } : {}) })
    .returning();
  return inserted[0]!;
}

export async function duplicateCampaign(id: string, businessId?: number): Promise<Campaign> {
  const source = await getCampaign(id, businessId);
  if (!source) throw new Error("Campanha não encontrada");

  // Build a unique slug: append "-copia" then a counter until no collision
  const baseSlug = slugify(`${source.name}-copia`);
  let utmSlug = baseSlug;
  let suffix = 2;
  while (true) {
    const existing = await db
      .select({ id: campaignsTable.id })
      .from(campaignsTable)
      .where(eq(campaignsTable.utmSlug, utmSlug))
      .limit(1);
    if (existing.length === 0) break;
    utmSlug = `${baseSlug}-${suffix++}`;
  }

  const resolvedBusinessId = businessId ?? source.businessId ?? undefined;
  const inserted = await db
    .insert(campaignsTable)
    .values({
      name: `${source.name} (cópia)`,
      platform: source.platform,
      objective: source.objective,
      budget: source.budget,
      status: "rascunho" as const,
      utmSlug,
      kitJson: null,
      totalSpend: 0,
      ...(resolvedBusinessId !== undefined ? { businessId: resolvedBusinessId } : {}),
    })
    .returning();
  return inserted[0]!;
}

export class CampaignDeleteError extends Error {
  statusCode = 409;
}

/**
 * Only an unpaid, unpublished draft can be removed. Once payment or delivery
 * has started, keeping the audit row is safer than silently deleting spend
 * history or breaking lead attribution.
 */
export async function deleteCampaign(id: string, businessId?: number): Promise<boolean> {
  const scope =
    businessId !== undefined
      ? and(eq(campaignsTable.id, id), eq(campaignsTable.businessId, businessId))
      : eq(campaignsTable.id, id);
  const existing = await db
    .select({
      id: campaignsTable.id,
      paymentStatus: campaignsTable.paymentStatus,
      publishStatus: campaignsTable.publishStatus,
      status: campaignsTable.status,
    })
    .from(campaignsTable)
    .where(scope)
    .limit(1);
  const campaign = existing[0];
  if (!campaign) return false;
  if (
    campaign.paymentStatus !== "nao_pago" ||
    campaign.publishStatus !== "nao_publicada" ||
    campaign.status !== "rascunho"
  ) {
    throw new CampaignDeleteError(
      "Só podes eliminar rascunhos que ainda não foram pagos nem publicados",
    );
  }

  const deleted = await db
    .delete(campaignsTable)
    .where(and(scope, eq(campaignsTable.paymentStatus, "nao_pago")))
    .returning({ id: campaignsTable.id });
  return deleted.length > 0;
}

export async function updateCampaign(
  id: string,
  patch: Partial<{
    name: string;
    status: CampaignStatus;
    objective: string;
    budget: number;
    totalSpend: number;
    durationDays: number;
  }>,
  businessId?: number,
): Promise<Campaign | null> {
  const scope =
    businessId !== undefined
      ? and(eq(campaignsTable.id, id), eq(campaignsTable.businessId, businessId))
      : eq(campaignsTable.id, id);

  // Commercial terms are immutable once payment started: budget/duration
  // define what was (or is being) paid for and what goes to the ads gateway.
  const touchesCommercialTerms =
    patch.budget !== undefined || patch.durationDays !== undefined || patch.objective !== undefined;
  const where = touchesCommercialTerms
    ? and(scope, eq(campaignsTable.paymentStatus, "nao_pago"))
    : scope;

  const rows = await db
    .update(campaignsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(where)
    .returning();
  if (rows[0]) return rows[0];

  if (touchesCommercialTerms) {
    const existing = await db.select({ id: campaignsTable.id }).from(campaignsTable).where(scope).limit(1);
    if (existing[0]) {
      throw new CampaignLockedError(
        "O objetivo, orçamento e duração não podem ser alterados depois de o pagamento ter começado",
      );
    }
  }
  return null;
}

export async function updateCampaignSetup(
  id: string,
  setup: CampaignSetup,
  businessId?: number,
): Promise<Campaign | null> {
  const scope =
    businessId !== undefined
      ? and(eq(campaignsTable.id, id), eq(campaignsTable.businessId, businessId))
      : eq(campaignsTable.id, id);

  const existing = await getCampaign(id, businessId);
  if (!existing) return null;
  if (existing.paymentStatus === "pago" || existing.paymentStatus === "pendente") {
    throw new CampaignLockedError("A configuração não pode ser alterada depois de o pagamento começar");
  }

  const creativeChanged = JSON.stringify(existing.campaignSetup?.creative ?? null) !== JSON.stringify(setup.creative);
  const uploadedCreative =
    setup.creative.source === "upload" && setup.creative.mediaPath
      ? {
          productNames: [],
          headline: setup.creative.headline,
          body: setup.creative.body,
          callToAction: setup.creative.callToAction,
          mediaType: "image" as const,
          mediaUrl: `/api/storage${setup.creative.mediaPath}`,
          concept: "Imagem carregada pelo dono",
          generatedAt: new Date().toISOString(),
        }
      : null;

  const rows = await db
    .update(campaignsTable)
    .set({
      campaignSetup: setup,
      ...(uploadedCreative
        ? { creativeStatus: "pronto" as const, creativeJson: uploadedCreative, creativeError: null }
        : creativeChanged && setup.creative.source === "gemini"
          ? { creativeStatus: "nenhum" as const, creativeJson: null, creativeError: null }
          : {}),
      updatedAt: new Date(),
    })
    .where(scope)
    .returning();
  return rows[0] ?? null;
}

export class CampaignLockedError extends Error {
  statusCode = 409;
}

// ─── UTM slug helper ──────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")                     // decompose accented chars
    .replace(/[\u0300-\u036f]/g, "")      // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

// ─── Gemini strategy generation ───────────────────────────────────────────────

const PLATFORM_LABELS: Record<CampaignPlatform, string> = {
  google:    "Google Ads (Search + Display)",
  instagram: "Instagram Ads",
  facebook:  "Facebook Ads",
  tiktok:    "TikTok Ads",
  meta:      "Meta Ads (Facebook + Instagram)",
};

export async function generateCampaignKit(campaignId: string, businessId?: number): Promise<Campaign> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const campaign = await getCampaign(campaignId, businessId);
  if (!campaign) throw new Error("Campaign not found");

  const resolvedBusinessId = businessId ?? campaign.businessId ?? undefined;
  const profile = await getOrCreateProfile(resolvedBusinessId);
  const leads   = await listLeads(resolvedBusinessId);

  // Compute lead intelligence for context
  const totalLeads = leads.length;
  const qualifiedLeads = leads.filter((l) => l.state === "qualificado" || l.state === "entregue");
  const avgScore = qualifiedLeads.length > 0
    ? Math.round(qualifiedLeads.reduce((s, l) => s + (l.score ?? 0), 0) / qualifiedLeads.length)
    : null;
  const topInterests = qualifiedLeads
    .map((l) => l.qualificationData.interest)
    .filter(Boolean)
    .slice(0, 5);
  const topBudgets = qualifiedLeads
    .map((l) => l.qualificationData.budget)
    .filter(Boolean)
    .slice(0, 5);

  const platformLabel = PLATFORM_LABELS[campaign.platform];

  const prompt = `Você é um estrategista de marketing digital especializado em Angola, com profundo conhecimento de ${platformLabel}.

NEGÓCIO:
- Nome: ${profile.name || "Negócio sem nome"}
- Setor: ${profile.sector || "não especificado"}
- Descrição: ${profile.description || "não disponível"}
- Público-alvo: ${profile.targetAudience || "não especificado"}
- Diferenciais: ${profile.differentials.join(", ") || "não especificados"}
- Serviços/Produtos: ${profile.offerings.map((o) => `${o.name}${o.price ? ` (${o.price})` : ""}`).join(", ") || "não especificados"}
- Tom de voz: ${profile.toneOfVoice || "profissional"}

CAMPANHA:
- Nome: ${campaign.name}
- Plataforma: ${platformLabel}
- Objetivo: ${campaign.objective}
- Orçamento total: ${campaign.budget > 0 ? `${campaign.budget.toLocaleString("pt-AO")} AOA` : "a definir"}

INTELIGÊNCIA DO FUNIL:
- Total de leads qualificados: ${qualifiedLeads.length}/${totalLeads}
- Pontuação média dos leads: ${avgScore ?? "sem dados ainda"}
${topInterests.length > 0 ? `- Interesses mais comuns: ${topInterests.join(", ")}` : ""}
${topBudgets.length > 0 ? `- Orçamentos mencionados: ${topBudgets.join(", ")}` : ""}

Gera um plano de campanha COMPLETO e DETALHADO para ${platformLabel} em formato JSON exacto:

{
  "audience": {
    "demographics": "descrição do público por idade, género, localização (foco em Angola)",
    "interests": "interesses e categorias de segmentação específicas da plataforma",
    "behaviours": "comportamentos de compra e padrões online relevantes",
    "excludedAudiences": "públicos a excluir para não desperdiçar orçamento"
  },
  "budgetAllocation": {
    "suggestion": "como dividir o orçamento (ex: 70% prospecting, 30% retargeting)",
    "dailyBudget": "orçamento diário sugerido e estrutura de adsets",
    "bidStrategy": "estratégia de licitação recomendada e porquê"
  },
  "copies": [
    {
      "headline": "título principal (máx 30 caracteres para Google, 40 para Meta/TikTok)",
      "body": "texto do anúncio — convincente, direto ao ponto, em angolano",
      "cta": "call-to-action específico"
    },
    {
      "headline": "variante A/B — abordagem diferente (problema vs solução)",
      "body": "cópia focada numa pain point diferente",
      "cta": "cta alternativo"
    },
    {
      "headline": "variante com prova social ou urgência",
      "body": "cópia com elemento de confiança ou escassez",
      "cta": "cta de urgência"
    }
  ],
  "creativeBrief": {
    "format": "formatos de criativos recomendados (vídeo/imagem/carrossel/stories)",
    "visualConcept": "conceito visual detalhado — o que mostrar, cores, estilo, vibe",
    "doList": ["elemento visual obrigatório 1", "elemento 2", "elemento 3"],
    "dontList": ["o que evitar 1", "o que evitar 2"]
  },
  "segmentationTips": [
    "dica de segmentação específica 1",
    "dica de segmentação específica 2",
    "dica de segmentação específica 3"
  ],
  "estimatedReach": "estimativa de alcance semanal com o orçamento indicado em Angola",
  "keyMetricsToTrack": ["CPL (custo por lead)", "taxa de qualificação", "ROAS estimado"],
  "generatedAt": "${new Date().toISOString()}"
}

IMPORTANTE:
- Responde APENAS com o JSON válido, sem markdown, sem explicações fora do JSON
- Adapta TUDO ao mercado angolano (referências locais, poder de compra, plataformas usadas)
- As copies devem soar naturais em português de Angola
- Sê específico e accionável — evita generalidades`;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  let kit: CampaignKit;
  try {
    kit = JSON.parse(text) as CampaignKit;
    kit.generatedAt = new Date().toISOString();
  } catch {
    logger.error({ text: text.slice(0, 500) }, "Failed to parse campaign kit JSON");
    throw new Error("Não foi possível gerar o kit da campanha — tenta de novo");
  }

  const rows = await db
    .update(campaignsTable)
    .set({ kitJson: kit, updatedAt: new Date() })
    .where(eq(campaignsTable.id, campaignId))
    .returning();

  return rows[0]!;
}

// ─── Attribution metrics ──────────────────────────────────────────────────────

export interface CampaignMetrics {
  campaignId: string;
  totalLeads: number;
  qualifiedLeads: number;
  deliveredLeads: number;
  qualificationRate: number;  // 0-100
  avgScore: number | null;
  totalSpend: number;          // AOA (from campaign.totalSpend)
  costPerLead: number | null;  // totalSpend / totalLeads
  costPerQualifiedLead: number | null;
  captationUrl: string;
}

export async function getCampaignMetrics(campaignId: string, businessId?: number): Promise<CampaignMetrics | null> {
  const campaign = await getCampaign(campaignId, businessId);
  if (!campaign) return null;

  const allLeads = await listLeads(businessId ?? campaign.businessId ?? undefined);
  // Match leads by utm_campaign slug
  const attributed = allLeads.filter(
    (l) => l.origin?.campaign === campaign.utmSlug,
  );

  const qualified = attributed.filter(
    (l) => l.state === "qualificado" || l.state === "entregue",
  );
  const delivered = attributed.filter((l) => l.state === "entregue");

  const qualificationRate =
    attributed.length > 0
      ? Math.round((qualified.length / attributed.length) * 100)
      : 0;

  const scoredLeads = qualified.filter((l) => l.score !== null);
  const avgScore =
    scoredLeads.length > 0
      ? Math.round(scoredLeads.reduce((s, l) => s + (l.score ?? 0), 0) / scoredLeads.length)
      : null;

  const costPerLead =
    campaign.totalSpend > 0 && attributed.length > 0
      ? Math.round(campaign.totalSpend / attributed.length)
      : null;

  const costPerQualifiedLead =
    campaign.totalSpend > 0 && qualified.length > 0
      ? Math.round(campaign.totalSpend / qualified.length)
      : null;

  // Canonical business-scoped capture URL (legacy /captacao is a dead notice page).
  const profile = await getOrCreateProfile(businessId ?? campaign.businessId ?? undefined);
  const captationUrl = profile.slug
    ? `/e/${profile.slug}/captacao?utm_source=${campaign.platform}&utm_medium=paid&utm_campaign=${campaign.utmSlug}`
    : `/captacao?utm_source=${campaign.platform}&utm_medium=paid&utm_campaign=${campaign.utmSlug}`;

  return {
    campaignId,
    totalLeads: attributed.length,
    qualifiedLeads: qualified.length,
    deliveredLeads: delivered.length,
    qualificationRate,
    avgScore,
    totalSpend: campaign.totalSpend,
    costPerLead,
    costPerQualifiedLead,
    captationUrl,
  };
}

// ─── AI optimization suggestions ─────────────────────────────────────────────

export async function generateOptimizationSuggestions(campaignId: string, businessId?: number): Promise<string[]> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const campaign = await getCampaign(campaignId, businessId);
  if (!campaign) throw new Error("Campaign not found");

  const metrics = await getCampaignMetrics(campaignId, businessId);
  if (!metrics) throw new Error("Metrics not found");

  if (metrics.totalLeads === 0) {
    return [
      "Partilha o link de captação nos teus anúncios para começar a receber dados.",
      "Com dados reais o assistente poderá dar sugestões de otimização mais precisas.",
    ];
  }

  const resolvedBizId = businessId ?? campaign.businessId ?? undefined;
  const allLeads = await listLeads(resolvedBizId);
  const attributed = allLeads.filter((l) => l.origin?.campaign === campaign.utmSlug);
  const allCampaigns = await listCampaigns(resolvedBizId);

  // Cross-campaign context
  const otherMetrics = await Promise.all(
    allCampaigns
      .filter((c) => c.id !== campaignId)
      .map((c) => getCampaignMetrics(c.id, resolvedBizId)),
  );
  const bestOther = otherMetrics
    .filter(Boolean)
    .filter((m) => m!.totalLeads > 2)
    .sort((a, b) => (b!.qualificationRate - a!.qualificationRate))
    .at(0);

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Analisa esta campanha e dá 3-5 sugestões de otimização práticas e específicas.

CAMPANHA: "${campaign.name}" (${campaign.platform})
OBJETIVO: ${campaign.objective}
ORÇAMENTO: ${campaign.budget.toLocaleString("pt-AO")} AOA
GASTO ATÉ AGORA: ${campaign.totalSpend.toLocaleString("pt-AO")} AOA

MÉTRICAS:
- Leads recebidos: ${metrics.totalLeads}
- Taxa de qualificação: ${metrics.qualificationRate}%
- Pontuação média dos leads: ${metrics.avgScore ?? "sem dados"}
- Custo por lead: ${metrics.costPerLead ? `${metrics.costPerLead.toLocaleString("pt-AO")} AOA` : "sem dados"}
- Custo por lead qualificado: ${metrics.costPerQualifiedLead ? `${metrics.costPerQualifiedLead.toLocaleString("pt-AO")} AOA` : "sem dados"}

${bestOther ? `CONTEXTO: A campanha com melhor desempenho tem ${bestOther.qualificationRate}% de qualificação (vs ${metrics.qualificationRate}% desta).` : ""}

ÚLTIMOS LEADS (resumo):
${attributed.slice(0, 5).map((l) => `- ${l.qualificationData.name ?? "sem nome"}: score ${l.score ?? "?"}, interesse: ${l.qualificationData.interest ?? "desconhecido"}`).join("\n")}

Responde com um array JSON de strings — máximo 5 sugestões, cada uma com máximo 120 caracteres, em português de Angola:
["sugestão 1", "sugestão 2", ...]

APENAS o array JSON, sem mais nada.`,
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  try {
    const suggestions = JSON.parse(text) as string[];
    return Array.isArray(suggestions) ? suggestions.slice(0, 5) : [];
  } catch {
    return ["Analisa os leads manualmente e ajusta a segmentação com base nos mais qualificados."];
  }
}
