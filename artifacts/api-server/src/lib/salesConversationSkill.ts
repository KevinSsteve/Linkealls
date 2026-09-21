import type { LeadCommercialMemory, SalesStrategyConfig, LeadContactConsentStatus } from "@workspace/db";
import { chooseNextAction, commercialIntent, commercialQuestionAnswered, type SalesNextAction } from "./commercialSales.js";

/** Runtime policy, not a bank of customer-facing scripts. */
export const SALES_CONVERSATION_SKILL = {
  version: "sales-conversation-v1",
  purpose: "Aproximar o cliente de uma decisão informada com o mínimo de perguntas, sem forçar a venda.",
  stages: ["discovery", "interest", "qualification", "consideration", "objection", "negotiation", "purchase", "post_sale", "reactivation"],
  actions: ["answer_question", "ask_question", "show_catalog", "show_product", "show_service", "send_company_contact", "request_customer_contact", "send_location", "send_media", "recommend_product", "compare_products", "qualify_budget", "qualify_need", "qualify_timing", "handle_objection", "propose_visit", "propose_call", "create_follow_up", "reactivate_lead", "handoff_to_human", "close_sale"],
  principles: [
    "Pedido explícito vem antes da qualificação; uma pergunta só quando altera uma decisão.",
    "Não repetir perguntas respondidas, descrições do anúncio ou instruções internas.",
    "Interesse não é qualificação; checkout não é venda; pedido registado não é enviado ou aceite.",
    "Negociação apenas dentro dos limites aprovados; nenhuma escassez, desconto ou disponibilidade inventada.",
    "Recusa de contacto não recusa compra; controlo humano prevalece.",
  ],
  objections: {
    price: "Esclarecer valor total versus valor percebido, usando factos e alternativas aprovadas.",
    trust: "Usar apenas provas aprovadas; reconhecer o que não pode verificar.",
    timing: "Respeitar o prazo do visitante, sem urgência artificial.",
    comparison: "Comparar diferenças verificáveis relevantes para os critérios declarados.",
    need: "Esclarecer resultado pretendido, sem pressionar.",
    location: "Confirmar apenas localização autorizada e compreender o requisito.",
    conditions: "Explicar condições aprovadas, sem concessões inventadas.",
    other: "Reconhecer a dúvida e esclarecer uma questão concreta.",
  },
  examples: [
    { trigger: "Interessante", good: "Descobrir o critério relevante à oferta, sem pedir logo orçamento.", bad: "Podemos continuar por aqui." },
    { trigger: "Quero comprar", good: "Avançar para uma compra disponível.", bad: "Pedir finalidade, orçamento e telefone." },
    { trigger: "Tem mais imagens?", good: "Entregar galeria associada ou explicar lacuna.", bad: "Reenviar o anúncio como nova imagem." },
  ],
  completion: "Apenas evidência de encomenda paga confirma pagamento; nunca uma declaração ou inferência.",
} as const;

export interface ConversationInterpretation {
  intent: string;
  need: string | null;
  urgency: string | null;
  objection: keyof typeof SALES_CONVERSATION_SKILL.objections | null;
  evidence: string[];
}
export interface ConversationPlan {
  decision: NonNullable<LeadCommercialMemory["salesDecision"]>;
  nextAction: SalesNextAction;
  instructions: string;
}

/** Resolve deictic references only when one server-known candidate is visible. */
export function resolveConversationReference(message: string, candidates: string[], catalog: string[], mediaKind?: "image" | "video"): string {
  const unique = [...new Set(candidates)].filter(name => catalog.includes(name));
  if (unique.length !== 1) return message;
  const name = unique[0]!;
  if (/^(?:quero|fico com|pode ser)\s+(?:esse|essa|este|esta)(?:\s+(?:produto|opção|opcao))?[.! ]*$/i.test(message.trim())) return `Quero comprar ${name}`;
  if (/^quanto custa (?:esse|essa|este|esta)[?! .]*$/i.test(message.trim())) return `Quanto custa ${name}?`;
  if (mediaKind && /^(?:manda|envia|mostra)[- ](?:as|os)[.! ]*$/i.test(message.trim())) return `Quero ${mediaKind === "image" ? "fotos" : "vídeo"} de ${name}`;
  return message;
}

/** The same validated plan is used regardless of provider availability. */
export async function generatePlannedConversation<T>(
  plan: ConversationPlan,
  generate: (instructions: string) => Promise<T | null>,
  fallback: () => T,
): Promise<{ value: T; failed: boolean }> {
  try {
    const value = await generate(plan.instructions);
    if (value) return { value, failed: false };
  } catch {
    // A provider outage cannot reinterpret the turn or run another effect.
  }
  return { value: fallback(), failed: true };
}

