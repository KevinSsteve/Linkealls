import {
  and, desc, eq, inArray, sql,
} from "drizzle-orm";
import {
  db,
  salesStrategyConfigSchema,
  salesStrategyOverridesTable,
  salesStrategyVersionsTable,
  trafficCreativesTable,
  campaignsTable,
  type SalesStrategyConfig,
  type SalesStrategyOverrideConfig,
  type SalesStrategyTemplate,
  type SalesStrategyVersion,
} from "@workspace/db";
import { getOrCreateProfile } from "./businessProfile.js";
import { applySalesStrategyOverride, isRuntimeSourceEligible } from "../lib/salesStrategyRuntime.js";
import { structurallyEqualJson } from "../lib/canonicalJson.js";
export { applySalesStrategyOverride } from "../lib/salesStrategyRuntime.js";

const template = (
  key: SalesStrategyTemplate,
  objective: SalesStrategyConfig["objective"],
  questions: string[],
  actions: SalesStrategyConfig["availableActions"],
  stageConditions: string[],
): SalesStrategyConfig => ({
  template: key,
  objective,
  audience: "",
  priorityOffers: [],
  essentialQuestions: questions,
  verifiedDifferentials: [],
  objectionResponses: [],
  negotiationLimits: ["Não inventar descontos, stock, garantias, prazos ou condições."],
  escalationRules: ["Chamar o dono quando faltar um facto aprovado ou o cliente pedir atendimento humano."],
  stageConditions,
  availableActions: actions,
});

export const SALES_STRATEGY_TEMPLATE_CONFIGS: Record<SalesStrategyTemplate, SalesStrategyConfig> = {
  product_commerce: template("product_commerce", "purchase", ["Qual opção ou uso procura?", "Qual quantidade precisa?"], ["catalog", "checkout", "contact", "whatsapp", "owner_handoff"], ["Compra clara pode avançar sem qualificação adicional.", "Confirmar produto e quantidade antes do checkout."]),
  quote_service: template("quote_service", "quote", ["Que resultado precisa?", "Qual o âmbito, local e prazo?"], ["quote_request", "contact", "whatsapp", "owner_handoff"], ["Recolher apenas dados que alterem o orçamento.", "Pedido não significa orçamento confirmado."]),
  appointment_service: template("appointment_service", "appointment_request", ["Que serviço procura?", "Que período e local prefere?"], ["appointment_request", "contact", "whatsapp", "owner_handoff"], ["Registar preferência; nunca confirmar marcação sem calendário."]),
  high_value: template("high_value", "visit_request", ["Qual o uso e requisitos essenciais?", "Qual localização e faixa de investimento?"], ["catalog", "visit_request", "contact", "whatsapp", "owner_handoff"], ["Comparar poucas opções por critérios.", "Visita é apenas um pedido até confirmação humana."]),
  b2b_project: template("b2b_project", "contact", ["Qual problema e resultado de negócio?", "Qual âmbito, prazo e decisores?"], ["quote_request", "contact", "whatsapp", "owner_handoff"], ["Entender impacto sem exagerar consequências.", "Encaminhar quando houver requisitos técnicos em aberto."]),
  consultative: template("consultative", "contact", ["O que pretende alcançar?", "Que critério mais pesa na decisão?"], ["catalog", "quote_request", "contact", "whatsapp", "owner_handoff"], ["Responder primeiro; fazer no máximo uma pergunta útil.", "Propor apenas um próximo passo real."]),
};

/** Conservative strategy derived from the approved business profile at runtime.
 * It is deliberately factual: no model output can invent negotiation rules,
 * prices, stock, availability or promises. */
