import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { generateSalesDecision, interpretSalesConversation } from "../lib/openaiSales.js";
import { planSalesConversation, generatePlannedConversation, resolveConversationReference } from "../lib/salesConversationSkill.js";
import {
  db,
  leadsTable,
  ordersTable,
  type Lead,
  type LeadOrigin,
  type ChatMessage,
  type QualificationData,
  type LeadState,
  type TrafficWelcomeStatus,
  type LeadContactConsentStatus,
  type LeadCommercialMemory,
  salesOutcomeEventsTable,
  leadChatRequestsTable,
  resourceLibraryTable,
  resourceRequestsTable,
} from "@workspace/db";
import { eq, and, desc, isNull, lt, lte, gte, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { buildLeadChatContext, compactCommercialReply, selectLeadChatProducts, type LeadChatResource } from "../lib/leadChatContext.js";
import { getOrCreateProfile } from "./businessProfile.js";
import { sendPushToOwner } from "./notifications.js";
import {
  loadBusinessBrain,
  estimateGemini3FlashCostMicros,
  recordBusinessAiEvaluation,
  renderBusinessBrain,
  saveInteractionMemory,
  summarizeOldInteraction,
} from "./businessBrain.js";
import { commercialIntent, commercialQuestionAnswered, detectResourceRequest, finalizeCommercialSummary, isAffirmativeConfirmation, parseCommercialAmount, commercialMemoryPrompt, retryCommercialMemoryCas, updateCommercialMemory, type SalesNextAction } from "../lib/commercialSales.js";
import { ensureAutomaticStrategyVersion, deriveAutomaticStrategy, resolveSalesStrategy } from "./salesStrategy.js";
import { applySalesStrategyOverride, orderOfferingsForStrategy } from "../lib/salesStrategyRuntime.js";
import { sanitizeGroundedText, bindOfferingPrices } from "../lib/salesGrounding.js";
import {
  extractAngolanMobilePhone,
  isContactRefusal,
  normalizeAngolanMobilePhone,
  redactAngolanPhoneCandidates,
} from "../lib/visitorContact.js";
export {
  normalizeAngolanMobilePhone,
  redactAngolanPhoneCandidates,
} from "../lib/visitorContact.js";

const EXTRACTION_MODEL = "gemini-3-flash-preview";
const SCORE_QUALIFY_THRESHOLD = 60;
export const LEAD_CONTACT_PURPOSE = "business_follow_up";

export interface LeadContactView {
  status: LeadContactConsentStatus;
  phone: string | null;
  purpose: string | null;
  capturedAt: Date | null;
}

export interface WhatsAppHandoff {
  phone: string;
  url: string;
}

function contactWasRequested(lead: Lead): boolean {
  if (lead.contactConsentStatus !== "pending") return false;
  return lead.chatMessages.some((message) => message.role === "bot" && message.contactRequested === true);
}

function resourceUrl(resource: {
  kind: string;
  url: string | null;
  objectPath: string | null;
  content: string | null;
}): string {
  if (resource.url) return resource.url;
  if (resource.objectPath) return `/api/storage${resource.objectPath}`;
  if (resource.content) return `data:text/plain;charset=utf-8,${encodeURIComponent(resource.content)}`;
  return "";
}

function resourceText(resource: LeadChatResource): string {
  return `${resource.title} ${resource.description}`.toLocaleLowerCase("pt-AO");
}

function resourceMatchesRequest(resource: {
  kind: string;
  purpose: string;
  title: string;
  description: string;
}, request: ReturnType<typeof detectResourceRequest>): boolean {
  if (!request || resource.kind !== request.kind) return false;
  const subject = request.subject.toLocaleLowerCase("pt-AO");
  // Descriptive text is not an association. Legacy manually-associated
  // resources must match the complete subject or scoped purpose exactly.
  const purpose = resource.purpose.trim().toLocaleLowerCase("pt-AO");
  return subject !== "a oferta apresentada" && (
    purpose === subject || purpose === `visitor_chat:${request.kind}:${subject}`
  );
}

function trafficWelcomeSubject(lead: Lead): string {
  const description = lead.origin.trafficCreative?.description ?? "";
  const firstLine = description.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "este anúncio";
  return redactAngolanPhoneCandidates(firstLine.replace(/^[^A-Za-zÀ-ÿ0-9]+/u, "")).slice(0, 120);
}

async function findApprovedChatResources(
  businessId: number,
  request: ReturnType<typeof detectResourceRequest>,
  lead: Lead,
  offerings: Array<{ name: string; imageUrl?: string }>,
): Promise<LeadChatResource[]> {
  if (!request) return [];
  const contextualSubject = request.subject === "a oferta apresentada"
    ? lead.origin.trafficCreative
      ? `traffic_creative:${lead.origin.trafficCreative.id}`
      : lead.commercialMemory.interests.length === 1
        ? lead.commercialMemory.interests[0]!.value : request.subject
    : request.subject;
  request = { ...request, subject: contextualSubject };
  const now = new Date();
  const resources: LeadChatResource[] = [];
  const fulfilledRequests = await db.select({ id: resourceRequestsTable.id }).from(resourceRequestsTable).where(and(
    eq(resourceRequestsTable.businessId, businessId),
    eq(resourceRequestsTable.status, "fulfilled"),
    or(and(eq(resourceRequestsTable.source, `visitor_chat:${lead.id}`),
      eq(resourceRequestsTable.purpose, `visitor_chat:${request.kind}:${contextualSubject}`.slice(0, 200))),
      ...(lead.origin.trafficCreative && contextualSubject === `traffic_creative:${lead.origin.trafficCreative.id}`
        ? [eq(resourceRequestsTable.source, `traffic_creative:${lead.origin.trafficCreative.id}`)] : [])),
  ));
  const linkedPurposes = new Set(fulfilledRequests.map(item => `request:${item.id}`));
  const matchingLibrary = await db.select({
    id: resourceLibraryTable.id,
    title: resourceLibraryTable.title,
    kind: resourceLibraryTable.kind,
    description: resourceLibraryTable.description,
    url: resourceLibraryTable.url,
    objectPath: resourceLibraryTable.objectPath,
    content: resourceLibraryTable.content,
    purpose: resourceLibraryTable.purpose,
  }).from(resourceLibraryTable).where(and(
    eq(resourceLibraryTable.businessId, businessId),
    eq(resourceLibraryTable.status, "approved"),
    eq(resourceLibraryTable.visibility, "public"),
    or(isNull(resourceLibraryTable.validFrom), lte(resourceLibraryTable.validFrom, now)),
    or(isNull(resourceLibraryTable.validUntil), gte(resourceLibraryTable.validUntil, now)),
  )).limit(30);
  for (const resource of matchingLibrary) {
    if (resource.kind !== request.kind || (!linkedPurposes.has(resource.purpose) && !resourceMatchesRequest(resource, request))) continue;
    const url = resourceUrl(resource);
    if (!url) continue;
    resources.push({
      id: resource.id,
      title: resource.title,
      kind: request.kind,
      description: resource.description,
      url,
    });
  }
  const wantedOffering = offerings.find((offering) =>
    offering.name.toLocaleLowerCase("pt-AO") === request.subject.toLocaleLowerCase("pt-AO") && offering.imageUrl,
  );
  if (request.kind === "image" && wantedOffering?.imageUrl) {
    resources.unshift({
      id: `offering-image:${request.subject}`,
      title: `Imagem de ${request.subject}`,
      kind: "image",
      description: "Imagem aprovada no catálogo.",
      url: wantedOffering.imageUrl,
    });
  }
  const creative = lead.origin.trafficCreative;
  const asksForAdditionalMedia = /\bmais\b/i.test(request.request);
  if (!asksForAdditionalMedia && request.subject === `traffic_creative:${creative?.id}` && creative?.mediaUrl && ((request.kind === "image" && creative.mediaType === "image") || (request.kind === "video" && creative.mediaType === "video"))) {
    resources.unshift({
      id: `traffic-creative:${creative.id}`,
      title: "Mídia do anúncio",
      kind: request.kind,
      description: "Recurso aprovado no anúncio de origem.",
      url: creative.mediaUrl,
    });
  }
  const alreadyShown = new Set([
    ...(creative?.mediaUrl ? [creative.mediaUrl] : []),
    ...lead.chatMessages.flatMap(message => (message.resources ?? []).map(resource => resource.url)),
  ]);
  return resources.filter((resource, index, list) =>
    (!asksForAdditionalMedia || !alreadyShown.has(resource.url))
    && list.findIndex((item) => item.url === resource.url) === index).slice(0, 5);
}

async function registerVisitorResourceRequest(
  businessId: number,
  leadId: string,
  proposal: NonNullable<LeadCommercialMemory["pendingProposal"]>,
  summary: string,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<void> {
  const source = `visitor_chat:${leadId}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${source}:${proposal.purpose}`}, 0))`);
    const existing = await tx.select({ id: resourceRequestsTable.id })
      .from(resourceRequestsTable)
      .where(and(
        eq(resourceRequestsTable.businessId, businessId),
        eq(resourceRequestsTable.source, source),
        eq(resourceRequestsTable.purpose, proposal.purpose),
        sql`${resourceRequestsTable.status} IN ('open', 'fulfilled')`,
      )).limit(1);
    if (existing[0]) return;
    await tx.insert(resourceRequestsTable).values({
      businessId,
      kind: proposal.kind,
      purpose: proposal.purpose,
      request: summary.slice(0, 2000),
      source,
    });
    await tx.insert(salesOutcomeEventsTable).values({
      businessId,
      leadId,
      event: "handoff",
    });
}

export function leadContactView(lead: Pick<Lead, "contactConsentStatus" | "contactPhone" | "contactPurpose" | "contactCapturedAt">): LeadContactView {
  return {
    status: lead.contactConsentStatus,
    phone: lead.contactPhone,
    purpose: lead.contactPurpose,
    capturedAt: lead.contactCapturedAt,
  };
}

export function ownerLeadView(lead: Lead): Lead {
  const { phone: _legacyPhone, extras, ...qualificationData } = lead.qualificationData;
  const { paymentPhone: _paymentPhone, ...remainingExtras } = extras ?? {};
  const safeExtras = Object.fromEntries(
    Object.entries(remainingExtras).map(([key, value]) => [key, redactAngolanPhoneCandidates(value)]),
  );
  const hasSafeExtras = Object.keys(safeExtras).length > 0;
  const consented = lead.contactConsentStatus === "consented";
  const redactPrivateText = (value: string | null | undefined) =>
    !value ? value : redactAngolanPhoneCandidates(value);
  return {
    ...lead,
    contactPhone: consented ? lead.contactPhone : null,
    qualificationData: {
      ...qualificationData,
      name: redactPrivateText(qualificationData.name) ?? undefined,
      email: qualificationData.email,
      interest: redactPrivateText(qualificationData.interest) ?? undefined,
      budget: redactPrivateText(qualificationData.budget) ?? undefined,
      timeline: redactPrivateText(qualificationData.timeline) ?? undefined,
      location: redactPrivateText(qualificationData.location) ?? undefined,
      ...(hasSafeExtras ? { extras: safeExtras } : {}),
    },
    whatsappMessage: consented ? lead.whatsappMessage : null,
    aiSummary: redactPrivateText(lead.aiSummary) ?? null,
    callTranscript: redactPrivateText(lead.callTranscript) ?? null,
    chatMessages: lead.chatMessages.map((message) => ({
      ...message,
      text: redactAngolanPhoneCandidates(message.text),
    })),
  };
}

export function buildWhatsAppHandoff(
  publicBusinessPhone: string | null | undefined,
  businessName: string,
  creativeDescription?: string,
): WhatsAppHandoff | null {
  const phone = publicBusinessPhone ? normalizeAngolanMobilePhone(publicBusinessPhone) : null;
  if (!phone) return null;
  const context = creativeDescription?.trim()
    ? ` sobre o anúncio “${creativeDescription.trim().replace(/\s+/g, " ").slice(0, 80)}”`
    : "";
  const message = `Olá ${businessName || ""}, vim da Linkealls${context} e quero continuar o atendimento.`.replace(/\s+,/, ",");
  return {
    phone,
    url: `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(message)}`,
  };
}

export async function captureLeadContact(
  id: string,
  businessId: number,
  input: { action: "consent"; phone: string } | { action: "decline" },
): Promise<{ lead: Lead | null; changed: boolean }> {
  const current = await getLead(id, businessId);
  if (!current || !contactWasRequested(current)) return { lead: current, changed: false };
  const now = new Date();
  const values = input.action === "decline"
    ? {
      contactPhone: null,
      contactPurpose: LEAD_CONTACT_PURPOSE,
      contactConsentStatus: "declined" as const,
      contactConsentedAt: null,
      contactCapturedAt: now,
      qualificationData: sql`(${leadsTable.qualificationData} - 'phone') || jsonb_build_object('extras', COALESCE(${leadsTable.qualificationData}->'extras', '{}'::jsonb) - 'paymentPhone')`,
      updatedAt: now,
    }
    : {
      contactPhone: input.phone,
      contactPurpose: LEAD_CONTACT_PURPOSE,
      contactConsentStatus: "consented" as const,
      contactConsentedAt: now,
      contactCapturedAt: now,
      qualificationData: sql`(${leadsTable.qualificationData} - 'phone') || jsonb_build_object('extras', COALESCE(${leadsTable.qualificationData}->'extras', '{}'::jsonb) - 'paymentPhone')`,
      updatedAt: now,
    };
  const rows = await db.update(leadsTable)
    .set(values)
    .where(and(
      eq(leadsTable.id, id),
      eq(leadsTable.businessId, businessId),
      eq(leadsTable.contactConsentStatus, "pending"),
    ))
    .returning();
  if (rows[0]) return { lead: rows[0], changed: true };
  return { lead: await getLead(id, businessId), changed: false };
}

export async function recordLeadWhatsAppClick(id: string, businessId: number): Promise<boolean> {
  const now = new Date();
  const rows = await db.update(leadsTable)
    .set({
      whatsappClickedAt: now,
      whatsappClickCount: sql`${leadsTable.whatsappClickCount} + 1`,
      updatedAt: now,
    })
    .where(and(
      eq(leadsTable.id, id),
      eq(leadsTable.businessId, businessId),
      eq(leadsTable.contactConsentStatus, "consented"),
    ))
    .returning({ id: leadsTable.id });
  return Boolean(rows[0]);
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createLead(
  origin: LeadOrigin,
  chatMessages: ChatMessage[],
  businessId?: number,
  session?: {
    visitorRecoveryFamilyId?: string | null;
    visitorRecoveryExpiresAt?: Date | null;
    trafficWelcomeStatus?: TrafficWelcomeStatus | null;
  },
): Promise<Lead> {
  const inserted = await db
    .insert(leadsTable)
    .values({
      origin,
      chatMessages,
      ...(businessId !== undefined ? { businessId } : {}),
      ...(session ?? {}),
    })
    .returning();
  return inserted[0]!;
}

export async function createOrReuseTrafficLead(
  origin: LeadOrigin,
  chatMessages: ChatMessage[],
  businessId: number,
  trafficClickKey: string,
  recovery: { familyId: string; expiresAt: Date },
): Promise<Lead> {
  const retryWindowStart = new Date(Date.now() - 15_000);
  await db.update(leadsTable)
    .set({ trafficClickKey: null })
    .where(and(
      eq(leadsTable.businessId, businessId),
      eq(leadsTable.trafficClickKey, trafficClickKey),
      lt(leadsTable.createdAt, retryWindowStart),
    ));
  const inserted = await db.insert(leadsTable)
    .values({
      businessId,
      origin,
      chatMessages,
      trafficClickKey,
      visitorRecoveryFamilyId: recovery.familyId,
      visitorRecoveryExpiresAt: recovery.expiresAt,
      trafficWelcomeStatus: "pending",
    })
    .onConflictDoUpdate({
      target: [leadsTable.businessId, leadsTable.trafficClickKey],
      set: { trafficClickKey },
    })
    .returning();
  return inserted[0]!;
}

export async function claimTrafficWelcome(
  id: string,
  businessId: number,
  now = new Date(),
): Promise<string | null> {
  const staleBefore = new Date(now.getTime() - 60_000);
  const claimToken = randomUUID();
  const rows = await db.update(leadsTable)
    .set({
      trafficWelcomeStatus: "processing",
      trafficWelcomeClaimedAt: now,
      trafficWelcomeClaimToken: claimToken,
      updatedAt: now,
    })
    .where(and(
      eq(leadsTable.id, id),
      eq(leadsTable.businessId, businessId),
      sql`jsonb_array_length(${leadsTable.chatMessages}) = 0`,
      or(
        isNull(leadsTable.trafficWelcomeStatus),
        eq(leadsTable.trafficWelcomeStatus, "pending"),
        eq(leadsTable.trafficWelcomeStatus, "failed"),
        and(
          eq(leadsTable.trafficWelcomeStatus, "processing"),
          lt(leadsTable.trafficWelcomeClaimedAt, staleBefore),
        ),
      ),
    ))
    .returning({ id: leadsTable.id });
  return rows[0] ? claimToken : null;
}

export async function finishTrafficWelcome(
  id: string,
  businessId: number,
  claimToken: string,
  status: "complete" | "failed",
): Promise<void> {
  await db.update(leadsTable)
    .set({
      trafficWelcomeStatus: status,
      trafficWelcomeClaimedAt: null,
      trafficWelcomeClaimToken: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(leadsTable.id, id),
      eq(leadsTable.businessId, businessId),
      eq(leadsTable.trafficWelcomeClaimToken, claimToken),
    ));
}

export async function getLead(id: string, businessId?: number): Promise<Lead | null> {
  const rows = await db
    .select()
    .from(leadsTable)
    .where(
      businessId !== undefined
        ? and(eq(leadsTable.id, id), eq(leadsTable.businessId, businessId))
        : eq(leadsTable.id, id),
    );
  return rows[0] ?? null;
}

export async function listLeads(businessId?: number): Promise<Lead[]> {
  if (businessId !== undefined) {
    return db.select().from(leadsTable)
      .where(eq(leadsTable.businessId, businessId))
      .orderBy(desc(leadsTable.createdAt));
  }
  return db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt));
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface LeadSourceRow {
  source: string;
  campaign: string | null;
  total: number;
  qualified: number;
  rate: number;
}

export interface LeadsAnalytics {
  bySource: LeadSourceRow[];
  total: number;
  totalQualified: number;
  overallRate: number;
}

export async function getLeadsAnalytics(businessId?: number): Promise<LeadsAnalytics> {
  // Aggregate by utm_source + utm_campaign using Postgres JSONB extraction
  const whereClause = businessId !== undefined
    ? sql`WHERE business_id = ${businessId}`
    : sql``;
  const rows = await db.execute(sql`
    SELECT
      COALESCE(origin->>'utm_source', 'direto') AS source,
      origin->>'utm_campaign' AS campaign,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE state IN ('qualificado','entregue'))::int AS qualified
    FROM leads
    ${whereClause}
    GROUP BY 1, 2
    ORDER BY total DESC
    LIMIT 50
  `);

  const bySource: LeadSourceRow[] = (rows.rows as Array<{
    source: string;
    campaign: string | null;
    total: string;
    qualified: string;
  }>).map((r) => ({
    source: r.source,
    campaign: r.campaign ?? null,
    total: Number(r.total),
    qualified: Number(r.qualified),
    rate: Number(r.total) > 0 ? Math.round((Number(r.qualified) / Number(r.total)) * 100) : 0,
  }));

  const total = bySource.reduce((s, r) => s + r.total, 0);
  const totalQualified = bySource.reduce((s, r) => s + r.qualified, 0);
  return {
    bySource,
    total,
    totalQualified,
    overallRate: total > 0 ? Math.round((totalQualified / total) * 100) : 0,
  };
}

export async function updateLeadState(id: string, state: LeadState, businessId?: number): Promise<Lead | null> {
  const updated = await db
    .update(leadsTable)
    .set({
      state,
      commercialMemory: sql`jsonb_set(${leadsTable.commercialMemory}, '{revision}', to_jsonb(COALESCE((${leadsTable.commercialMemory}->>'revision')::int, 0) + 1))`,
      updatedAt: new Date(),
    })
    .where(
      businessId !== undefined
        ? and(eq(leadsTable.id, id), eq(leadsTable.businessId, businessId))
        : eq(leadsTable.id, id),
    )
    .returning();
  return updated[0] ?? null;
}

export async function updateLeadOnCallStart(id: string, businessId: number): Promise<void> {
  await db
    .update(leadsTable)
    .set({ state: "em_atendimento", updatedAt: new Date() })
    .where(and(eq(leadsTable.id, id), eq(leadsTable.businessId, businessId)));
}

// ─── Post-call AI extraction ──────────────────────────────────────────────────

interface ExtractionResult {
  qualificationData: QualificationData;
  aiSummary: string;
  score: number;
  whatsappMessage: string;
}

function clampStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function parseExtractionResult(raw: unknown): ExtractionResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const qd = (r["qualificationData"] ?? {}) as Record<string, unknown>;
  const extras = (qd["extras"] ?? {}) as Record<string, unknown>;

  const qualificationData: QualificationData = {
    name:     clampStr(qd["name"], 200) || undefined,
    email:    clampStr(qd["email"], 200) || undefined,
    interest: clampStr(qd["interest"], 1000) || undefined,
    budget:   clampStr(qd["budget"], 200) || undefined,
    timeline: clampStr(qd["timeline"], 200) || undefined,
    location: clampStr(qd["location"], 200) || undefined,
    extras:   Object.fromEntries(
      Object.entries(extras)
        .slice(0, 20)
        .map(([k, v]) => [k.slice(0, 100), clampStr(v, 500)])
    ),
  };

  const rawScore = typeof r["score"] === "number" ? r["score"] : 0;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  const summary = clampStr(r["aiSummary"], 2000);

  return {
    qualificationData,
    aiSummary: summary,
    score,
    whatsappMessage: "",
  };
}

/**
 * Runs after a call ends: feeds the transcript to Gemini Flash for structured
 * extraction, updates the lead row, and notifies the SSE bus if qualified.
 */
export async function processCallCompletion(
  leadId: string,
  callTranscript: string,
  businessName: string,
  businessId: number,
): Promise<void> {
  const startedAt = Date.now();
  const apiKey = process.env["GEMINI_API_KEY"];

  // Scoped fetch — a lead belonging to another business is treated as not found.
  let lead = await getLead(leadId, businessId);
  if (!lead) {
    logger.warn({ leadId, businessId }, "Lead not found for post-call extraction (or belongs to another business)");
    return;
  }
  const initialLead = lead;
  const safeTranscript = redactAngolanPhoneCandidates(callTranscript);
  // Lifecycle is independent of extraction/provider availability and revision CAS.
  await db.update(leadsTable).set({
    callTranscript: safeTranscript.slice(0, 50_000), callEndedAt: new Date(), updatedAt: new Date(),
  }).where(and(eq(leadsTable.id, leadId), eq(leadsTable.businessId, businessId)));
  if (!apiKey) {
    logger.error("GEMINI_API_KEY not set — call saved without qualification extraction");
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Analisa esta transcrição de uma chamada de qualificação de leads e extrai informação estruturada.

TRANSCRIÇÃO:
${safeTranscript || "(sem transcrição disponível)"}

Devolve um JSON com:
- qualificationData: { name, email, interest, budget, timeline, location, extras }
  - name: nome do potencial cliente (se mencionado)
  - email: email (se mencionado)
  - interest: resumo do interesse/necessidade em 1-2 frases
  - budget: orçamento ou faixa de preço mencionada
  - timeline: prazo de decisão ou urgência
  - location: localização ou área geográfica (se relevante)
  - extras: outros dados relevantes como pares chave-valor
- aiSummary: resumo da conversa em 2-4 parágrafos, do ponto de vista do agente comercial
- score: pontuação de 0-100 baseada na qualidade do lead:
  * 0-39: baixa qualidade (não deu informação, desinteressado)
  * 40-59: médio (interesse mas sem orçamento ou prazo)
  * 60-79: bom (interesse claro + orçamento, prazo ou email)
  * 80-100: excelente (dados completos, orçamento definido, decisão próxima)

Responde APENAS com JSON válido, sem texto adicional.`;

    const response = await ai.models.generateContent({
      model: EXTRACTION_MODEL,
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const text = response.text ?? "";
    const raw = JSON.parse(text) as unknown;
    const extracted = parseExtractionResult(raw);

    let persisted: Lead | null = null;
    let newlyQualified = false;
    for (let attempt = 0; attempt < 4 && !persisted; attempt++) {
      const current = await getLead(leadId, businessId);
      if (!current) throw new Error("Lead removido durante a extracção");
      const memory = structuredClone(current.commercialMemory);
      const corrected = new Set(memory.ownerCorrectedFields ?? []);
      const qualificationData = { ...current.qualificationData };
      const protectedMemoryField: Record<string, string> = { interest: "interests", budget: "criteria", timeline: "constraints" };
      for (const field of ["name", "email", "interest", "budget", "timeline", "location"] as const) {
        const value = extracted.qualificationData[field];
        const changedDuringExtraction = current.qualificationData[field] !== initialLead.qualificationData[field];
        if (value && !changedDuringExtraction && !corrected.has("qualificationData") && !corrected.has(field)
          && !corrected.has(protectedMemoryField[field] ?? field)) qualificationData[field] = value;
      }
      if (!corrected.has("qualificationData") && !corrected.has("extras")) {
        qualificationData.extras = { ...extracted.qualificationData.extras, ...current.qualificationData.extras };
      }
      for (const [field, label, value, concept] of [
        ["interests", "Interesse da chamada", qualificationData.interest, "necessidade"],
        ["criteria", "Orçamento", qualificationData.budget, "orçamento"],
        ["constraints", "Prazo", qualificationData.timeline, "prazo"],
      ] as const) {
        if (!value || corrected.has(field)) continue;
        const observation = `${label}: ${value}`;
        if (!memory[field].some(item => item.value === observation)) {
          memory[field] = [...memory[field], { value: observation, provenance: "inferred" as const, updatedAt: new Date().toISOString() }].slice(-15);
        }
        if (!corrected.has("answeredQuestions")) memory.answeredQuestions = [...new Set([...memory.answeredQuestions, concept])];
      }
      if (!corrected.has("missingData")) memory.missingData = memory.missingData.filter(question =>
        !commercialQuestionAnswered(question, memory.answeredQuestions));
      const ownerAuthoritative = ["perdido", "entregue"].includes(current.state) || memory.humanControl === "owner";
      const supportedScore = qualificationData.interest && (qualificationData.budget || qualificationData.timeline || qualificationData.email)
        ? extracted.score : Math.min(extracted.score, 59);
      const score = ownerAuthoritative || corrected.has("score") ? current.score : Math.max(current.score ?? 0, supportedScore);
      const newState: LeadState = ownerAuthoritative || corrected.has("state") ? current.state
        : (score ?? 0) >= SCORE_QUALIFY_THRESHOLD ? "qualificado" : current.state;
      const aiSummary = corrected.has("factualSummary") || corrected.has("aiSummary") ? current.aiSummary
        : [...new Set([memory.factualSummary || current.aiSummary, extracted.aiSummary].filter(Boolean))].join("\n\n").slice(0, 4000);
      memory.revision += 1;
      const rows = await db.update(leadsTable).set({
        qualificationData, aiSummary, score, state: newState, commercialMemory: memory, updatedAt: new Date(),
      }).where(and(eq(leadsTable.id, leadId), eq(leadsTable.businessId, businessId),
        sql`${leadsTable.commercialMemory}->>'revision' = ${String(current.commercialMemory.revision)}`)).returning();
      if (rows[0]) {
        persisted = rows[0];
        newlyQualified = current.state !== "qualificado" && newState === "qualificado";
      }
    }
    if (!persisted) throw new Error("A qualificação não foi persistida após conflitos concorrentes");
    lead = persisted;

    await saveInteractionMemory(
      businessId,
      leadId,
      [
        "Chamada anterior concluída.",
        extracted.qualificationData.interest ? "Interesse comercial registado." : "",
        extracted.qualificationData.budget ? "Orçamento discutido." : "",
        extracted.qualificationData.timeline ? "Prazo discutido." : "",
      ].filter(Boolean).join(" "),
      {
        source: "ai",
        sourceRef: "post_call_summary",
        reviewedAt: new Date().toISOString(),
      },
    ).catch((err) => logger.warn({ err, leadId, businessId }, "Failed to save post-call memory"));
    void recordBusinessAiEvaluation({
      businessId,
      channel: "post_call",
      scenario: "qualification_extraction",
      outcome: "success",
      latencyMs: Date.now() - startedAt,
      inputForHash: safeTranscript,
      outputForEvaluation: extracted.aiSummary,
      costMicros: estimateGemini3FlashCostMicros(response),
    }).catch((err) => logger.warn({ err, businessId }, "Failed to record post-call evaluation"));

    logger.info({ leadId, score: persisted.score, state: persisted.state }, "Lead extraction complete");

    // Notify SSE subscribers and push when newly qualified
    if (newlyQualified) {
      notifyLeadQualified(leadId);
      if (lead.businessId !== null) {
        const businessId = lead.businessId;
        const name = extracted.qualificationData.name;
        const interest = extracted.qualificationData.interest;
        void (async () => {
          const profile = await getOrCreateProfile(businessId);
          await sendPushToOwner({
            title: "🔔 Lead qualificado!",
            body: name
              ? `${name}${interest ? ` — ${interest.slice(0, 80)}` : ""}`
              : `Score ${extracted.score}/100 — Novo lead qualificado.`,
            tag: `lead-${leadId}`,
            url: profile.slug ? `/e/${profile.slug}/dono/conversas` : "/",
          }, businessId);
        })().catch((err) => logger.error({ err, leadId }, "Push on lead qualified failed"));
      }
    }
  } catch (err) {
    logger.error({ err, leadId, businessId }, "Post-call lead extraction failed");
    void recordBusinessAiEvaluation({
      businessId,
      channel: "post_call",
      scenario: "qualification_extraction",
      outcome: "error",
      latencyMs: Date.now() - startedAt,
      inputForHash: callTranscript,
    }).catch((evaluationErr) =>
      logger.warn({ err: evaluationErr, businessId }, "Failed to record post-call error evaluation")
    );
    // Don't leave the lead in limbo — mark call ended even without extraction
    await db
      .update(leadsTable)
      .set({ callEndedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.businessId, businessId)));
  }
}

