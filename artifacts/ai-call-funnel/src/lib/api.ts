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

/** Public: real display name for a user handle (used by /u/:handle). */
export async function getPublicUserProfile(
  handle: string,
): Promise<{ name: string; handle: string }> {
  const res = await fetch(`${API_BASE}/user-auth/public/${encodeURIComponent(handle)}`);
  if (!res.ok) throw new Error("Utilizador não encontrado");
  return res.json() as Promise<{ name: string; handle: string }>;
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
  // Contact & location
  address: string | null;
  hours: string | null;
  phone: string | null;
  email: string | null;
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
  address?: string | null;
  hours?: string | null;
  phone?: string | null;
  email?: string | null;
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
  /** user = visitor, bot = AI, agent = business owner replying manually */
  role: "user" | "bot" | "agent";
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

/** Session token stored by AuthContext — attached to every API request so
 *  owner-only routes can authenticate the caller. */
function sessionToken(): string | null {
  try {
    return localStorage.getItem("user_token");
  } catch {
    return null;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = sessionToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
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

// ─── Catalog API ──────────────────────────────────────────────────────────────

export interface CatalogData {
  businessSlug: string | null;
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

export function getCatalogBySlug(slug: string): Promise<CatalogData> {
  return request<CatalogData>(`/catalog/by-slug/${encodeURIComponent(slug)}`);
}

export function checkSlugAvailability(slug: string): Promise<{ available: boolean; reason?: string }> {
  return request(`/catalog/slug-check/${encodeURIComponent(slug)}`);
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
    getLeadsEventsUrl: () => {
      const t = sessionToken();
      return `${API_BASE}/b/${encodeURIComponent(slug)}/leads/events${t ? `?token=${encodeURIComponent(t)}` : ""}`;
    },
    sendLeadChat: (leadId: string, message: string) =>
      bRequest<{ reply: string }>(`/leads/${leadId}/chat`, {
        method: "POST", body: JSON.stringify({ message }),
      }),
    ownerReplyToLead: (leadId: string, message: string) =>
      bRequest<{ lead: Lead }>(`/leads/${leadId}/owner-reply`, {
        method: "POST", body: JSON.stringify({ message }),
      }),
    getLeadsAnalytics: () =>
      bRequest<{ analytics: LeadsAnalytics }>("/leads/analytics"),

    // Catalog
    getCatalog: () =>
      bRequest<CatalogData>("/catalog"),
    saveCatalogSlug: (catalogSlug: string | null) =>
      bRequest<{ profile: BusinessProfile; filled: boolean }>("/profile", {
        method: "PUT", body: JSON.stringify({ catalogSlug }),
      }),
    toggleCatalog: (catalogEnabled: boolean) =>
      bRequest<{ profile: BusinessProfile; filled: boolean }>("/profile", {
        method: "PUT", body: JSON.stringify({ catalogEnabled }),
      }),

    // Assistant proactive triggers
    triggerDailySummary: () =>
      bRequest<{ message: AssistantMessage }>("/assistant/proactive/daily", { method: "POST" }),
    triggerStaleLeadsCheck: () =>
      bRequest<{ message: AssistantMessage | null; found: boolean }>("/assistant/proactive/stale", { method: "POST" }),

    // Notifications (web push)
    getVapidPublicKey: () =>
      bRequest<{ vapidPublicKey: string }>("/notifications/vapid-key"),
    subscribePush: (subscription: unknown) =>
      bRequest<{ subscribed: boolean }>("/notifications/subscribe", {
        method: "POST", body: JSON.stringify(subscription),
      }),
    unsubscribePush: (endpoint: string) =>
      bRequest<{ unsubscribed: boolean }>("/notifications/subscribe", {
        method: "DELETE", body: JSON.stringify({ endpoint }),
      }),

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
    getAssistantEventsUrl: () => {
      const t = sessionToken();
      return `${API_BASE}/b/${encodeURIComponent(slug)}/assistant/events${t ? `?token=${encodeURIComponent(t)}` : ""}`;
    },
  };
}
