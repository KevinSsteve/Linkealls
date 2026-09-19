/**
 * Assistente Vivo — Gemini agent with function calling over platform data.
 *
 * Two modes:
 *   1. Chat: owner sends a message, Gemini responds using tools to read real data.
 *   2. Proactive: platform events (lead qualified, stale leads) generate messages
 *      that are pushed to the owner via SSE.
 */

import { GoogleGenAI, type FunctionDeclaration, Type } from "@google/genai";
import {
  db,
  assistantMessagesTable,
  type AssistantMessage,
  type AssistantMessageMeta,
} from "@workspace/db";
import { asc, and, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { listLeads, getLead, updateLeadState, subscribeToLeadQualified } from "./leads.js";
import { getOrCreateProfile } from "./businessProfile.js";
import { assertNonessentialSummariesEnabled } from "../lib/launchPolicy.js";

const MODEL = "gemini-3-flash-preview";
const MAX_HISTORY = 20; // messages kept in context window

// ─── DB helpers ──────────────────────────────────────────────────────────────

export async function listMessages(businessId: number, limit = 60): Promise<AssistantMessage[]> {
  const rows = await db
    .select()
    .from(assistantMessagesTable)
    .where(eq(assistantMessagesTable.businessId, businessId))
    .orderBy(asc(assistantMessagesTable.createdAt))
    .limit(limit);
  return rows;
}

export async function saveMessage(
  role: AssistantMessage["role"],
  content: string,
  meta: AssistantMessageMeta = {},
  businessId?: number,
): Promise<AssistantMessage> {
  const inserted = await db
    .insert(assistantMessagesTable)
    .values({ role, content, meta, ...(businessId !== undefined ? { businessId } : {}) })
    .returning();
  return inserted[0]!;
}

export async function savePaymentFailureAlert(input: {
  businessId: number;
  merchantTransactionId: string;
  destination: string;
  content: string;
}): Promise<AssistantMessage> {
  const dedupeKey = `payment-webhook-failure:${input.businessId}:${input.merchantTransactionId}`;
  const inserted = await db
    .insert(assistantMessagesTable)
    .values({
      role: "proactive",
      content: input.content,
      businessId: input.businessId,
      dedupeKey,
      meta: {
        proactiveType: "payment_webhook_failure",
        merchantTransactionId: input.merchantTransactionId,
        destination: input.destination,
      },
    })
    .onConflictDoNothing({ target: assistantMessagesTable.dedupeKey })
    .returning();
  const message = inserted[0];
  if (message) {
    broadcastAssistantMessage(message);
    return message;
  }

  const existing = await db
    .select()
    .from(assistantMessagesTable)
    .where(eq(assistantMessagesTable.dedupeKey, dedupeKey))
    .limit(1);
  if (!existing[0]) {
    throw new Error("Payment failure alert conflict resolved without a stored message");
  }
  return existing[0];
}

export async function clearMessages(businessId: number): Promise<void> {
  await db.delete(assistantMessagesTable).where(eq(assistantMessagesTable.businessId, businessId));
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const toolDeclarations: FunctionDeclaration[] = [
  {
    name: "get_platform_summary",
    description:
      "Retorna um resumo geral da plataforma: total de leads por estado, leads de hoje, pontuação média e as últimas 5 actividades.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "list_leads",
    description:
      "Lista os leads com os seus dados principais (estado, nome, contacto, pontuação, origem). Usar quando o dono pergunta sobre leads específicos ou quer ver a lista.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        state: {
          type: Type.STRING,
          description:
            "Filtrar por estado: novo, em_atendimento, qualificado, entregue, perdido. Omitir para todos.",
        },
      },
    },
  },
  {
    name: "get_lead_detail",
    description:
      "Retorna todos os detalhes de um lead específico: dados de qualificação, resumo da IA, transcrição da chamada.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        lead_id: { type: Type.STRING, description: "UUID do lead" },
      },
      required: ["lead_id"],
    },
  },
  {
    name: "get_business_profile",
    description: "Retorna o perfil do negócio configurado no Cérebro do Negócio.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "update_lead_state",
    description:
      "Propõe mudar o estado de um lead. O assistente deve sempre confirmar com o dono antes de chamar esta função.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        lead_id: { type: Type.STRING, description: "UUID do lead" },
        new_state: {
          type: Type.STRING,
          description: "Novo estado: novo, em_atendimento, qualificado, entregue, perdido",
        },
        reason: { type: Type.STRING, description: "Motivo da mudança de estado" },
      },
      required: ["lead_id", "new_state", "reason"],
    },
  },
  {
    name: "draft_followup_message",
    description:
      "Gera um rascunho de mensagem de follow-up WhatsApp para um lead. Retorna o rascunho pronto a copiar.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        lead_id: { type: Type.STRING, description: "UUID do lead" },
        context: {
          type: Type.STRING,
          description: "Contexto adicional ou instrução especial para o rascunho",
        },
      },
      required: ["lead_id"],
    },
  },
];