// ─── Visitor text chat (Gemini-powered) ──────────────────────────────────────

/**
 * Handles a text message from a visitor after the call flow has started.
 * Uses the business profile + full lead context to generate a Gemini reply,
 * then persists both messages to the lead's chatMessages.
 */
export async function chatWithLead(
  leadId: string,
  userMessage: string,
  businessId: number,
  options?: { trafficWelcomeClaimToken?: string; requestContactConsent?: boolean; requestId?: string },
): Promise<{
  reply: string;
  products: Array<{ name: string; price: string; description: string; imageUrl?: string }>;
  resources: Array<{ id: string; title: string; kind: string; description: string; url: string }>;
  nextAction: SalesNextAction;
  contactCaptured: boolean;
}> {
  const startedAt = Date.now();
  let lead = await getLead(leadId, businessId);
  if (!lead) throw new Error("Lead não encontrado");
  if (options?.requestId) {
    const replayTurn = [...lead.chatMessages].reverse().find((message) =>
      message.role === "bot" && message.requestId === options.requestId && message.replay,
    );
    if (replayTurn?.replay) {
      return {
        reply: replayTurn.text,
        products: replayTurn.replay.products,
        resources: replayTurn.replay.resources ?? replayTurn.resources ?? [],
        nextAction: replayTurn.replay.nextAction as SalesNextAction,
        contactCaptured: replayTurn.replay.contactCaptured ?? false,
      };
    }
    const completed = (await db.select({ response: leadChatRequestsTable.response })
      .from(leadChatRequestsTable)
      .where(and(
        eq(leadChatRequestsTable.id, options.requestId),
        eq(leadChatRequestsTable.businessId, businessId),
        eq(leadChatRequestsTable.leadId, leadId),
        eq(leadChatRequestsTable.status, "complete"),
      )).limit(1))[0]?.response;
    if (completed) return {
      ...completed,
      resources: completed.resources ?? [],
      nextAction: completed.nextAction as SalesNextAction,
      contactCaptured: completed.contactCaptured ?? false,
    };
  }
  if (lead.commercialMemory.humanControl === "owner") {
    throw new Error("O dono está a atender esta conversa");
  }
  const requestedContact = contactWasRequested(lead);
  const refusedContact = requestedContact && isContactRefusal(userMessage);
  const extractedPhone = requestedContact && !refusedContact ? extractAngolanMobilePhone(userMessage) : null;
  const contactCaptured = Boolean(extractedPhone);
  const contactDeclined = refusedContact;
  if (options?.requestId) {
    await db.delete(leadChatRequestsTable).where(and(
      eq(leadChatRequestsTable.businessId, businessId),
      eq(leadChatRequestsTable.leadId, leadId),
      eq(leadChatRequestsTable.memoryRevision, lead.commercialMemory.revision),
      eq(leadChatRequestsTable.status, "processing"),
      lt(leadChatRequestsTable.updatedAt, new Date(Date.now() - 2 * 60_000)),
    ));
    const claimed = await db.insert(leadChatRequestsTable).values({
      id: options.requestId,
      businessId,
      leadId,
      memoryRevision: lead.commercialMemory.revision,
    }).onConflictDoNothing().returning({ id: leadChatRequestsTable.id });
    if (!claimed[0]) throw new Error("Esta mensagem já está a ser processada");
  }
  const contactNow = new Date();
  const contactMutation = extractedPhone
    ? {
      contactPhone: extractedPhone,
      contactPurpose: LEAD_CONTACT_PURPOSE,
      contactConsentStatus: "consented" as const,
      contactConsentedAt: contactNow,
      contactCapturedAt: contactNow,
      qualificationData: sql`(${leadsTable.qualificationData} - 'phone') || jsonb_build_object('extras', COALESCE(${leadsTable.qualificationData}->'extras', '{}'::jsonb) - 'paymentPhone')`,
    }
    : refusedContact
      ? {
        contactPhone: null,
        contactPurpose: LEAD_CONTACT_PURPOSE,
        contactConsentStatus: "declined" as const,
        contactConsentedAt: null,
        contactCapturedAt: contactNow,
        qualificationData: sql`(${leadsTable.qualificationData} - 'phone') || jsonb_build_object('extras', COALESCE(${leadsTable.qualificationData}->'extras', '{}'::jsonb) - 'paymentPhone')`,
      }
      : {};
  if (extractedPhone) lead = { ...lead, contactPhone: extractedPhone, contactPurpose: LEAD_CONTACT_PURPOSE, contactConsentStatus: "consented", contactConsentedAt: contactNow, contactCapturedAt: contactNow };
  if (refusedContact) lead = { ...lead, contactPhone: null, contactPurpose: LEAD_CONTACT_PURPOSE, contactConsentStatus: "declined", contactConsentedAt: null, contactCapturedAt: contactNow };
  // Contact consent is a separate channel fact. Keep the commercial sentence,
  // only redact phone candidates before it reaches the model or durable chat.
  const safeUserMessage = redactAngolanPhoneCandidates(userMessage);
  const brain = await loadBusinessBrain(businessId, { leadId, query: safeUserMessage });
  const profile = brain.profile;
  const offeringNames = (profile.offerings ?? []).map((offering) => offering.name);
  const previousBot = [...lead.chatMessages].reverse().find(message => message.role === "bot");
  const referencedCandidates = previousBot?.replay?.products?.length
    ? previousBot.replay.products.map(product => product.name)
    : lead.commercialMemory.interests.map(item => item.value);
  const originalUserMessage = userMessage;
  const previousMediaKinds = [...new Set((previousBot?.resources ?? []).map(resource => resource.kind))];
  const referencedMediaKind = previousMediaKinds.length === 1 && ["image", "video"].includes(previousMediaKinds[0]!)
    ? previousMediaKinds[0] as "image" | "video"
    : /fotos|imagens/i.test(previousBot?.text ?? "") && !/vídeo|video/i.test(previousBot?.text ?? "") ? "image"
      : /vídeo|video/i.test(previousBot?.text ?? "") && !/fotos|imagens/i.test(previousBot?.text ?? "") ? "video" : undefined;
  userMessage = resolveConversationReference(userMessage, referencedCandidates, offeringNames, referencedMediaKind);
  if (/^(?:quero|pretendo|vou) comprar[.! ]*$/i.test(userMessage.trim()) && referencedCandidates.length === 1 && offeringNames.includes(referencedCandidates[0]!)) {
    userMessage = `Quero comprar ${referencedCandidates[0]}`;
  }
  const currentIntent = commercialIntent(userMessage, offeringNames);
  const isTrafficWelcome = Boolean(options?.trafficWelcomeClaimToken && lead.origin.trafficCreative);
  const isInterestOnly = /^interessante\b[.! ]*$/i.test(safeUserMessage.trim());
  const isTrafficDiscovery = isTrafficWelcome || isInterestOnly;
  const detectedResource = detectResourceRequest(userMessage, offeringNames);
  if (detectedResource?.subject === "a oferta apresentada") {
    detectedResource.subject = lead.origin.trafficCreative ? `traffic_creative:${lead.origin.trafficCreative.id}`
      : referencedCandidates.length === 1 ? referencedCandidates[0]! : detectedResource.subject;
    detectedResource.purpose = `visitor_chat:${detectedResource.kind}:${detectedResource.subject}`.slice(0, 200);
  }
  const requestedResource = !isTrafficWelcome && detectedResource?.kind !== "text" ? detectedResource : null;
  const resourceLookups = requestedResource
    ? [requestedResource]
    : isTrafficDiscovery
      ? [
        detectResourceRequest("Quero ver fotos desta oferta", offeringNames)!,
        detectResourceRequest("Quero ver o vídeo desta oferta", offeringNames)!,
      ]
      : [];
  const resourceResults = await Promise.all(resourceLookups.map((request) =>
    findApprovedChatResources(
      businessId,
      request,
      lead,
      (profile.offerings ?? []).map((offering) => ({ name: offering.name, imageUrl: offering.imageUrl })),
    ),
  ));
  const approvedResources = resourceResults.flat().filter((resource, index, list) =>
    list.findIndex((item) => item.url === resource.url) === index,
  ).slice(0, 5);

  const relatedOrders = await db
    .select({
      id: ordersTable.id,
      offeringName: ordersTable.offeringName,
      amount: ordersTable.amount,
      status: ordersTable.status,
      fulfillmentStatus: ordersTable.fulfillmentStatus,
      proofStatus: ordersTable.proofStatus,
      paidAt: ordersTable.paidAt,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.leadId, leadId), eq(ordersTable.businessId, businessId)))
    .orderBy(desc(ordersTable.createdAt))
    .limit(5);
  const safeLead = ownerLeadView(lead);
  const updatedMemory = updateCommercialMemory(
    lead.commercialMemory,
    redactAngolanPhoneCandidates(userMessage),
    (profile.offerings ?? []).map((offering) => offering.name),
  );
  const pendingProposal = lead.commercialMemory.pendingProposal;
  const lastBotMessage = [...lead.chatMessages].reverse().find(message => message.role === "bot")?.text ?? "";
  const confirmsPendingProposal = Boolean(
    pendingProposal
    && pendingProposal.type === "resource_request"
    && Date.now() - Date.parse(pendingProposal.createdAt) < 24 * 60 * 60 * 1000
    && /(?:regist|encaminh).*(?:pedido|equipa)|pedido.*(?:regist|equipa)/i.test(lastBotMessage)
    && isAffirmativeConfirmation(userMessage),
  );
  let resourceRequestRegistered = false;
  let resourceRequestSummary = "";
  if (confirmsPendingProposal && pendingProposal) {
    const criteria = [
      ...updatedMemory.criteria.map((item) => item.value),
      ...updatedMemory.constraints.map((item) => item.value),
    ].slice(0, 6);
    const summary = [
      `Pedido do visitante: ${redactAngolanPhoneCandidates(pendingProposal.request)}`,
      `Oferta/assunto: ${pendingProposal.subject}.`,
      criteria.length ? `Critérios conhecidos: ${criteria.join("; ")}.` : "",
      "Próximo passo: a equipa deve rever o pedido e responder nesta conversa.",
    ].filter(Boolean).join(" ");
    resourceRequestSummary = summary;
    resourceRequestRegistered = true;
    updatedMemory.pendingProposal = undefined;
    updatedMemory.pendingAction = "owner_handoff";
    updatedMemory.stage = "handoff";
    updatedMemory.escalationReason = `Pedido de ${pendingProposal.kind} sobre ${pendingProposal.subject}`;
  } else if (requestedResource && approvedResources.length === 0) {
    updatedMemory.pendingProposal = {
      ...requestedResource,
      request: redactAngolanPhoneCandidates(requestedResource.request),
      createdAt: new Date().toISOString(),
    };
  } else if (requestedResource && approvedResources.length > 0) {
    updatedMemory.pendingProposal = undefined;
  }
  const trustedCreativeId = lead.origin.trafficCreative?.id;
  const trustedCampaignId = lead.origin.trustedCampaign?.id;
  await ensureAutomaticStrategyVersion(businessId, profile);
  const resolvedStrategy = await resolveSalesStrategy(
    businessId,
    trustedCreativeId
      ? { type: "traffic_creative", id: trustedCreativeId }
      : trustedCampaignId
        ? { type: "campaign", id: trustedCampaignId }
        : undefined,
  );
  const strategyConfig = resolvedStrategy.strategy
    ? applySalesStrategyOverride(
      resolvedStrategy.strategy.config,
      resolvedStrategy.override?.config,
      (profile.offerings ?? []).map((offering) => offering.name),
    )
    : deriveAutomaticStrategy(profile);
  if (trustedCreativeId && !resolvedStrategy.sourceEligible) {
    approvedResources.splice(0);
    safeLead.origin = { ...safeLead.origin, trafficCreative: undefined };
  }
  updatedMemory.strategyVersionId = resolvedStrategy.strategy?.id;
  if (strategyConfig) {
    if (!updatedMemory.ownerCorrectedFields?.includes("missingData")) {
      updatedMemory.missingData = strategyConfig.essentialQuestions.filter((question) =>
        !commercialQuestionAnswered(question, updatedMemory.answeredQuestions),
      ).slice(0, 5);
    }
  }
  const strategyText = strategyConfig ? [
    `Objectivo: ${strategyConfig.objective}`,
    `Público: ${strategyConfig.audience || "não definido"}`,
    `Ofertas prioritárias: ${strategyConfig.priorityOffers.join(", ") || "não definidas"}`,
    `Perguntas essenciais: ${strategyConfig.essentialQuestions.join("; ") || "nenhuma"}`,
    `Diferenciais comprovados: ${strategyConfig.verifiedDifferentials.join("; ") || "nenhum"}`,
    `Respostas aprovadas a objecções: ${strategyConfig.objectionResponses.map((item) => `${item.objection}: ${item.response}`).join("; ") || "nenhuma"}`,
    `Limites: ${strategyConfig.negotiationLimits.join("; ")}`,
    `Encaminhar quando: ${strategyConfig.escalationRules.join("; ")}`,
    `Acções disponíveis: ${strategyConfig.availableActions.join(", ")}`,
    strategyConfig.focusedOffer ? `Oferta focada validada no catálogo: ${strategyConfig.focusedOffer}` : "",
    strategyConfig.expectedIntent ? `Intenção esperada da origem (não sobrepor declaração explícita): ${strategyConfig.expectedIntent}` : "",
    strategyConfig.sourceCta ? `Texto da CTA aprovada: ${strategyConfig.sourceCta}` : "",
  ].filter(Boolean).join("\n") : undefined;
  const shouldRequestContact = (
    lead.contactConsentStatus === "pending"
    && !requestedContact
    && !extractedPhone
    && !refusedContact
    && Boolean(profile.phone)
    && (
      (currentIntent === "human" && /whatsapp|deixar.*contacto/i.test(userMessage)
        && strategyConfig.availableActions.includes("contact"))
    )
  );
  const contactRequestPrompt = "Para continuarmos no WhatsApp, envia o teu número ou diz “Agora não”.";
  // Events describe observed visitor requests, not completed bookings or inferred abandonment.
  const recordTurnOutcome = (products: unknown[]) => {
    const intent = currentIntent;
    const event = resourceRequestRegistered ? "handoff"
      : contactDeclined ? "cta_declined" : contactCaptured ? "cta_accepted"
      : shouldRequestContact ? "contact_requested"
      : intent === "quote" ? "quote_requested"
      : intent === "visit" ? "visit_requested"
      : intent === "appointment" ? "appointment_requested"
      : intent === "human" ? "handoff"
      : options?.trafficWelcomeClaimToken ? "welcome"
      : products.length ? "recommendation" : "continuation";
    void db.insert(salesOutcomeEventsTable).values({
      businessId, leadId, strategyVersionId: resolvedStrategy.strategy?.id,
      sourceType: trustedCreativeId ? "traffic_creative" : trustedCampaignId ? "campaign" : undefined,
      sourceId: trustedCreativeId ?? trustedCampaignId, event,
    }).catch((err) => logger.warn({ err, businessId, leadId }, "Failed to record privacy-safe sales event"));
  };
  const withContactRequest = (text: string): string => {
    if (!shouldRequestContact) return text;
    const firstSentence = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0]
      || "A equipa pode continuar contigo.";
    return `${firstSentence.slice(0, 220).replace(/[.!?]?$/, ".")} ${contactRequestPrompt}`;
  };
  const buildCurrentContext = () => buildLeadChatContext(
    safeLead,
    profile,
    relatedOrders,
    safeUserMessage,
    renderBusinessBrain(brain, "visitor"),
    {
      strategyName: resolvedStrategy.strategy?.name,
      strategyVersionId: resolvedStrategy.strategy?.id,
      strategyText,
      campaignText: resolvedStrategy.override?.config
        ? JSON.stringify(resolvedStrategy.override.config).slice(0, 2000)
        : undefined,
      memoryText: commercialMemoryPrompt(updatedMemory),
      resourcesText: approvedResources.length
        ? approvedResources.map((resource) => `- ${resource.title}: ${resource.description} (${resource.kind})`).join("\n")
        : undefined,
    },
  );
  let { systemInstruction, prompt } = buildCurrentContext();

  const interpretation = await interpretSalesConversation(
    `${commercialMemoryPrompt(updatedMemory)}\n${prompt}`, safeUserMessage,
  );
  const mentionedOrders = relatedOrders.filter(order => userMessage.toLowerCase().includes(order.offeringName.toLowerCase()));
  const discussedOrder = mentionedOrders.length === 1 ? mentionedOrders[0]
    : mentionedOrders.length === 0 && relatedOrders.length === 1 ? relatedOrders[0] : undefined;
  const selectedOfferings = (profile.offerings ?? []).filter(offering => userMessage.toLowerCase().includes(offering.name.toLowerCase()));
  const knownPriceReply = currentIntent === "price" && selectedOfferings.length === 1
    ? `${selectedOfferings[0]!.name}: ${selectedOfferings[0]!.price}.` : null;
  const buildCurrentPlan = () => planSalesConversation({
    message: userMessage, memory: updatedMemory, interpretation, strategy: strategyConfig,
    contactStatus: lead.contactConsentStatus, offerings: offeringNames,
    hasCatalog: Boolean(profile.catalogEnabled && profile.offerings?.length), hasWhatsApp: Boolean(profile.phone),
    paid: discussedOrder?.status === "paga", pending: discussedOrder?.status === "pendente",
    welcome: isTrafficWelcome, resourceCount: approvedResources.length, resourceRequested: Boolean(requestedResource),
    requestRegistered: resourceRequestRegistered,
  });
  let conversationPlan = buildCurrentPlan();
  updatedMemory.salesDecision = conversationPlan.decision;
  if (originalUserMessage !== userMessage) {
    updatedMemory.salesDecision.evidence.push(
      `Referência declarada: ${safeUserMessage}`,
      `Candidato validado no catálogo: ${referencedCandidates[0]}`,
      `Fonte: ${previousBot?.ts ? `bot:${previousBot.ts}` : `commercialMemory:revision:${lead.commercialMemory.revision}`}`,
    );
  }
  for (const [value, label, field, concept] of [
    [conversationPlan.decision.need, "Necessidade", "criteria", "necessidade"],
    [conversationPlan.decision.urgency, "Prazo", "constraints", "prazo"],
  ] as const) {
    if (!value || updatedMemory.ownerCorrectedFields?.includes(field)) continue;
    updatedMemory[field] = [
      ...updatedMemory[field].filter(item => !item.value.startsWith(`${label}:`)),
      { value: `${label}: ${value}`, provenance: "declared" as const, updatedAt: new Date().toISOString() },
    ].slice(-15);
    if (!updatedMemory.ownerCorrectedFields?.includes("answeredQuestions")) {
      updatedMemory.answeredQuestions = [...new Set([...updatedMemory.answeredQuestions, concept])];
    }
  }
  if (!updatedMemory.ownerCorrectedFields?.includes("missingData")) {
    updatedMemory.missingData = strategyConfig.essentialQuestions.filter(question =>
      !commercialQuestionAnswered(question, updatedMemory.answeredQuestions),
    ).slice(0, 5);
  }
  const turnEvidence = updatedMemory.salesDecision.evidence;
  conversationPlan = buildCurrentPlan();
  updatedMemory.salesDecision = conversationPlan.decision;
  updatedMemory.salesDecision.evidence = [...new Set([...updatedMemory.salesDecision.evidence, ...turnEvidence])];
  ({ systemInstruction, prompt } = buildCurrentContext());
  const rendered = await generatePlannedConversation(conversationPlan, (instructions) => generateSalesDecision(
    `${systemInstruction}\n${instructions}`,
    `${prompt}

Devolve apenas o objecto estruturado pedido. A resposta deve soar como alguém da equipa de ${profile.name || "este negócio"}, não como a Linkealls. Usa apenas ofertas e factos presentes no contexto. Não menciones um número de telefone, fotos, vídeos ou uma acção do proprietário sem confirmação no contexto.`,
  ), () => ({
    decision: {
      reply: knownPriceReply ?? (resourceRequestRegistered ? "O pedido ficou registado para revisão pela equipa."
        : approvedResources.length ? "Podes abrir os materiais abaixo."
          : requestedResource ? "Não tenho esse material disponível aqui. Queres que registe um pedido para a equipa?"
            : conversationPlan.nextAction.type !== "none" ? `Podes usar a opção «${conversationPlan.nextAction.label}» abaixo.`
              : conversationPlan.decision.action === "qualify_need" ? "O que procuras resolver com esta opção?"
                : "Não consegui preparar a resposta neste momento. Podes tentar novamente?"),
      intent: "information" as const, recommendedOfferings: [], nextQuestion: null,
      handoffReason: null, proposedAction: "none" as const,
    },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  }));
  const generation = rendered.value;
  if (rendered.failed && updatedMemory.salesDecision.outcome === "response_planned") updatedMemory.salesDecision.outcome = "generation_failed";
  const decision = generation.decision;

  const groundingFacts = {
    approvedPrices: [
      ...(selectedOfferings.length ? selectedOfferings : profile.offerings ?? []).map((offering) => offering.price),
      ...(safeLead.origin.trafficCreative?.preparation?.approvedPrices ?? []),
    ],
    approvedPhones: lead.contactConsentStatus === "consented" && profile.phone ? [profile.phone] : [],
    approvedAvailability: relatedOrders.map((order) => `${order.status} ${order.fulfillmentStatus}`),
  };
  const groundedReply = sanitizeGroundedText(bindOfferingPrices(decision.reply, selectedOfferings.length ? selectedOfferings : profile.offerings ?? []), groundingFacts);
  const groundedQuestion = decision.nextQuestion ? sanitizeGroundedText(decision.nextQuestion, groundingFacts) : null;
  const groundedHandoffReason = decision.handoffReason ? sanitizeGroundedText(decision.handoffReason, groundingFacts) : null;
  const rawReply = knownPriceReply ?? redactAngolanPhoneCandidates(groundedReply);
  // Keep the WhatsApp-like chat readable even when the model ignores the limit.
  const compactReply = rawReply
    .replace(/\*\*/g, "")
    .replace(/^[-*#]\s*/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  let reply = extractedPhone
    ? "Obrigado. O link do WhatsApp da empresa está abaixo."
    : contactDeclined
      ? `Tudo bem, sem guardar o teu contacto. ${compactReply}`
      : compactReply || "Posso ajudar-te com isso. O que procuras exactamente?";
  // Model action/intent are advisory only. The server remains the sole authority
  // for capabilities, consent and the actual next action.
  const proposedAction = strategyConfig?.availableActions.includes(
    decision.proposedAction as (typeof strategyConfig.availableActions)[number],
  ) ? decision.proposedAction : "none";
  if (groundedQuestion && !reply.includes("?") && !contactCaptured && !contactDeclined && !shouldRequestContact
    && !["purchase", "human", "closing", "research", "disinterested"].includes(currentIntent)) {
    // Keep the model's single useful question, but never allow it to become a
    // second CTA or an unvalidated contact instruction.
    reply = `${reply} ${groundedQuestion}`.trim();
  }
  if (
    groundedHandoffReason
    && currentIntent === "human"
    && !updatedMemory.ownerCorrectedFields?.includes("escalationReason")
  ) {
    updatedMemory.escalationReason = groundedHandoffReason.slice(0, 300);
  }

  const orderedOfferings = orderOfferingsForStrategy(profile.offerings ?? [], strategyConfig?.focusedOffer);
  const namedProducts = decision.recommendedOfferings.length
    ? orderedOfferings.filter((offering) => decision.recommendedOfferings.some((name) =>
      name.toLocaleLowerCase("pt-AO") === offering.name.toLocaleLowerCase("pt-AO")))
    : [];
  const productMessage = conversationPlan.decision.intent === "compare" ? `Quero comparar ${userMessage}`
    : conversationPlan.decision.intent === "explore" ? `Mostra opções ${userMessage}` : userMessage;
  const explicitlyRequestedProducts = selectLeadChatProducts(selectedOfferings.length ? selectedOfferings : orderedOfferings, productMessage, parseCommercialAmount(updatedMemory.criteria.find((item) => item.value.startsWith("Orçamento:"))?.value ?? ""), updatedMemory.criteria.map((item) => item.value));
  const products = explicitlyRequestedProducts.length > 0
    ? (currentIntent !== "purchase" && namedProducts.length > 0 ? namedProducts.filter((item) => explicitlyRequestedProducts.some((allowed) => allowed.name === item.name)).slice(0, 3) : explicitlyRequestedProducts)
    : [];
  if (products.length > 0) {
    if (!updatedMemory.ownerCorrectedFields?.includes("recommendationReason")) {
      updatedMemory.recommendationReason = updatedMemory.interests.length
        ? `Corresponde ao interesse declarado em ${updatedMemory.interests[0]!.value}.`
        : "O cliente pediu opções do catálogo.";
    }
    if (updatedMemory.stage === "understand") updatedMemory.stage = "recommend";
  }
  const candidateNextAction = conversationPlan.nextAction;
  const nextAction = !contactCaptured && !shouldRequestContact
    ? candidateNextAction
    : { type: "none" as const, reason: "Sem acção explícita nesta mensagem" };
  const compactedReply = compactCommercialReply(reply, userMessage, updatedMemory.answeredQuestions, offeringNames)
    || (["closing", "research", "disinterested"].includes(currentIntent) ? "Tudo bem. Estamos por aqui quando precisares." : "Posso continuar a ajudar por aqui.");
  const resourceReply = resourceRequestRegistered
    ? "Pedido registado para revisão pela equipa."
    : approvedResources.length
      ? `Podes abrir ${approvedResources.length === 1 ? "o material" : "os materiais"} abaixo.`
      : requestedResource && updatedMemory.pendingProposal
        ? `Não tenho ${requestedResource.kind === "image" ? "mais imagens" : requestedResource.kind === "video" ? "um vídeo" : requestedResource.kind === "document" ? "um documento" : "esse detalhe"} para mostrar aqui. Queres que registe um pedido para a equipa rever?`
        : null;
  const contextAwareReply = resourceReply && !isTrafficWelcome && !isInterestOnly
    ? `${contactCaptured ? "Obrigado. Guardámos o teu WhatsApp com autorização. " : contactDeclined ? "Tudo bem. Continuamos por aqui sem guardar o teu WhatsApp. " : ""}${resourceReply}`
    : compactedReply;
  reply = withContactRequest(contextAwareReply);
  finalizeCommercialSummary(updatedMemory, nextAction);
  // Keep this advisory value observable in the response context without
  // allowing it to bypass server checks. It is intentionally not returned as
  // nextAction, which is generated from consent and real capabilities.
  void proposedAction;

  // Persist both messages in the lead's chatMessages
  const ts = new Date().toISOString();
  const appended: ChatMessage[] = [
    { role: "user" as const, text: safeUserMessage, ts, requestId: options?.requestId },
    {
      role: "bot" as const,
      text: reply,
      ts: new Date(Date.now() + 1).toISOString(),
      strategyVersionId: resolvedStrategy.strategy?.id,
      contactRequested: shouldRequestContact,
      requestId: options?.requestId,
       replay: { products, resources: approvedResources, nextAction, contactCaptured },
      resources: approvedResources,
    },
  ];
  const leadWhere = businessId !== undefined
    ? and(
      eq(leadsTable.id, leadId),
      eq(leadsTable.businessId, businessId),
      ...(extractedPhone || refusedContact ? [eq(leadsTable.contactConsentStatus, "pending")] : []),
    )
    : eq(leadsTable.id, leadId);
  const guardedWhere = options?.trafficWelcomeClaimToken
    ? and(
      leadWhere,
      eq(leadsTable.trafficWelcomeStatus, "processing"),
      eq(leadsTable.trafficWelcomeClaimToken, options.trafficWelcomeClaimToken),
      sql`${leadsTable.commercialMemory}->>'revision' = ${String(lead.commercialMemory.revision)}`,
    )
    : and(
      leadWhere,
      sql`${leadsTable.commercialMemory}->>'revision' = ${String(lead.commercialMemory.revision)}`,
    );
  const rows = await db.transaction(async (tx) => {
  const committed = await tx
    .update(leadsTable)
    .set({
      chatMessages: sql`${leadsTable.chatMessages} || ${JSON.stringify(appended)}::jsonb`,
      commercialMemory: updatedMemory,
      aiSummary: updatedMemory.factualSummary,
      score: ["perdido", "entregue"].includes(lead.state) || updatedMemory.ownerCorrectedFields?.includes("score") ? lead.score
        : Math.max(lead.score ?? 0, conversationPlan.decision.interest === "explicit_purchase" ? 70
          : updatedMemory.criteria.length >= 2 && updatedMemory.interests.length > 0 ? 60 : 30),
      state: ["entregue", "perdido", "qualificado"].includes(lead.state) ? lead.state
        : conversationPlan.decision.interest === "explicit_purchase"
          || (updatedMemory.criteria.length >= 2 && updatedMemory.interests.length > 0) ? "qualificado" : "em_atendimento",
      qualificationData: {
        ...lead.qualificationData,
        interest: updatedMemory.interests.map(item => item.value).join(", ") || lead.qualificationData.interest,
        budget: updatedMemory.criteria.find(item => item.value.startsWith("Orçamento:"))?.value ?? lead.qualificationData.budget,
        timeline: conversationPlan.decision.urgency ?? lead.qualificationData.timeline,
      },
      ...contactMutation,
      ...(options?.trafficWelcomeClaimToken
        ? {
          trafficWelcomeStatus: "complete" as const,
          trafficWelcomeClaimedAt: null,
          trafficWelcomeClaimToken: null,
        }
        : {}),
      updatedAt: new Date(),
    })
    .where(guardedWhere)
    .returning({ id: leadsTable.id });
  if (committed[0] && resourceRequestRegistered && pendingProposal) {
    await registerVisitorResourceRequest(businessId, leadId, pendingProposal, resourceRequestSummary, tx);
  }
  return committed;
  });
  if (!rows[0]) {
    if (options?.requestId) {
      await db.delete(leadChatRequestsTable).where(and(
        eq(leadChatRequestsTable.id, options.requestId),
        eq(leadChatRequestsTable.businessId, businessId),
        eq(leadChatRequestsTable.leadId, leadId),
      )).catch(() => undefined);
    }
    throw new Error("A operação desta resposta já não está activa");
  }
  if (options?.requestId) {
    await db.update(leadChatRequestsTable).set({
      status: "complete",
       response: { reply, products, resources: approvedResources, nextAction, contactCaptured },
      updatedAt: new Date(),
    }).where(and(
      eq(leadChatRequestsTable.id, options.requestId),
      eq(leadChatRequestsTable.businessId, businessId),
      eq(leadChatRequestsTable.leadId, leadId),
    ));
  }

  recordTurnOutcome(products);

  const memorySummary = summarizeOldInteraction([...safeLead.chatMessages, ...appended]);
  if (memorySummary) {
    void saveInteractionMemory(businessId, leadId, memorySummary, {
      source: "system",
      sourceRef: "rolling_chat_summary",
      reviewedAt: new Date().toISOString(),
    }).catch((err) => logger.warn({ err, leadId, businessId }, "Failed to save rolling interaction memory"));
  }
  void recordBusinessAiEvaluation({
    businessId,
    channel: "chat",
    scenario: "visitor_chat",
    outcome: "success",
    latencyMs: Date.now() - startedAt,
    inputForHash: safeUserMessage,
    outputForEvaluation: reply,
    // Bounded estimate only; provider billing remains authoritative.
    costMicros: Math.min(10_000_000, generation.usage.totalTokens * 2),
  }).catch((err) => logger.warn({ err, businessId }, "Failed to record chat evaluation"));

  return { reply, products, resources: approvedResources, nextAction, contactCaptured };
}

export async function correctCommercialMemory(
  leadId: string,
  businessId: number,
  expectedRevision: number,
  patch: Partial<Pick<LeadCommercialMemory, "stage" | "pendingAction" | "factualSummary" | "recommendationReason" | "missingData" | "escalationReason" | "humanControl">>
    & { goal?: string; interests?: string[]; objections?: Array<{ text: string; status: "pending" | "resolved" }> },
): Promise<Lead> {
  const lead = await getLead(leadId, businessId);
  if (!lead) throw new Error("Lead não encontrado");
  if (lead.commercialMemory.revision !== expectedRevision) throw new Error("A conversa mudou; actualiza antes de corrigir");
  const now = new Date().toISOString();
  const { goal, interests, objections, ...scalarPatch } = patch;
  const memory: LeadCommercialMemory = {
    ...lead.commercialMemory,
    ...scalarPatch,
    revision: expectedRevision + 1,
    ...(goal !== undefined ? { goal: goal ? { value: goal, provenance: "owner", updatedAt: now } : undefined } : {}),
    ...(interests ? { interests: interests.map((value) => ({ value, provenance: "owner" as const, updatedAt: now })) } : {}),
    ...(objections ? { objections: objections.map((item) => ({ ...item, provenance: "owner" as const, updatedAt: now })) } : {}),
    ownerCorrectedFields: [...new Set([
      ...(lead.commercialMemory.ownerCorrectedFields ?? []),
      ...Object.keys(patch),
    ])],
  };
  const rows = await db.update(leadsTable).set({ commercialMemory: memory, updatedAt: new Date() })
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.businessId, businessId), sql`${leadsTable.commercialMemory}->>'revision' = ${String(expectedRevision)}`))
    .returning();
  if (!rows[0]) throw new Error("A conversa mudou; actualiza antes de corrigir");
  return rows[0];
}

