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

// ─── Business Profile ────────────────────────────────────────────────────────

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

// ─── Leads ───────────────────────────────────────────────────────────────────

export type LeadState = "novo" | "em_atendimento" | "qualificado" | "entregue" | "perdido";

export interface LeadOrigin {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  url?: string;
}

export interface ChatMessage {
  role: "user" | "bot";
  text: string;
  ts: string;
}

export interface QualificationData {
  name?: string;
  phone?: string;
  email?: string;
  interest?: string;
  budget?: string;
  timeline?: string;
  location?: string;
  extras?: Record<string, string>;
}

export interface Lead {
  id: string;
  state: LeadState;
  origin: LeadOrigin;
  chatMessages: ChatMessage[];
  callTranscript: string | null;
  qualificationData: QualificationData;
  aiSummary: string | null;
  score: number | null;
  whatsappMessage: string | null;
  callEndedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

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

// ─── Business profile API ────────────────────────────────────────────────────

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

// ─── Leads API ───────────────────────────────────────────────────────────────

export function createLeadSession(
  origin: LeadOrigin,
  chatMessages: ChatMessage[],
): Promise<{ leadId: string }> {
  return request("/leads/session", {
    method: "POST",
    body: JSON.stringify({ origin, chatMessages }),
  });
}

export function listLeads(): Promise<{ leads: Lead[] }> {
  return request("/leads");
}

export function getLeadDetail(id: string): Promise<{ lead: Lead }> {
  return request(`/leads/${id}`);
}

export function updateLeadState(
  id: string,
  state: LeadState,
): Promise<{ lead: Lead }> {
  return request(`/leads/${id}/state`, {
    method: "PATCH",
    body: JSON.stringify({ state }),
  });
}

/** Returns the full SSE URL (used directly with EventSource). */
export function getLeadsEventsUrl(): string {
  return `${API_BASE}/leads/events`;
}

// ─── Assistant API ────────────────────────────────────────────────────────────

export type AssistantRole = "user" | "assistant" | "proactive";

export interface AssistantMessageMeta {
  pendingAction?: {
    type: "update_lead_state";
    leadId: string;
    newState: string;
    description: string;
  };
  draftMessage?: string;
  proactiveType?: "lead_qualified" | "stale_leads" | "daily_summary";
  leadId?: string;
}

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  meta: AssistantMessageMeta;
  createdAt: string;
}

export function listAssistantMessages(): Promise<{ messages: AssistantMessage[] }> {
  return request("/assistant/messages");
}

export function sendAssistantMessage(
  message: string,
): Promise<{ message: AssistantMessage }> {
  return request("/assistant/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function confirmAssistantAction(
  messageId: string,
  confirmed: boolean,
): Promise<{ message: AssistantMessage }> {
  return request("/assistant/confirm", {
    method: "POST",
    body: JSON.stringify({ messageId, confirmed }),
  });
}

export function clearAssistantMessages(): Promise<{ cleared: boolean }> {
  return request("/assistant/messages", { method: "DELETE" });
}

export function triggerDailySummary(): Promise<{ message: AssistantMessage }> {
  return request("/assistant/proactive/daily", { method: "POST" });
}

export function triggerStaleLeadsCheck(): Promise<{ message: AssistantMessage | null; found: boolean }> {
  return request("/assistant/proactive/stale", { method: "POST" });
}

export function getAssistantEventsUrl(): string {
  return `${API_BASE}/assistant/events`;
}

// ─── Campaigns API ────────────────────────────────────────────────────────────

export type CampaignPlatform = "google" | "instagram" | "facebook" | "tiktok";
export type CampaignStatus = "rascunho" | "ativa" | "pausada" | "encerrada";

export interface CampaignCopy {
  headline: string;
  body: string;
  cta: string;
}

export interface CampaignKit {
  audience: {
    demographics: string;
    interests: string;
    behaviours: string;
    excludedAudiences: string;
  };
  budgetAllocation: {
    suggestion: string;
    dailyBudget: string;
    bidStrategy: string;
  };
  copies: CampaignCopy[];
  creativeBrief: {
    format: string;
    visualConcept: string;
    doList: string[];
    dontList: string[];
  };
  segmentationTips: string[];
  estimatedReach: string;
  keyMetricsToTrack: string[];
  generatedAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  platform: CampaignPlatform;
  objective: string;
  budget: number;
  status: CampaignStatus;
  utmSlug: string;
  kitJson: CampaignKit | null;
  totalSpend: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMetrics {
  campaignId: string;
  totalLeads: number;
  qualifiedLeads: number;
  deliveredLeads: number;
  qualificationRate: number;
  avgScore: number | null;
  totalSpend: number;
  costPerLead: number | null;
  costPerQualifiedLead: number | null;
  captationUrl: string;
}

export function listCampaigns(): Promise<{ campaigns: Campaign[] }> {
  return request("/campaigns");
}

export function getCampaignById(id: string): Promise<{ campaign: Campaign }> {
  return request(`/campaigns/${id}`);
}

export function createCampaign(data: {
  name: string;
  platform: CampaignPlatform;
  objective: string;
  budget: number;
}): Promise<{ campaign: Campaign }> {
  return request("/campaigns", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCampaignStatus(
  id: string,
  patch: { status?: CampaignStatus; budget?: number; totalSpend?: number },
): Promise<{ campaign: Campaign }> {
  return request(`/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function generateCampaignKit(id: string): Promise<{ campaign: Campaign }> {
  return request(`/campaigns/${id}/generate`, { method: "POST" });
}

export function getCampaignMetrics(id: string): Promise<{ metrics: CampaignMetrics }> {
  return request(`/campaigns/${id}/metrics`);
}

export function getCampaignOptimizations(id: string): Promise<{ suggestions: string[] }> {
  return request(`/campaigns/${id}/optimize`);
}
