/**
 * API access helpers.
 *
 * In dev, requests must stay under the artifact base path (e.g.
 * /ai-call-funnel/api/...) so they reach the Vite dev server, whose proxy
 * forwards them to the API server. In production, the deployment proxy routes
 * root /api/* directly to the API server.
 */
const API_BASE = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}api`
  : "/api";

export interface Offering {
  name: string;
  description: string;
  price: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export type AnalysisStatus = "idle" | "running" | "done" | "error";

export interface BusinessProfile {
  id: number;
  name: string;
  websiteUrl: string | null;
  sector: string;
  description: string;
  targetAudience: string;
  toneOfVoice: string;
  differentials: string[];
  offerings: Offering[];
  faq: FaqItem[];
  qualificationGoals: string[];
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  lastAnalyzedAt: string | null;
}

export interface ProfileDraft {
  name?: string;
  sector?: string;
  description?: string;
  targetAudience?: string;
  toneOfVoice?: string;
  differentials?: string[];
  offerings?: Offering[];
  faq?: FaqItem[];
  qualificationGoals?: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok) {
    throw new Error(body?.error ?? `Erro do servidor (${res.status})`);
  }
  if (body === null) throw new Error("Resposta inválida do servidor");
  return body;
}

export function getBusinessProfile() {
  return request<{ profile: BusinessProfile; filled: boolean }>(
    "/business-profile",
  );
}

export function saveBusinessProfile(patch: ProfileDraft) {
  return request<{ profile: BusinessProfile; filled: boolean }>(
    "/business-profile",
    { method: "PUT", body: JSON.stringify(patch) },
  );
}

export function startAnalysis(url: string) {
  return request<{ started: boolean }>("/business-profile/analyze", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function assistFromDescription(description: string) {
  return request<{ draft: ProfileDraft }>("/business-profile/assist", {
    method: "POST",
    body: JSON.stringify({ description }),
  });
}
