import { GoogleGenAI } from "@google/genai";
import {
  db,
  leadsTable,
  ordersTable,
  type Lead,
  type InsertLead,
  type LeadOrigin,
  type ChatMessage,
  type QualificationData,
  type LeadState,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getOrCreateProfile } from "./businessProfile.js";
import { sendPushToOwner } from "./notifications.js";

const EXTRACTION_MODEL = "gemini-3-flash-preview";
const SCORE_QUALIFY_THRESHOLD = 60;

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createLead(
  origin: LeadOrigin,
  chatMessages: ChatMessage[],
  businessId?: number,
): Promise<Lead> {
  const inserted = await db
    .insert(leadsTable)
    .values({ origin, chatMessages, ...(businessId !== undefined ? { businessId } : {}) })
    .returning();
  return inserted[0]!;
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
    .set({ state, updatedAt: new Date() })
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

function parseExtractionResult(raw: unknown, businessName: string): ExtractionResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const qd = (r["qualificationData"] ?? {}) as Record<string, unknown>;
  const extras = (qd["extras"] ?? {}) as Record<string, unknown>;

  const qualificationData: QualificationData = {
    name:     clampStr(qd["name"], 200) || undefined,
    phone:    clampStr(qd["phone"], 50) || undefined,
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

  const phone = qualificationData.phone;
  const waPhone = phone
    ? phone.replace(/\D/g, "").replace(/^00/, "").replace(/^0/, "244")
    : "";
  const name = qualificationData.name ?? "cliente";
  const summary = clampStr(r["aiSummary"], 2000);
  const interest = qualificationData.interest
    ? `\n\nInteresse: ${qualificationData.interest}`
    : "";
  const budget = qualificationData.budget
    ? `\nOrçamento: ${qualificationData.budget}`
    : "";
  const whatsappMessage = waPhone
    ? `Olá ${name}! Aqui fala ${businessName}. Obrigado pelo contacto de há pouco.${interest}${budget}\n\nGostaria de continuar a nossa conversa. Quando seria boa hora?`
    : "";

  return {
    qualificationData,
    aiSummary: summary,
    score,
    whatsappMessage: whatsappMessage.slice(0, 2000),
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
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    logger.error("GEMINI_API_KEY not set — skipping lead extraction");
    return;
  }

  // Scoped fetch — a lead belonging to another business is treated as not found.
  const lead = await getLead(leadId, businessId);
  if (!lead) {
    logger.warn({ leadId, businessId }, "Lead not found for post-call extraction (or belongs to another business)");
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Analisa esta transcrição de uma chamada de qualificação de leads e extrai informação estruturada.

TRANSCRIÇÃO:
${callTranscript || "(sem transcrição disponível)"}

Devolve um JSON com:
- qualificationData: { name, phone, email, interest, budget, timeline, location, extras }
  - name: nome do potencial cliente (se mencionado)
  - phone: número de telefone (se mencionado)
  - email: email (se mencionado)
  - interest: resumo do interesse/necessidade em 1-2 frases
  - budget: orçamento ou faixa de preço mencionada
  - timeline: prazo de decisão ou urgência
  - location: localização ou área geográfica (se relevante)
  - extras: outros dados relevantes como pares chave-valor
- aiSummary: resumo da conversa em 2-4 parágrafos, do ponto de vista do agente comercial
- score: pontuação de 0-100 baseada na qualidade do lead:
  * 0-39: baixa qualidade (não deu informação, desinteressado)
  * 40-59: médio (interesse mas sem dados de contacto ou orçamento)
  * 60-79: bom (interesse claro + algum dado de contacto)
  * 80-100: excelente (dados completos, orçamento definido, decisão próxima)

Responde APENAS com JSON válido, sem texto adicional.`;

    const response = await ai.models.generateContent({
      model: EXTRACTION_MODEL,
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const text = response.text ?? "";
    const raw = JSON.parse(text) as unknown;
    const extracted = parseExtractionResult(raw, businessName);

    const newState: LeadState =
      extracted.score >= SCORE_QUALIFY_THRESHOLD ? "qualificado" : lead.state === "em_atendimento" ? "em_atendimento" : lead.state;

    await db
      .update(leadsTable)
      .set({
        callTranscript: callTranscript.slice(0, 50_000),
        qualificationData: extracted.qualificationData,
        aiSummary: extracted.aiSummary,
        score: extracted.score,
        whatsappMessage: extracted.whatsappMessage,
        state: newState,
        callEndedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(leadsTable.id, leadId));

    logger.info({ leadId, score: extracted.score, state: newState }, "Lead extraction complete");

    // Notify SSE subscribers and push when newly qualified
    if (newState === "qualificado") {
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
    logger.error({ err, leadId }, "Post-call lead extraction failed");
    // Don't leave the lead in limbo — mark call ended even without extraction
    await db
      .update(leadsTable)
      .set({ callEndedAt: new Date(), updatedAt: new Date() })
      .where(eq(leadsTable.id, leadId));
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
  businessId?: number,
): Promise<{
  reply: string;
  products: Array<{ name: string; price: string; description: string; imageUrl?: string }>;
}> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurado");

  const [lead, profile] = await Promise.all([getLead(leadId, businessId), getOrCreateProfile(businessId)]);
  if (!lead) throw new Error("Lead não encontrado");

  // Build context blocks
  const offeringsText = profile.offerings?.length
    ? profile.offerings.map((o) => `- ${o.name}: ${o.description} (${o.price})`).join("\n")
    : "(não configurado)";

  const faqText = profile.faq?.length
    ? profile.faq.map((f) => `P: ${f.question}\nR: ${f.answer}`).join("\n\n")
    : "";
  const relatedOrders = await db
    .select({
      id: ordersTable.id,
      offeringName: ordersTable.offeringName,
      amount: ordersTable.amount,
      buyerPhone: ordersTable.buyerPhone,
      status: ordersTable.status,
      fulfillmentStatus: ordersTable.fulfillmentStatus,
      proofStatus: ordersTable.proofStatus,
      paidAt: ordersTable.paidAt,
    })
    .from(ordersTable)
    .where(eq(ordersTable.leadId, leadId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(5);
  const ordersText = relatedOrders.length
    ? relatedOrders.map((order) => [
      `- ${order.offeringName} — ${Number(order.amount).toLocaleString("pt-AO")} Kz`,
      `pagamento: ${order.status}, preparação: ${order.fulfillmentStatus}, comprovativo: ${order.proofStatus}`,
      `telefone usado no pagamento: ${order.buyerPhone}${order.paidAt ? `, pago em ${new Date(order.paidAt).toLocaleString("pt-AO")}` : ""}`,
    ].join(" | ")).join("\n")
    : "(sem pedido associado)";

  const systemInstruction = `És um assistente comercial de atendimento por texto para ${profile.name || "este negócio"}.
Tom de voz: ${profile.toneOfVoice || "profissional e amigável"}.
Sector: ${profile.sector || "não especificado"}.
Descrição: ${profile.description || ""}.
Público-alvo: ${profile.targetAudience || ""}.
Diferenciais: ${(profile.differentials || []).join(", ")}.

PRODUTOS/SERVIÇOS:
${offeringsText}
${faqText ? `\nPERGUNTAS FREQUENTES:\n${faqText}\n` : ""}

PEDIDOS ASSOCIADOS A ESTA CONVERSA:
${ordersText}
REGRAS:
- Responde de forma natural, útil e muito curta: no máximo 2 frases e 3 linhas.
- Não repitas a descrição do negócio nem faças introduções longas. Responde directamente ao que o cliente perguntou.
- NÃO uses formatação markdown (sem asteriscos, sem #, sem bullets).
- Quando fizer sentido, sugere ligar de volta ao cliente.
- Depois de um pagamento confirmado, faz follow-up: confirma que o número usado no Multicaixa Express (${relatedOrders.find((order) => order.status === "paga")?.buyerPhone ?? "ainda não confirmado"}) é o correcto e recolhe os dados em falta para entrega (localização, endereço, pessoa a receber e horário).
- Se o comprovativo estiver pendente ou rejeitado, pede-o de forma clara. Se já foi recebido ou aprovado, confirma que está em revisão/validado e não o peças novamente.
- Não inventes estados, prazos de entrega ou confirmação de dados que não estejam no contexto.
- Escreve em Português de Angola (tratamento informal mas respeitoso).
- Se não souberes uma resposta, diz honestamente e oferece alternativa.`;

  // Build conversation content: chat history + call transcript (if any)
  const history = lead.chatMessages
    .map((m) => `${m.role === "user" ? "Cliente" : "Assistente"}: ${m.text}`)
    .join("\n");

  const transcriptBlock = lead.callTranscript
    ? `\n\n[TRANSCRIÇÃO DA CHAMADA ANTERIOR]\n${lead.callTranscript.slice(0, 3000)}`
    : "";

  const prompt = `${history}${transcriptBlock}\n\nCliente: ${userMessage}\nAssistente:`;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: EXTRACTION_MODEL,
    contents: prompt,
    config: { systemInstruction },
  });

  const rawReply = (response.text ?? "").trim() ||
    "Desculpa, não consegui processar a tua mensagem. Tenta outra vez.";
  // Keep the WhatsApp-like chat compact even when the model ignores the limit.
  const reply = rawReply
    .replace(/\*\*/g, "")
    .replace(/^[-*#]\s*/gm, "")
    .replace(/\n{2,}/g, "\n")
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(" ")
    .trim()
    .slice(0, 360)
    .trim();

  const productIntent = /\b(produto|produtos|serviço|serviços|preço|preços|quanto|menu|catálogo|catalogo|comprar|compra|quero|mostra|mostrar|tem|disponível|disponivel)\b/i.test(userMessage);
  const normalizedQuery = userMessage.toLocaleLowerCase("pt-AO");
  const matchedOfferings = productIntent
    ? (profile.offerings ?? []).filter((o) => {
        const haystack = `${o.name} ${o.description}`.toLocaleLowerCase("pt-AO");
        return haystack.split(/\s+/).some((word) => word.length > 3 && normalizedQuery.includes(word));
      })
    : [];
  const products = productIntent
    ? (matchedOfferings.length > 0 ? matchedOfferings : (profile.offerings ?? [])).slice(0, 12).map((o) => ({
        name: o.name,
        price: o.price,
        description: o.description,
        imageUrl: o.imageUrl,
      }))
    : [];

  // Persist both messages in the lead's chatMessages
  const ts = new Date().toISOString();
  const updated: ChatMessage[] = [
    ...lead.chatMessages,
    { role: "user" as const, text: userMessage, ts },
    { role: "bot" as const, text: reply, ts: new Date(Date.now() + 1).toISOString() },
  ];
  await db
    .update(leadsTable)
    .set({ chatMessages: updated, updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId));

  return { reply, products };
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
  const lead = await getLead(leadId, businessId);
  if (!lead) throw new Error("Lead não encontrado");
  const ts = new Date().toISOString();
  // Use type assertion — "agent" is a valid ChatMessage role per the interface
  const updated = [
    ...lead.chatMessages,
    { role: "agent" as ChatMessage["role"], text: message, ts },
  ];
  const rows = await db
    .update(leadsTable)
    .set({ chatMessages: updated, updatedAt: new Date() })
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.businessId, businessId)))
    .returning();
  return rows[0]!;
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