export function planSalesConversation(input: {
  message: string; memory: LeadCommercialMemory; interpretation?: ConversationInterpretation | null;
  strategy: SalesStrategyConfig; contactStatus: LeadContactConsentStatus;
  offerings: string[]; hasCatalog: boolean; hasWhatsApp: boolean; paid: boolean; pending: boolean;
  welcome?: boolean; resourceCount?: number; resourceRequested?: boolean; requestRegistered?: boolean;
}): ConversationPlan {
  const explicit = commercialIntent(input.message, input.offerings);
  // Model interpretation may refine ambiguity, never override an explicit instruction.
  const supported = ["information", "price", "objection", "explore", "compare", "alternative", "research"];
  const intent = explicit === "information" && supported.includes(input.interpretation?.intent ?? "")
    ? input.interpretation!.intent : explicit;
  const evidence = (input.interpretation?.evidence ?? []).filter(text =>
    text.length > 0 && input.message.toLowerCase().includes(text.toLowerCase())).slice(0, 5);
  const quoted = (value: string | null | undefined) =>
    value && input.message.toLowerCase().includes(value.toLowerCase()) ? value.slice(0, 300) : null;
  const memory = input.memory;
  const actionMessage = intent !== explicit ? ({
    compare: "Quero comparar", explore: "Mostra o catálogo", alternative: "Quero alternativas",
    research: "Só estou a pesquisar", price: "Quanto custa?", objection: "Está caro",
  } as Record<string,string>)[intent] ?? input.message : input.message;
  const nextAction = chooseNextAction({
    memory, strategy: input.strategy, contactStatus: input.contactStatus,
    hasPaidOrder: input.paid, hasPendingOrder: input.pending, hasCatalog: input.hasCatalog,
    hasWhatsApp: input.hasWhatsApp, currentMessage: actionMessage, offeringNames: input.offerings,
  });
  const objection = intent === "objection" ? input.interpretation?.objection ?? "other" : null;
  const stage = intent === "post_sale" ? "post_sale" : intent === "purchase" ? "purchase"
    : objection ? "objection" : ["compare", "alternative"].includes(intent) ? "consideration"
      : input.welcome ? "discovery" : /interessante|gostei/i.test(input.message) ? "interest"
        : quoted(input.interpretation?.need) ? "qualification" : "discovery";
  let action = input.requestRegistered ? "handoff_to_human"
    : input.resourceCount ? "send_media"
      : input.resourceRequested ? "ask_question"
        : objection ? "handle_objection"
          : nextAction.type === "catalog" ? intent === "compare" ? "compare_products" : "show_catalog"
            : nextAction.type === "checkout" ? "show_product"
              : nextAction.type === "whatsapp" ? "send_company_contact"
                : nextAction.type === "visit_request" ? "propose_visit"
                  : nextAction.type === "owner_handoff" ? "handoff_to_human" : "answer_question";
  if (action === "answer_question" && (input.welcome || stage === "interest")) {
    action = memory.salesDecision?.need ? "ask_question" : "qualify_need";
  }
  if (memory.humanControl === "owner") action = "none";
  const reason = input.requestRegistered ? "Pedido interno persistido; sem confirmação de envio ou leitura."
    : input.resourceCount ? "Recursos aprovados entregues pela aplicação."
      : input.resourceRequested ? "Recurso indisponível; pedir autorização para registar solicitação."
        : objection ? SALES_CONVERSATION_SKILL.objections[objection]
          : action === "qualify_need" ? "Descobrir o uso ou resultado pretendido para orientar a oferta, sem começar pelo orçamento."
            : nextAction.reason;
  const missingData = memory.missingData.filter(q => !commercialQuestionAnswered(q, memory.answeredQuestions)).slice(0, 5);
  const paymentConfirmation = intent === "post_sale" && input.paid && /paguei|pagamento/i.test(input.message) && !/reembolso|devolu/i.test(input.message);
  if (paymentConfirmation) action = "close_sale";
  const decision: ConversationPlan["decision"] = {
    version: SALES_CONVERSATION_SKILL.version, stage, intent, action, reason, evidence, missingData, objection,
    need: quoted(input.interpretation?.need) ?? memory.salesDecision?.need ?? null,
    urgency: quoted(input.interpretation?.urgency) ?? memory.salesDecision?.urgency ?? null,
    interest: intent === "purchase" ? "explicit_purchase" : "unqualified",
    outcome: input.requestRegistered ? "request_registered" : input.resourceCount ? "resources_available"
      : paymentConfirmation ? "payment_confirmed" : "response_planned",
    updatedAt: new Date().toISOString(),
  };
  return { decision, nextAction, instructions: [
    JSON.stringify(SALES_CONVERSATION_SKILL),
    "DECISÃO VALIDADA PELO SERVIDOR. Gera linguagem para esta decisão, não escolhas outra acção:",
    JSON.stringify(decision),
    "Só o pedido marcado request_registered foi registado. Uma CTA é apenas uma opção, não uma operação realizada.",
    "Não digas 'aprovado', 'qualificação', 'sem repetir o anúncio' ou outros rótulos internos ao cliente.",
    "Responde primeiro ao pedido. Não termines com 'alguma dúvida?'. Faz no máximo uma pergunta se permitir decidir o próximo passo.",
    "Se for entrada por anúncio, reconhece brevemente o assunto e orienta descoberta específica ao sector sem copiar o título.",
    objection ? SALES_CONVERSATION_SKILL.objections[objection] : "",
  ].join("\n") };
}