export function deriveAutomaticStrategy(profile: {
  sector?: string | null;
  description?: string | null;
  targetAudience?: string | null;
  toneOfVoice?: string | null;
  differentials?: string[] | null;
  offerings?: Array<{ name: string }> | null;
  qualificationGoals?: string[] | null;
}): SalesStrategyConfig {
  const offerings = (profile.offerings ?? []).map((item) => item.name).filter(Boolean).slice(0, 20);
  const sector = `${profile.sector ?? ""} ${profile.description ?? ""}`.toLocaleLowerCase("pt-AO");
  const highValue = /\b(im[oó]vel|casa|terreno|apartamento|viatura|carro)\b/i.test(sector);
  const service = /\b(servi[cç]o|consult|agenc|project|projeto|obra)\b/i.test(sector);
  const objective = highValue ? "visit_request" : service ? "quote" : "purchase";
  return {
    template: highValue ? "high_value" : service ? "quote_service" : "product_commerce",
    objective,
    audience: profile.targetAudience?.trim() ?? "",
    priorityOffers: offerings.slice(0, 5),
    essentialQuestions: highValue
      ? ["Que características e localização são essenciais para ti?"]
      : service
        ? ["Que resultado precisas e qual é o âmbito do trabalho?"]
        : ["O que procuras ou que uso tens em mente?"],
    verifiedDifferentials: (profile.differentials ?? []).slice(0, 10),
    objectionResponses: [],
    negotiationLimits: ["Não inventar descontos, stock, garantias, prazos ou condições."],
    escalationRules: ["Encaminhar quando faltar um facto aprovado ou o cliente pedir a equipa."],
    stageConditions: ["Responder primeiro; fazer no máximo uma pergunta relevante.", "Não confirmar marcação, visita ou entrega sem capacidade real."],
    availableActions: highValue
      ? ["catalog", "visit_request", "contact", "whatsapp", "owner_handoff"]
      : service
        ? ["quote_request", "contact", "owner_handoff"]
        : ["catalog", "checkout", "contact", "whatsapp", "owner_handoff"],
    tone: profile.toneOfVoice?.trim() || undefined,
  };
}

/** Persist the generated strategy so every turn is auditable and replayable.
 * Manual/approved strategies are never replaced. A changed approved profile
 * creates a new active automatic version and archives the previous one. */
