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

// ─── User Auth ───────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  phone: string;
  name: string;
  handle: string | null;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

async function authFetch(path: string, opts: RequestInit): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  const body = (await res.json()) as unknown;
  const data = body as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) ?? "Erro desconhecido");
  return body as AuthResponse;
}

export function userRegister(data: { phone: string; name: string; pin: string }) {
  return authFetch("/user-auth/register", { method: "POST", body: JSON.stringify(data) });
}

export function userLogin(data: { phone: string; pin: string }) {
  return authFetch("/user-auth/login", { method: "POST", body: JSON.stringify(data) });
}

export async function userLogout(token: string) {
  await fetch(`${API_BASE}/user-auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function checkHandleAvailability(
  handle: string,
): Promise<{ available: boolean; reason?: string }> {
  const res = await fetch(
    `${API_BASE}/user-auth/handle/check?handle=${encodeURIComponent(handle)}`,
  );
  if (!res.ok) throw new Error(`Erro do servidor (${res.status})`);
  return res.json() as Promise<{ available: boolean; reason?: string }>;
}

export async function setUserHandle(
  handle: string,
  token: string,
): Promise<{ user: AuthUser }> {
  const res = await fetch(`${API_BASE}/user-auth/handle`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ handle }),
  });
  const body = (await res.json()) as { user?: AuthUser; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Erro ao guardar handle");
  return body as { user: AuthUser };
}

// ─── Business Profile ────────────────────────────────────────────────────────

export interface Offering {
  name: string;
  description: string;
  price: string;
  imageUrl?: string;
  /** Whether this product is highlighted in the public catalog (max 3). */
  featured?: boolean;
  /** Display order in the catalog (lower = first). */
  sortOrder?: number;
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
  catalogEnabled: boolean;
  catalogSlug: string | null;
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

/**
 * Visitor sends a text message after the call flow started.
 * Returns Gemini's reply (already persisted in the lead record).
 */
export function sendLeadChat(
  leadId: string,
  message: string,
): Promise<{ reply: string }> {
  return request(`/leads/${leadId}/chat`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
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

export function duplicateCampaign(id: string): Promise<{ campaign: Campaign }> {
  return request(`/campaigns/${id}/duplicate`, { method: "POST" });
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

export function getLeadsAnalytics(): Promise<{ analytics: LeadsAnalytics }> {
  return request("/leads/analytics");
}

// ─── Catalog API ──────────────────────────────────────────────────────────────

export interface CatalogData {
  name: string;
  sector: string;
  description: string;
  differentials: string[];
  offerings: Offering[];
  faq: FaqItem[];
  catalogEnabled: boolean;
  catalogSlug: string | null;
  isReady: boolean;
}

export function getCatalog(): Promise<CatalogData> {
  return request<CatalogData>("/catalog");
}

export function getCatalogBySlug(slug: string): Promise<CatalogData> {
  return request<CatalogData>(`/catalog/by-slug/${encodeURIComponent(slug)}`);
}

export function checkSlugAvailability(slug: string): Promise<{ available: boolean; reason?: string }> {
  return request(`/catalog/slug-check/${encodeURIComponent(slug)}`);
}

export function saveCatalogSlug(slug: string | null): Promise<{ profile: BusinessProfile; filled: boolean }> {
  return request("/business-profile", {
    method: "PUT",
    body: JSON.stringify({ catalogSlug: slug }),
  });
}

/** Toggle the public catalog on/off.
 *  Reuses PUT /business-profile so it goes through the same owner-controlled
 *  write path as all other profile mutations (consistent auth surface). */
export function toggleCatalog(enabled: boolean): Promise<{ profile: BusinessProfile; filled: boolean }> {
  return request("/business-profile", {
    method: "PUT",
    body: JSON.stringify({ catalogEnabled: enabled }),
  });
}

// ─── Business-scoped API factory ──────────────────────────────────────────────

/**
 * Returns an API client with all calls scoped to a specific business slug
 * via the /api/b/:slug/ routes.  Use this in multi-tenant pages that read
 * the slug from the URL (useBusinessSlug).
 */
export function businessApi(slug: string) {
  function bRequest<T>(path: string, init?: RequestInit): Promise<T> {
    return request<T>(`/b/${encodeURIComponent(slug)}${path}`, init);
  }

  return {
    slug,

    // Profile
    getProfile: () =>
      bRequest<{ profile: BusinessProfile; filled: boolean }>("/profile"),
    saveProfile: (patch: ProfileDraft) =>
      bRequest<{ profile: BusinessProfile; filled: boolean }>("/profile", {
        method: "PUT", body: JSON.stringify(patch),
      }),
    startAnalysis: (url: string) =>
      bRequest<{ started: boolean }>("/profile/analyze", {
        method: "POST", body: JSON.stringify({ url }),
      }),
    assistFromDescription: (description: string) =>
      bRequest<{ draft: ProfileDraft }>("/profile/assist", {
        method: "POST", body: JSON.stringify({ description }),
      }),

    // Auth / PIN
    getPinStatus: () =>
      bRequest<{ hasPin: boolean }>("/auth/pin/status"),
    verifyPin: (pin: string) =>
      bRequest<{ ok: boolean; noPin?: boolean }>("/auth/pin/verify", {
        method: "POST", body: JSON.stringify({ pin }),
      }),
    setPin: (pin: string, currentPin?: string) =>
      bRequest<{ ok: boolean; error?: string }>("/auth/pin/set", {
        method: "POST", body: JSON.stringify({ pin, ...(currentPin ? { currentPin } : {}) }),
      }),

    // Leads
    createLeadSession: (origin: LeadOrigin, chatMessages: ChatMessage[]) =>
      bRequest<{ leadId: string }>("/leads/session", {
        method: "POST", body: JSON.stringify({ origin, chatMessages }),
      }),
    listLeads: () =>
      bRequest<{ leads: Lead[] }>("/leads"),
    getLeadDetail: (id: string) =>
      bRequest<{ lead: Lead }>(`/leads/${id}`),
    updateLeadState: (id: string, state: LeadState) =>
      bRequest<{ lead: Lead }>(`/leads/${id}/state`, {
        method: "PATCH", body: JSON.stringify({ state }),
      }),
    getLeadsEventsUrl: () =>
      `${API_BASE}/b/${encodeURIComponent(slug)}/leads/events`,
    sendLeadChat: (leadId: string, message: string) =>
      bRequest<{ reply: string }>(`/leads/${leadId}/chat`, {
        method: "POST", body: JSON.stringify({ message }),
      }),
    getLeadsAnalytics: () =>
      bRequest<{ analytics: LeadsAnalytics }>("/leads/analytics"),

    // Catalog
    getCatalog: () =>
      bRequest<CatalogData>("/catalog"),

    // Campaigns
    listCampaigns: () =>
      bRequest<{ campaigns: Campaign[] }>("/campaigns"),
    getCampaignById: (id: string) =>
      bRequest<{ campaign: Campaign }>(`/campaigns/${id}`),
    createCampaign: (data: {
      name: string; platform: CampaignPlatform; objective: string; budget: number;
    }) =>
      bRequest<{ campaign: Campaign }>("/campaigns", {
        method: "POST", body: JSON.stringify(data),
      }),
    updateCampaignStatus: (
      id: string,
      patch: { status?: CampaignStatus; budget?: number; totalSpend?: number },
    ) =>
      bRequest<{ campaign: Campaign }>(`/campaigns/${id}`, {
        method: "PATCH", body: JSON.stringify(patch),
      }),
    generateCampaignKit: (id: string) =>
      bRequest<{ campaign: Campaign }>(`/campaigns/${id}/generate`, { method: "POST" }),
    getCampaignMetrics: (id: string) =>
      bRequest<{ metrics: CampaignMetrics }>(`/campaigns/${id}/metrics`),
    getCampaignOptimizations: (id: string) =>
      bRequest<{ suggestions: string[] }>(`/campaigns/${id}/optimize`),
    duplicateCampaign: (id: string) =>
      bRequest<{ campaign: Campaign }>(`/campaigns/${id}/duplicate`, { method: "POST" }),

    // Assistant
    listAssistantMessages: () =>
      bRequest<{ messages: AssistantMessage[] }>("/assistant/messages"),
    sendAssistantMessage: (message: string) =>
      bRequest<{ message: AssistantMessage }>("/assistant/chat", {
        method: "POST", body: JSON.stringify({ message }),
      }),
    confirmAssistantAction: (messageId: string, confirmed: boolean) =>
      bRequest<{ message: AssistantMessage }>("/assistant/confirm", {
        method: "POST", body: JSON.stringify({ messageId, confirmed }),
      }),
    clearAssistantMessages: () =>
      bRequest<{ cleared: boolean }>("/assistant/messages", { method: "DELETE" }),
    getAssistantEventsUrl: () =>
      `${API_BASE}/b/${encodeURIComponent(slug)}/assistant/events`,
  };
}
