import { db, businessProfilesTable, type BusinessProfile, type UpdateBusinessProfile, type AnalysisStatus } from "@workspace/db";
import { and, eq, lt, ne, or } from "drizzle-orm";

/**
 * Single-tenant profile store pinned to one fixed row id. Insert-if-absent is
 * atomic (ON CONFLICT DO NOTHING), so concurrent first requests cannot create
 * duplicate rows, and every reader/writer targets the same deterministic row.
 */
const FIXED_PROFILE_ID = 1;

/** A "running" analysis older than this is considered crashed and re-acquirable. */
const STALE_ANALYSIS_MS = 5 * 60_000;

export async function getOrCreateProfile(): Promise<BusinessProfile> {
  await db
    .insert(businessProfilesTable)
    .values({ id: FIXED_PROFILE_ID })
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, FIXED_PROFILE_ID));
  return rows[0]!;
}

export async function updateProfile(patch: UpdateBusinessProfile): Promise<BusinessProfile> {
  await getOrCreateProfile();
  const updated = await db
    .update(businessProfilesTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(businessProfilesTable.id, FIXED_PROFILE_ID))
    .returning();
  return updated[0]!;
}

export async function setAnalysisStatus(
  status: AnalysisStatus,
  error?: string | null,
): Promise<void> {
  await getOrCreateProfile();
  await db
    .update(businessProfilesTable)
    .set({
      analysisStatus: status,
      analysisError: error ?? null,
      ...(status === "done" ? { lastAnalyzedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(businessProfilesTable.id, FIXED_PROFILE_ID));
}

/**
 * Atomically flips the profile to "running" (compare-and-set in one UPDATE).
 * Returns false when another analysis already holds the slot — unless that
 * run looks crashed (stale "running"), in which case it is taken over.
 */
export async function tryAcquireAnalysis(url: string): Promise<boolean> {
  await getOrCreateProfile();
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
        eq(businessProfilesTable.id, FIXED_PROFILE_ID),
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
    .map((o) => `- ${o.name}${o.price ? ` (${o.price})` : ""}: ${o.description}`)
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

REGRAS IMPORTANTES:
- Usa APENAS informação real do negócio acima; se não souberes, di-lo honestamente e oferece contacto posterior
- Faça UMA pergunta de cada vez
- Mantenha a conversa fluida e natural
- Aja como um consultor humano premium${profile.toneOfVoice ? `\n- TOM DE VOZ do negócio: ${profile.toneOfVoice}` : ""}
- Respostas curtas e directas (máximo 2 frases)
- Nunca liste perguntas de uma vez
- Seja caloroso e confiante

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