// ─── Tool execution ───────────────────────────────────────────────────────────

interface ToolResult {
  text: string;
  meta?: AssistantMessageMeta;
}

async function executeTool(
  name: string,
  args: Record<string, string>,
  businessId: number,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_platform_summary": {
        const leads = await listLeads(businessId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayLeads = leads.filter((l) => new Date(l.createdAt) >= today);
        const byState: Record<string, number> = {};
        let scoreSum = 0;
        let scoreCount = 0;
        for (const l of leads) {
          byState[l.state] = (byState[l.state] ?? 0) + 1;
          if (l.score !== null) { scoreSum += l.score; scoreCount++; }
        }
        const avgScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null;
        const recent = [...leads]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);
        return {
          text: JSON.stringify({
            total_leads: leads.length,
            today_leads: todayLeads.length,
            by_state: byState,
            average_score: avgScore,
            recent_leads: recent.map((l) => ({
              id: l.id,
              state: l.state,
              name: l.qualificationData.name ?? "sem nome",
              phone: l.qualificationData.phone ?? "sem contacto",
              score: l.score,
              created_at: l.createdAt,
            })),
          }),
        };
      }

      case "list_leads": {
        const leads = await listLeads(businessId);
        const filtered = args["state"]
          ? leads.filter((l) => l.state === args["state"])
          : leads;
        return {
          text: JSON.stringify(
            filtered.map((l) => ({
              id: l.id,
              state: l.state,
              name: l.qualificationData.name ?? "sem nome",
              phone: l.qualificationData.phone,
              email: l.qualificationData.email,
              interest: l.qualificationData.interest,
              budget: l.qualificationData.budget,
              score: l.score,
              origin_source: l.origin.source,
              origin_campaign: l.origin.campaign,
              created_at: l.createdAt,
            })),
          ),
        };
      }

      case "get_lead_detail": {
        const lead = await getLead(args["lead_id"] ?? "", businessId);
        if (!lead) return { text: JSON.stringify({ error: "Lead não encontrado" }) };
        return {
          text: JSON.stringify({
            id: lead.id,
            state: lead.state,
            qualification_data: lead.qualificationData,
            ai_summary: lead.aiSummary,
            score: lead.score,
            origin: lead.origin,
            call_transcript: lead.callTranscript?.slice(0, 3000),
            chat_messages: lead.chatMessages,
            whatsapp_message: lead.whatsappMessage,
            created_at: lead.createdAt,
          }),
        };
      }

      case "get_business_profile": {
        const profile = await getOrCreateProfile(businessId);
        return {
          text: JSON.stringify({
            name: profile.name,
            sector: profile.sector,
            description: profile.description,
            target_audience: profile.targetAudience,
            offerings_count: profile.offerings.length,
            faq_count: profile.faq.length,
            analysis_status: profile.analysisStatus,
          }),
        };
      }

      case "update_lead_state": {
        const lead = await getLead(args["lead_id"] ?? "", businessId);
        if (!lead) return { text: JSON.stringify({ error: "Lead não encontrado" }) };
        const newState = args["new_state"] ?? "";
        const validStates = ["novo", "em_atendimento", "qualificado", "entregue", "perdido"];
        if (!validStates.includes(newState)) {
          return { text: JSON.stringify({ error: "Estado inválido" }) };
        }
        // Return a pending action — the owner must confirm via the UI
        return {
          text: JSON.stringify({
            proposed: true,
            lead_id: lead.id,
            lead_name: lead.qualificationData.name ?? "Lead",
            current_state: lead.state,
            new_state: newState,
            reason: args["reason"],
          }),
          meta: {
            pendingAction: {
              type: "update_lead_state",
              leadId: lead.id,
              newState,
              description: `Mudar "${lead.qualificationData.name ?? "Lead"}" de ${lead.state} → ${newState}: ${args["reason"]}`,
            },
          },
        };
      }

      case "draft_followup_message": {
        const lead = await getLead(args["lead_id"] ?? "", businessId);
        if (!lead) return { text: JSON.stringify({ error: "Lead não encontrado" }) };
        const draft =
          lead.whatsappMessage ||
          `Olá ${lead.qualificationData.name ?? ""}! Aqui fala [Nome do negócio]. Obrigado pelo contacto de há pouco.${lead.qualificationData.interest ? `\n\nVi que tem interesse em: ${lead.qualificationData.interest}.` : ""}\n\nGostaria de continuar a nossa conversa. Quando seria uma boa hora para falarmos?`;
        return {
          text: JSON.stringify({ draft }),
          meta: { draftMessage: draft, leadId: lead.id },
        };
      }

      default:
        return { text: JSON.stringify({ error: `Ferramenta desconhecida: ${name}` }) };
    }
  } catch (err) {
    logger.error({ err, tool: name }, "Tool execution failed");
    return { text: JSON.stringify({ error: "Erro ao executar ferramenta" }) };
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é o Assistente Vivo do dono do negócio — um parceiro de IA proativo que ajuda a gerir os leads e melhorar as conversões.

PERSONALIDADE:
- Direto, prático e orientado a resultados
- Tom angolano-português (AO), profissional mas amigável
- Respostas concisas (máximo 3-4 parágrafos salvo pedido de detalhe)

CAPACIDADES:
- Consultar dados reais via ferramentas: leads, estados, pontuações, perfil do negócio
- Propor ações (sempre com confirmação do dono)
- Rascunhar mensagens de follow-up
- Dar análises e sugestões baseadas nos dados

REGRAS:
- SEMPRE usa as ferramentas para obter dados reais antes de responder sobre métricas ou leads
- NUNCA inventa números ou dados de leads
- Para ações como mudar estado de lead, usa a ferramenta e informa que a mudança precisa de confirmação
- Quando apresentas um rascunho de mensagem, indica claramente que está pronto a copiar
- Neste lançamento, concentra-te no perfil, catálogo, atendimento, conversas e pedidos.
- Publicidade e geração de conteúdos publicitários estão suspensas: não cries anúncios,
  campanhas, kits, textos, imagens ou vídeos publicitários nem encaminhes para os seus
  atalhos. Explica a indisponibilidade; o histórico continua consultável.
- Resumos diários automáticos e lembretes de contactos parados estão suspensos.
  Não prometas agendá-los nem sugiras esses atalhos. Podes responder a perguntas
  pontuais sobre contactos com os dados das ferramentas e rascunhar respostas individuais.
- Responde SEMPRE em português de Angola

Data e hora atual: ${new Date().toLocaleString("pt-AO", { timeZone: "Africa/Luanda" })}`;

// ─── Chat function ────────────────────────────────────────────────────────────

export async function chat(userMessage: string, businessId: number): Promise<AssistantMessage> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  // Save user message
  await saveMessage("user", userMessage, {}, businessId);

  // Build history for context (last N messages)
  const history = await listMessages(businessId, MAX_HISTORY);
  const geminiHistory = history
    .slice(0, -1) // exclude the just-saved user message
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    }));

  const ai = new GoogleGenAI({ apiKey });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let contents: any[] = [
    ...geminiHistory,
    { role: "user", parts: [{ text: userMessage }] },
  ];

  let assistantText = "";
  let assistantMeta: AssistantMessageMeta = {};
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  // Agentic loop — Gemini may call multiple tools before final response
  while (iterations++ < MAX_ITERATIONS) {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: toolDeclarations }],
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) break;

    const parts = (candidate.content?.parts ?? []) as Array<Record<string, unknown>>;

    // Check for function calls
    const fnCalls = parts.filter((p) => p["functionCall"]);
    if (fnCalls.length > 0) {
      // Execute all function calls
      const toolResults = await Promise.all(
        fnCalls.map(async (p) => {
          const fn = p["functionCall"] as { name?: string; args?: Record<string, string> };
          const result = await executeTool(
            fn.name ?? "",
            (fn.args ?? {}) as Record<string, string>,
            businessId,
          );
          if (result.meta) {
            Object.assign(assistantMeta, result.meta);
          }
          return { functionCall: fn, result };
        }),
      );

      // Add model turn + function responses to contents
      contents = [
        ...contents,
        { role: "model", parts },
        {
          role: "user",
          parts: toolResults.map(({ functionCall, result }) => ({
            functionResponse: {
              name: functionCall.name ?? "",
              response: { output: result.text },
            },
          })),
        },
      ];
      continue; // next iteration: model digests tool results
    }

    // Final text response
    const textPart = parts.find((p) => p["text"]);
    if (textPart?.["text"]) {
      assistantText = String(textPart["text"]);
    }
    break;
  }

  if (!assistantText) {
    assistantText = "Desculpa, não consegui processar a tua pergunta. Tenta de novo.";
  }

  return saveMessage("assistant", assistantText, assistantMeta, businessId);
}

// ─── Proactive messages ───────────────────────────────────────────────────────

/** Generates and saves a proactive lead-qualified message. */
export async function proactiveLeadQualified(leadId: string): Promise<AssistantMessage | null> {
  const lead = await getLead(leadId);
  if (!lead || lead.businessId === null) return null;
  const businessId = lead.businessId;

  const name = lead.qualificationData.name ?? "Lead sem nome";
  const phone = lead.qualificationData.phone;
  const interest = lead.qualificationData.interest;
  const score = lead.score;

  const lines = [
    `🎯 **Lead qualificado!** *${name}*${score !== null ? ` — pontuação ${score}/100` : ""}`,
    interest ? `Interesse: ${interest}` : null,
    phone ? `Contacto: ${phone}` : null,
    phone
      ? `Já tens a mensagem de follow-up pronta — vai à caixa de leads para enviar pelo WhatsApp.`
      : `Ainda não temos o número de telefone. Considera contactar por outro canal.`,
  ]
    .filter(Boolean)
    .join("\n");

  return saveMessage("proactive", lines, {
    proactiveType: "lead_qualified",
    leadId,
  }, businessId);
}

/** Checks for stale qualified leads (> 24h without being delivered). */
export async function proactiveStaleLeads(businessId: number): Promise<AssistantMessage | null> {
  assertNonessentialSummariesEnabled();
  const leads = await listLeads(businessId);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stale = leads.filter(
    (l) =>
      l.state === "qualificado" &&
      new Date(l.updatedAt) < cutoff,
  );
  if (stale.length === 0) return null;

  const names = stale
    .slice(0, 5)
    .map((l) => l.qualificationData.name ?? "Lead sem nome")
    .join(", ");

  const content =
    stale.length === 1
      ? `⏰ **Lead parado há mais de 24h:** ${names}. Está qualificado mas ainda não foi entregue. Considera fazer o follow-up agora.`
      : `⏰ **${stale.length} leads parados há mais de 24h:** ${names}${stale.length > 5 ? " e outros" : ""}. Considera fazer o follow-up.`;

  return saveMessage("proactive", content, { proactiveType: "stale_leads" }, businessId);
}

/** Generates a daily summary of activity. */
export async function proactiveDailySummary(businessId: number): Promise<AssistantMessage> {
  assertNonessentialSummariesEnabled();
  const leads = await listLeads(businessId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayLeads = leads.filter((l) => new Date(l.createdAt) >= today);
  const qualified = leads.filter((l) => l.state === "qualificado").length;
  const delivered = leads.filter((l) => l.state === "entregue").length;

  const content = [
    `📊 **Resumo de hoje:**`,
    `• Novos leads: ${todayLeads.length}`,
    `• A qualificar: ${qualified}`,
    `• Entregues: ${delivered}`,
    `• Total na plataforma: ${leads.length}`,
    qualified > 0
      ? `\nTens ${qualified} lead${qualified > 1 ? "s" : ""} qualificado${qualified > 1 ? "s" : ""} à espera de follow-up. Boa altura para entrar em contacto!`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return saveMessage("proactive", content, { proactiveType: "daily_summary" }, businessId);
}

// ─── Confirm action ───────────────────────────────────────────────────────────

/** Executes or cancels a pending action from a previous assistant message. */
export async function confirmAction(
  messageId: string,
  confirmed: boolean,
  businessId: number,
): Promise<AssistantMessage> {
  const rows = await db
    .select()
    .from(assistantMessagesTable)
    .where(
      and(
        eq(assistantMessagesTable.id, messageId),
        eq(assistantMessagesTable.businessId, businessId),
      ),
    )
    .limit(1);

  const msg = rows[0];

  if (!msg?.meta?.pendingAction) {
    return saveMessage("assistant", "Não encontrei a ação pendente. Tenta de novo.", {}, businessId);
  }

  const action = msg.meta.pendingAction;

  if (!confirmed) {
    return saveMessage("assistant", "Ação cancelada. Fica à vontade para pedir algo mais.", {}, businessId);
  }

  if (action.type === "update_lead_state") {
    const validStates = ["novo", "em_atendimento", "qualificado", "entregue", "perdido"];
    if (!validStates.includes(action.newState)) {
      return saveMessage("assistant", "Estado inválido — ação cancelada.", {}, businessId);
    }
    await updateLeadState(action.leadId, action.newState as Parameters<typeof updateLeadState>[1], businessId);
    return saveMessage(
      "assistant",
      `✅ Feito! Estado do lead atualizado para "${action.newState}".`,
      {},
      businessId,
    );
  }

  return saveMessage("assistant", "Ação desconhecida — não foi possível executar.", {}, businessId);
}

// ─── SSE notification bus ─────────────────────────────────────────────────────

type AssistantSseListener = (msg: AssistantMessage) => void;
const assistantListeners = new Set<AssistantSseListener>();

export function subscribeToAssistantMessages(fn: AssistantSseListener): () => void {
  assistantListeners.add(fn);
  return () => assistantListeners.delete(fn);
}

export function broadcastAssistantMessage(msg: AssistantMessage): void {
  for (const fn of assistantListeners) {
    try { fn(msg); } catch { /* ignore */ }
  }
}

// ─── Proactive event wiring ───────────────────────────────────────────────────

let proactiveWired = false;

/** Wire platform events → proactive assistant messages. Call once at startup. */
export function wireProactiveEvents(): void {
  if (proactiveWired) return;
  proactiveWired = true;
  subscribeToLeadQualified((leadId) => {
    void (async () => {
      const msg = await proactiveLeadQualified(leadId);
      if (msg) broadcastAssistantMessage(msg);
    })().catch((err) => {
      logger.error({ err, leadId }, "Failed to generate proactive lead-qualified message");
    });
  });
}