export async function ensureAutomaticStrategyVersion(
  businessId: number,
  profile: Parameters<typeof deriveAutomaticStrategy>[0],
): Promise<SalesStrategyVersion | undefined> {
  const config = deriveAutomaticStrategy(profile);
  const name = "Estratégia automática";
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`automatic-sales-strategy:${businessId}`}, 0))`);
    const latest = (await tx.select().from(salesStrategyVersionsTable)
      .where(and(eq(salesStrategyVersionsTable.businessId, businessId), eq(salesStrategyVersionsTable.status, "active")))
      .orderBy(desc(salesStrategyVersionsTable.createdAt)).limit(1))[0];
    if (latest && latest.name !== name) return latest;
    if (latest && structurallyEqualJson(latest.config, config)) return latest;
    if (latest) {
      await tx.update(salesStrategyVersionsTable).set({ status: "archived", updatedAt: new Date() })
        .where(and(eq(salesStrategyVersionsTable.id, latest.id), eq(salesStrategyVersionsTable.businessId, businessId), eq(salesStrategyVersionsTable.status, "active")));
    }
    const rows = await tx.insert(salesStrategyVersionsTable).values({
      businessId,
      name,
      config,
      gaps: strategyGaps(config),
      basedOnId: latest?.id,
      status: "active",
      activatedAt: new Date(),
      approvedAt: new Date(),
    }).returning();
    return rows[0];
  });
}

export function strategyGaps(config: SalesStrategyConfig): string[] {
  const gaps: string[] = [];
  if (!config.audience.trim()) gaps.push("Público por definir");
  if (!config.priorityOffers.length) gaps.push("Ofertas prioritárias por definir");
  if (!config.verifiedDifferentials.length) gaps.push("Diferenciais comprovados por definir");
  if (!config.essentialQuestions.length) gaps.push("Perguntas essenciais por definir");
  return gaps;
}

export function templates() {
  return Object.entries(SALES_STRATEGY_TEMPLATE_CONFIGS).map(([id, config]) => ({ id, config }));
}

export async function listStrategies(businessId: number) {
  return db.select().from(salesStrategyVersionsTable)
    .where(eq(salesStrategyVersionsTable.businessId, businessId))
    .orderBy(desc(salesStrategyVersionsTable.createdAt));
}

export async function createStrategyDraft(businessId: number, input: { name: string; config: unknown; basedOnId?: string }) {
  const config = salesStrategyConfigSchema.parse(input.config);
  if (input.basedOnId) {
    const base = await db.select({ id: salesStrategyVersionsTable.id }).from(salesStrategyVersionsTable)
      .where(and(eq(salesStrategyVersionsTable.id, input.basedOnId), eq(salesStrategyVersionsTable.businessId, businessId))).limit(1);
    if (!base[0]) throw new Error("Versão base não encontrada");
  }
  const rows = await db.insert(salesStrategyVersionsTable).values({
    businessId, name: input.name.trim(), config, gaps: strategyGaps(config), basedOnId: input.basedOnId,
  }).returning();
  return rows[0]!;
}

export async function updateStrategyDraft(businessId: number, id: string, input: { name: string; config: unknown }) {
  const config = salesStrategyConfigSchema.parse(input.config);
  const rows = await db.update(salesStrategyVersionsTable).set({
    name: input.name.trim(), config, gaps: strategyGaps(config), updatedAt: new Date(),
  }).where(and(eq(salesStrategyVersionsTable.id, id), eq(salesStrategyVersionsTable.businessId, businessId), eq(salesStrategyVersionsTable.status, "draft"))).returning();
  if (!rows[0]) throw new Error("Apenas um rascunho deste negócio pode ser editado");
  return rows[0];
}

export async function activateStrategy(businessId: number, id: string) {
  return db.transaction(async (tx) => {
    const target = await tx.select().from(salesStrategyVersionsTable)
      .where(and(eq(salesStrategyVersionsTable.id, id), eq(salesStrategyVersionsTable.businessId, businessId))).limit(1);
    if (!target[0]) throw new Error("Estratégia não encontrada");
    if (target[0].status === "draft") throw new Error("Aprova esta versão antes de a activar");
    await tx.update(salesStrategyVersionsTable).set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(salesStrategyVersionsTable.businessId, businessId), eq(salesStrategyVersionsTable.status, "active")));
    const now = new Date();
    const rows = await tx.update(salesStrategyVersionsTable).set({
      status: "active", approvedAt: target[0].approvedAt ?? now, activatedAt: now, updatedAt: now,
    }).where(and(eq(salesStrategyVersionsTable.id, id), eq(salesStrategyVersionsTable.businessId, businessId))).returning();
    return rows[0]!;
  });
}

export async function approveStrategy(businessId: number, id: string) {
  const rows = await db.update(salesStrategyVersionsTable).set({
    status: "approved", approvedAt: new Date(), updatedAt: new Date(),
  }).where(and(
    eq(salesStrategyVersionsTable.id, id),
    eq(salesStrategyVersionsTable.businessId, businessId),
    eq(salesStrategyVersionsTable.status, "draft"),
  )).returning();
  if (!rows[0]) throw new Error("Apenas um rascunho deste negócio pode ser aprovado");
  return rows[0];
}

async function validSource(businessId: number, sourceType: "campaign" | "traffic_creative", sourceId: string) {
  const table = sourceType === "campaign" ? campaignsTable : trafficCreativesTable;
  const rows = await db.select({ id: table.id }).from(table as typeof campaignsTable)
    .where(and(eq(table.id, sourceId), eq(table.businessId, businessId))).limit(1);
  return Boolean(rows[0]);
}

export async function saveStrategyOverride(
  businessId: number,
  input: { sourceType: "campaign" | "traffic_creative"; sourceId: string; strategyVersionId?: string; config: SalesStrategyOverrideConfig; approved: boolean },
) {
  if (!(await validSource(businessId, input.sourceType, input.sourceId))) throw new Error("Origem não encontrada neste negócio");
  if (input.strategyVersionId) {
    const strategy = await db.select({ id: salesStrategyVersionsTable.id }).from(salesStrategyVersionsTable)
      .where(and(eq(salesStrategyVersionsTable.id, input.strategyVersionId), eq(salesStrategyVersionsTable.businessId, businessId))).limit(1);
    if (!strategy[0]) throw new Error("Estratégia não encontrada neste negócio");
  }
  const rows = await db.insert(salesStrategyOverridesTable).values({
    ...input, businessId, approvedAt: input.approved ? new Date() : null,
  }).onConflictDoUpdate({
    target: [salesStrategyOverridesTable.businessId, salesStrategyOverridesTable.sourceType, salesStrategyOverridesTable.sourceId],
    set: { strategyVersionId: input.strategyVersionId, config: input.config, approved: input.approved, approvedAt: input.approved ? new Date() : null, updatedAt: new Date() },
  }).returning();
  return rows[0]!;
}

export async function resolveSalesStrategy(businessId: number, source?: { type: "campaign" | "traffic_creative"; id: string }) {
  let override: typeof salesStrategyOverridesTable.$inferSelect | undefined;
  let sourceEligible = Boolean(source);
  if (source?.type === "traffic_creative") {
    const row = (await db.select({ active: trafficCreativesTable.active }).from(trafficCreativesTable).where(and(
      eq(trafficCreativesTable.id, source.id),
      eq(trafficCreativesTable.businessId, businessId),
    )).limit(1))[0];
    sourceEligible = isRuntimeSourceEligible(source.type, row);
  } else if (source?.type === "campaign") {
    const row = (await db.select({ status: campaignsTable.status, publishStatus: campaignsTable.publishStatus }).from(campaignsTable).where(and(
      eq(campaignsTable.id, source.id),
      eq(campaignsTable.businessId, businessId),
    )).limit(1))[0];
    sourceEligible = isRuntimeSourceEligible(source.type, row);
  }
  if (source && sourceEligible) {
    override = (await db.select().from(salesStrategyOverridesTable).where(and(
      eq(salesStrategyOverridesTable.businessId, businessId),
      eq(salesStrategyOverridesTable.sourceType, source.type),
      eq(salesStrategyOverridesTable.sourceId, source.id),
      eq(salesStrategyOverridesTable.approved, true),
    )).limit(1))[0];
  }
  let strategy: SalesStrategyVersion | undefined;
  if (override?.strategyVersionId) {
    strategy = (await db.select().from(salesStrategyVersionsTable).where(and(
      eq(salesStrategyVersionsTable.businessId, businessId),
      eq(salesStrategyVersionsTable.id, override.strategyVersionId),
      inArray(salesStrategyVersionsTable.status, ["approved", "active", "archived"]),
    )).limit(1))[0];
  }
  strategy ??= (await db.select().from(salesStrategyVersionsTable).where(and(
    eq(salesStrategyVersionsTable.businessId, businessId),
    eq(salesStrategyVersionsTable.status, "active"),
  )).limit(1))[0];
  return { strategy: strategy ?? null, override: override ?? null, sourceEligible };
}

export function simulateSalesAction(config: SalesStrategyConfig, message: string, contactDeclined = false) {
  const q = message.toLocaleLowerCase("pt-AO");
  if (/\b(humano|pessoa|dono|responsável|responsavel)\b/.test(q)) return { intent: "human", stage: "handoff", action: "owner_handoff" };
  if (/\b(já paguei|paguei|encomenda|pedido|entrega)\b/.test(q)) return { intent: "post_sale", stage: "follow_up", action: "order_tracking" };
  if (/\b(comprar|quero avançar|vou levar)\b/.test(q) && config.availableActions.includes("checkout")) return { intent: "purchase", stage: "next_step", action: "checkout" };
  if (/\b(preço|preco|quanto custa|valor)\b/.test(q)) return { intent: "price", stage: "clarify", action: "answer" };
  if (/\b(caro|pensar|dúvida|duvida|mas)\b/.test(q)) return { intent: "objection", stage: "clarify", action: "answer" };
  const preferred = config.availableActions.find((item) => item !== "contact" || !contactDeclined) ?? "free_text";
  return { intent: "explore", stage: "understand", action: preferred };
}

export async function simulateSalesPreview(
  businessId: number,
  input: {
    message: string;
    contactDeclined?: boolean;
    config?: SalesStrategyConfig;
    strategyVersionId?: string;
    source?: { type: "campaign" | "traffic_creative"; id: string };
  },
) {
  if (input.source && !(await validSource(businessId, input.source.type, input.source.id))) {
    throw new Error("Origem não encontrada neste negócio");
  }
  const resolved = await resolveSalesStrategy(businessId, input.source);
  if (input.source && !resolved.sourceEligible) throw new Error("A origem já não está activa");
  let selected = resolved.strategy;
  if (input.strategyVersionId) {
    selected = (await db.select().from(salesStrategyVersionsTable).where(and(
      eq(salesStrategyVersionsTable.id, input.strategyVersionId),
      eq(salesStrategyVersionsTable.businessId, businessId),
    )).limit(1))[0] ?? null;
    if (!selected) throw new Error("Versão não encontrada neste negócio");
  }
  const baseConfig = input.config ?? selected?.config;
  if (!baseConfig) throw new Error("Configura ou selecciona uma estratégia");
  const profile = await getOrCreateProfile(businessId);
  const config = applySalesStrategyOverride(
    baseConfig,
    resolved.override?.config,
    (profile.offerings ?? []).map((offering) => offering.name),
  );
  const result = simulateSalesAction(config, input.message, input.contactDeclined);
  return {
    ...result,
    strategyVersionId: selected?.id ?? null,
    strategyName: selected?.name ?? "Rascunho ainda não guardado",
    sourceOverrideApplied: Boolean(resolved.override),
    effectiveObjective: config.objective,
    focusedOffer: config.focusedOffer ?? null,
    cta: config.sourceCta ?? null,
    expectedBehaviour: result.action === "appointment_request" || result.action === "visit_request"
      ? "Recolher a preferência sem confirmar reserva."
      : result.action === "checkout"
        ? "Confirmar produto e quantidade antes de iniciar pagamento."
        : result.action === "owner_handoff"
          ? "Registar o motivo e aguardar o dono sem prometer atribuição."
          : "Responder primeiro e fazer no máximo uma pergunta relevante.",
  };
}