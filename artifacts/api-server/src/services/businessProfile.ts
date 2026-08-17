import { db, businessProfilesTable, type BusinessProfile, type UpdateBusinessProfile, type AnalysisStatus } from "@workspace/db";
import { and, eq, lt, ne, or } from "drizzle-orm";

/**
 * Default profile ID used as a backward-compatible fallback while the platform
 * is being migrated to full multi-tenancy.  Every service function now accepts
 * an explicit `businessId` and falls back to this constant so that all existing
 * single-tenant call sites continue to work unchanged.
 */
export const FIXED_PROFILE_ID = 1;

/** A "running" analysis older than this is considered crashed and re-acquirable. */
const STALE_ANALYSIS_MS = 5 * 60_000;

// ─── Slug resolution ──────────────────────────────────────────────────────────

/** Resolve a URL slug to the full profile row; returns null when not found. */
export async function getProfileBySlug(slug: string): Promise<BusinessProfile | null> {
  const rows = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Single-profile helpers ───────────────────────────────────────────────────

export async function getOrCreateProfile(businessId: number = FIXED_PROFILE_ID): Promise<BusinessProfile> {
  await db
    .insert(businessProfilesTable)
    .values({ id: businessId })
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, businessId));
  return rows[0]!;
}

export async function updateProfile(
  patch: UpdateBusinessProfile,
  businessId: number = FIXED_PROFILE_ID,
): Promise<BusinessProfile> {
  await getOrCreateProfile(businessId);
  const updated = await db
    .update(businessProfilesTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(businessProfilesTable.id, businessId))
    .returning();
  return updated[0]!;
}

