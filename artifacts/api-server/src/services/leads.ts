import { GoogleGenAI } from "@google/genai";
import {
  db,
  leadsTable,
  type Lead,
  type InsertLead,
  type LeadOrigin,
  type ChatMessage,
  type QualificationData,
  type LeadState,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const EXTRACTION_MODEL = "gemini-3-flash-preview";
const SCORE_QUALIFY_THRESHOLD = 60;

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createLead(
  origin: LeadOrigin,
  chatMessages: ChatMessage[],
): Promise<Lead> {
  const inserted = await db
    .insert(leadsTable)
    .values({ origin, chatMessages })
    .returning();
  return inserted[0]!;
}

export async function getLead(id: string): Promise<Lead | null> {
  const rows = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id));
  return rows[0] ?? null;
}

export async function listLeads(): Promise<Lead[]> {
  return db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt));
}

export async function updateLeadState(id: string, state: LeadState): Promise<Lead | null> {
  const updated = await db
    .update(leadsTable)
    .set({ state, updatedAt: new Date() })
    .where(eq(leadsTable.id, id))
    .returning();
  return updated[0] ?? null;
}

export async function updateLeadOnCallStart(id: string): Promise<void> {
  await db
    .update(leadsTable)
    .set({ state: "em_atendimento", updatedAt: new Date() })
    .where(eq(leadsTable.id, id));
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
): Promise<void> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    logger.error("GEMINI_API_KEY not set — skipping lead extraction");
    return;
  }

  const lead = await getLead(leadId);
  if (!lead) {
    logger.warn({ leadId }, "Lead not found for post-call extraction");
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

    // Notify SSE subscribers when newly qualified
    if (newState === "qualificado") {
      notifyLeadQualified(leadId);
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