// ─── Owner manual reply (agent message, no AI) ───────────────────────────────

/**
 * Appends a manual reply from the business owner (role "agent") to the lead's
 * chatMessages without triggering the AI. Used when the owner takes over the
 * conversation from the Conversas panel.
 */
export async function appendOwnerReply(
  leadId: string,
  message: string,
  businessId: number,
): Promise<Lead> {
  const updated = await retryCommercialMemoryCas(
    () => getLead(leadId, businessId),
    async (current) => {
    const appended = [{ role: "agent" as ChatMessage["role"], text: message, ts: new Date().toISOString() }];
    const rows = await db
      .update(leadsTable)
      .set({
        chatMessages: sql`${leadsTable.chatMessages} || ${JSON.stringify(appended)}::jsonb`,
        commercialMemory: {
          ...current.commercialMemory,
          revision: current.commercialMemory.revision + 1,
          stage: "handoff",
          humanControl: "owner",
          ownerCorrectedFields: [...new Set([
            ...(current.commercialMemory.ownerCorrectedFields ?? []),
            "stage", "humanControl",
          ])],
        },
        updatedAt: new Date(),
      })
      .where(and(
        eq(leadsTable.id, leadId),
        eq(leadsTable.businessId, businessId),
        sql`${leadsTable.commercialMemory}->>'revision' = ${String(current.commercialMemory.revision)}`,
      ))
      .returning();
      return rows[0] ?? null;
    },
  );
  if (updated) return updated;
  if (!(await getLead(leadId, businessId))) throw new Error("Lead não encontrado");
  throw new Error("A conversa mudou; tenta responder novamente");
}

// ─── SSE notification bus ─────────────────────────────────────────────────────

type SseListener = (leadId: string) => void;
const sseListeners = new Set<SseListener>();

export function subscribeToLeadQualified(fn: SseListener): () => void {
  sseListeners.add(fn);
  return () => sseListeners.delete(fn);
}

function notifyLeadQualified(leadId: string): void {
  for (const fn of sseListeners) {
    try { fn(leadId); } catch { /* ignore */ }
  }
}