export async function setAnalysisStatus(
  status: AnalysisStatus,
  error?: string | null,
  businessId: number = FIXED_PROFILE_ID,
): Promise<void> {
  await getOrCreateProfile(businessId);
  await db
    .update(businessProfilesTable)
    .set({
      analysisStatus: status,
      analysisError: error ?? null,
      ...(status === "done" ? { lastAnalyzedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(businessProfilesTable.id, businessId));
}

/**
 * Atomically flips the profile to "running" (compare-and-set in one UPDATE).
 * Returns false when another analysis already holds the slot — unless that
 * run looks crashed (stale "running"), in which case it is taken over.
 */
export async function tryAcquireAnalysis(
  url: string,
  businessId: number = FIXED_PROFILE_ID,
): Promise<boolean> {
  await getOrCreateProfile(businessId);
  const acquired = await db
    .update(businessProfilesTable)
    .set({
      analysisStatus: "running",
      analysisError: null,
      websiteUrl: url,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(businessProfilesTable.id, businessId),
        or(
          ne(businessProfilesTable.analysisStatus, "running"),
          lt(businessProfilesTable.updatedAt, new Date(Date.now() - STALE_ANALYSIS_MS)),
        ),
      ),
    )
    .returning({ id: businessProfilesTable.id });
  return acquired.length > 0;
}

/** A profile counts as "filled" when it has at least a name. */
export function isProfileFilled(profile: BusinessProfile): boolean {
  return profile.name.trim().length > 0;
}

/**
 * Builds the call agent's system prompt from the stored profile.
 * Falls back to the generic qualification script when the profile is empty.
 */
export function buildCallAgentPrompt(profile: BusinessProfile | null): {
  systemPrompt: string;
  greetingText: string;
} {
  if (!profile || !isProfileFilled(profile)) {
    return { systemPrompt: GENERIC_PROMPT, greetingText: "inicio" };
  }

  const offerings = profile.offerings
    .map((o) => `- ${o.name}${o.price ? ` (${o.price})` : ""}${o.imageUrl ? " [TEM FOTO]" : ""}: ${o.description}`)
    .join("\n");
  const faq = profile.faq
    .map((f) => `P: ${f.question}\nR: ${f.answer}`)
    .join("\n");
  const goals = (profile.qualificationGoals.length > 0
    ? profile.qualificationGoals
    : [
        "O que a pessoa procura exatamente",
        "Qual é o orçamento aproximado",
        "O prazo de decisão",
        "A melhor forma de contacto",
      ]
  )
    .map((g, i) => `${i + 1}. ${g}`)
    .join("\n");

  const systemPrompt = `
Você é o assistente virtual de "${profile.name}"${profile.sector ? `, negócio do setor: ${profile.sector}` : ""}.
O utilizador acabou de clicar num anúncio e atendeu uma chamada da empresa.

INÍCIO DA CHAMADA: Quando receberes a mensagem "inicio", responde IMEDIATAMENTE com uma saudação curta em nome de ${profile.name} (ex.: "Alô! Daqui fala o assistente de ${profile.name}. Obrigado por atender!") e pergunta em que podes ajudar. Não acrescentes mais nada — espera que o utilizador fale.

SOBRE O NEGÓCIO:
${profile.description || "(sem descrição)"}
${profile.targetAudience ? `\nPÚBLICO-ALVO: ${profile.targetAudience}` : ""}
${profile.differentials.length > 0 ? `\nDIFERENCIAIS:\n${profile.differentials.map((d) => `- ${d}`).join("\n")}` : ""}
${offerings ? `\nPRODUTOS/SERVIÇOS E PREÇOS:\n${offerings}` : ""}
${faq ? `\nPERGUNTAS FREQUENTES:\n${faq}` : ""}

O OBJETIVO da chamada é qualificar o lead, descobrindo:
${goals}

FERRAMENTAS DISPONÍVEIS:
- show_product_catalog: usa quando o cliente perguntar sobre produtos/serviços/preços — mostra cartões visuais no ecrã do cliente ENQUANTO continuas a falar por voz
- send_text_message: usa quando o cliente pedir algo por escrito — número de telefone, morada, horário, código, link, lista de lojas. Envia o texto e CONTINUA a falar normalmente por voz. NUNCA soletre números por voz — usa sempre send_text_message para partilhar dados numéricos
- initiate_checkout: usa APENAS quando o cliente confirmar explicitamente que quer comprar UM produto específico E fornecer o número de telemóvel. Nunca uses sem nome de produto confirmado, quantidade e número de telefone. Após chamar, diz ao cliente para aprovar na app Multicaixa Express
- check_order_status: usa para verificar se o pagamento já foi aprovado — útil se o cliente perguntar "já paguei?" ou se quiseres confirmar

REGRAS IMPORTANTES:
- Usa APENAS informação real do negócio acima; se não souberes, di-lo honestamente e oferece contacto posterior
- Faça UMA pergunta de cada vez
- Mantenha a conversa fluida e natural
- Aja como um consultor humano premium${profile.toneOfVoice ? `\n- TOM DE VOZ do negócio: ${profile.toneOfVoice}` : ""}
- Respostas muito curtas e directas: máximo 2 frases faladas e cerca de 3 linhas no texto
- Quando falares de produtos, chama SEMPRE show_product_catalog antes de responder; se a ferramenta não estiver disponível, continua com uma resposta curta
- Nunca liste perguntas de uma vez
- Seja caloroso e confiante
- Após usar show_product_catalog ou send_text_message, CONTINUA SEMPRE a conversa por voz — nunca pares

RESPOND UNMISTAKABLY IN ANGOLAN PORTUGUESE. NUNCA mude de idioma.
`.trim();

  return { systemPrompt, greetingText: "inicio" };
}

const GENERIC_PROMPT = `
Você é um assistente virtual especializado em qualificação de leads.
O utilizador acabou de clicar num anúncio e atendeu uma chamada.

INÍCIO DA CHAMADA: Quando receberes a mensagem "inicio", responde IMEDIATAMENTE com:
"Alô! Obrigado por atender. Como posso ajudá-lo hoje?"
Não acrescentes nada mais — espera que o utilizador fale.

Fale em português de Angola, de forma natural, breve, profissional e acolhedora.

O objetivo é descobrir:
1. O que a pessoa procura exatamente
2. Qual é o orçamento aproximado
3. O prazo de decisão
4. A melhor forma de contacto

REGRAS IMPORTANTES:
- Faça UMA pergunta de cada vez
- Mantenha a conversa fluida e natural
- Aja como um consultor humano premium
- Respostas curtas e directas (máximo 2 frases)
- Nunca liste perguntas de uma vez
- Seja caloroso e confiante

RESPOND UNMISTAKABLY IN ANGOLAN PORTUGUESE. NUNCA mude de idioma.
`.trim();
