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
  recoveryCode?: string;
}

export interface ReplitAuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export interface ReplitAuthResponse {
  user: ReplitAuthUser | null;
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

export function recoverUserAccess(data: { phone: string; recoveryCode: string; pin: string }) {
  return authFetch("/user-auth/recover", { method: "POST", body: JSON.stringify(data) });
}

export async function generateRecoveryCode(token: string): Promise<{ recoveryCode: string }> {
  const res = await fetch(`${API_BASE}/user-auth/recovery-code`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { recoveryCode?: string; error?: string };
  if (!res.ok || !body.recoveryCode) {
    throw new Error(body.error ?? "Não foi possível gerar o código de recuperação");
  }
  return { recoveryCode: body.recoveryCode };
}

export async function getReplitAuth(): Promise<ReplitAuthResponse> {
  const res = await fetch(`${API_BASE}/auth/user`, { credentials: "include" });
  if (!res.ok) throw new Error("Não foi possível verificar a sessão");
  return res.json() as Promise<ReplitAuthResponse>;
}

export function beginReplitLogin(returnTo = window.location.pathname + window.location.search): void {
  const target = `${API_BASE}/login?returnTo=${encodeURIComponent(returnTo)}`;
  window.location.assign(target);
}

export function beginReplitLogout(returnTo = "/"): void {
  const target = `${API_BASE}/logout?returnTo=${encodeURIComponent(returnTo)}`;
  window.location.assign(target);
}

export async function createLocalSessionFromReplit(): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/user-auth/session`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const body = (await res.json()) as { user?: AuthUser; token?: string; error?: string; needsLink?: boolean };
  if (!res.ok) {
    const error = new Error(body.error ?? "Não foi possível abrir a conta");
    if (body.needsLink) (error as Error & { code?: string }).code = "needs_link";
    throw error;
  }
  return body as AuthResponse;
}

export async function linkReplitAccount(data: { phone: string; pin: string }): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/user-auth/link-replit`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = (await res.json()) as { user?: AuthUser; token?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Não foi possível ligar a conta");
  return body as AuthResponse;
}

export async function provisionReplitAccount(): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/user-auth/provision`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const body = (await res.json()) as { user?: AuthUser; token?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Não foi possível criar o espaço");
  return body as AuthResponse;
}

export async function userLogout(token: string) {
  await fetch(`${API_BASE}/user-auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteUserAccount(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/user-auth/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Não foi possível eliminar a conta");
}

/** Resolve a private object path using the same artifact-aware API base as uploads. */
export function getStorageObjectUrl(objectPath: string): string {
  if (objectPath.startsWith("http://") || objectPath.startsWith("https://")) return objectPath;
  const legacyMarker = "/api/objects/";
  const legacyIndex = objectPath.indexOf(legacyMarker);
  if (legacyIndex >= 0) {
    return `${API_BASE}/storage/objects/${objectPath.slice(legacyIndex + legacyMarker.length)}`;
  }
  if (objectPath.startsWith("/api/") || objectPath.includes("/api/")) return objectPath;
  if (objectPath.startsWith("/storage/objects/")) return `${API_BASE}${objectPath}`;
  return `${API_BASE}/storage${objectPath}`;
}

/** Legacy public profile lookup kept for compatibility with older clients. */
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
  analyticsKey?: string;
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
  avatarUrl: string | null;
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
  avatarUrl?: string | null;
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
    credentials: "include",
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

export type CampaignPlatform = "google" | "instagram" | "facebook" | "tiktok" | "meta";
export type CampaignStatus = "rascunho" | "ativa" | "pausada" | "encerrada";
export type CampaignObjective = "awareness" | "traffic" | "engagement" | "lead_generation" | "leads" | "sales";
export type CampaignDestination = "whatsapp" | "download_app" | "linkealls_chat" | "catalog" | "product";
export type CampaignImageVariant = "original" | "suggested";
export type CampaignPolicyStatus = "approved" | "needs_review" | "rejected";

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

export type CampaignPaymentStatus = "nao_pago" | "pendente" | "pago" | "falhado";
export type CampaignCreativeStatus = "nenhum" | "a_gerar" | "pronto" | "erro";
export type CampaignPublishStatus =
  | "nao_publicada" | "a_publicar" | "em_revisao" | "ativa"
  | "pausada" | "encerrada" | "rejeitada" | "erro";

export interface AdCreative {
  productNames: string[];
  headline: string;
  body: string;
  callToAction: string;
  mediaType: "image" | "video";
  mediaUrl: string;
  concept: string;
  generatedAt: string;
}

export interface CampaignSetup {
  destination?: CampaignDestination;
  destinationUrl?: string | null;
  imageAnalysis?: {
    summary: string;
    detectedText: string[];
    detectedObjects: string[];
    policyStatus: CampaignPolicyStatus;
    policyIssues: string[];
    policyVersion: string;
    reviewedAt: string;
  } | null;
  aiRecommendation?: {
    audienceReason: string;
    budgetReason: string;
    expectedReach: string;
    expectedReturn: string;
    recommendedBudgetAoa: number;
  } | null;
  audience: {
    location: string;
    locationId: string | null;
    ageMin: number;
    ageMax: number;
    gender: "all" | "female" | "male";
    interests: string;
    interestIds: string[];
    excludedAudiences: string;
  };
  creative: {
    source: "upload" | "gemini";
    referenceImagePath: string | null;
    mediaPath: string | null;
    mediaMimeType: string | null;
    originalMediaPath?: string | null;
    suggestedMediaPath?: string | null;
    selectedVariant?: CampaignImageVariant;
    prompt: string;
    headline: string;
    body: string;
    callToAction: "SHOP_NOW" | "LEARN_MORE" | "CONTACT_US" | "ORDER_NOW" | "GET_OFFER";
  };
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
  campaignSetup: CampaignSetup | null;
  totalSpend: number;
  durationDays: number;
  paymentStatus: CampaignPaymentStatus;
  paymentMethod: "carteira" | "multicaixa" | null;
  paidAt: string | null;
  fxRateAoaPerUsd: string | null;
  budgetUsd: string | null;
  creativeStatus: CampaignCreativeStatus;
  creativeJson: AdCreative | null;
  creativeError: string | null;
  publishStatus: CampaignPublishStatus;
  publishError: string | null;
  zernioAdId: string | null;
  publishedSimulated: number;
  syncedSpendUsd: string | null;
  syncedImpressions: number;
  syncedClicks: number;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdsQuote {
  fxRateAoaPerUsd: number;
  minBudgetAoa: number;
  budgetUsd: number;
  simulated: boolean;
}

export interface MetaTargetingSuggestion {
  id: string;
  name: string;
  key?: string;
  type: "city" | "interest";
}

export async function uploadPrivateImage(file: File, businessSlug: string): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Escolhe uma imagem PNG, JPG ou WebP");
  }
  if (file.size > 10 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 10 MB");
  const { uploadURL, objectPath } = await request<{ uploadURL: string; objectPath: string }>(
    "/storage/uploads/request-url",
    {
      method: "POST",
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type, businessSlug }),
    },
  );
  const upload = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!upload.ok) throw new Error("Não foi possível carregar a imagem");
  return objectPath;
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
  avatarUrl: string | null;
  sector: string;
  description: string;
  differentials: string[];
  offerings: Offering[];
  faq: FaqItem[];
  catalogEnabled: boolean;
  catalogSlug: string | null;
  isReady: boolean;
  hasProducts: boolean;
}

export interface CatalogAnalytics {
  catalogVisitors: number;
  productClicks: number;
  products: Array<{
    key: string;
    name: string;
    clicks: number;
  }>;
}

export function getCatalogByHandle(handle: string): Promise<CatalogData> {
  return request<CatalogData>(`/catalog/by-handle/${encodeURIComponent(handle)}`);
}

export function getCatalogBySlug(slug: string): Promise<CatalogData> {
  return request<CatalogData>(`/catalog/by-slug/${encodeURIComponent(slug)}`);
}

export function checkSlugAvailability(slug: string): Promise<{ available: boolean; reason?: string }> {
  return request(`/catalog/slug-check/${encodeURIComponent(slug)}`);
}

export async function recordCatalogEvent(data: {
  businessSlug: string;
  eventType: "view" | "click";
  offeringKey?: string;
  visitorId: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/catalog/analytics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    keepalive: true,
  });
  if (!res.ok) throw new Error("Métrica não registada");
}

// ─── Payments (Multicaixa Express) ────────────────────────────────────────────

export type OrderStatus = "pendente" | "paga" | "expirada" | "falhada";
export type OrderFulfillmentStatus = "novo" | "em_preparacao" | "pronto" | "entregue" | "cancelado";
export type OrderProofStatus = "nao_pedido" | "pendente" | "recebido" | "aprovado" | "rejeitado";

export interface OrderCheckout {
  orderId: string;
  leadId?: string | null;
  merchantTransactionId: string;
  amount: number;
  status: OrderStatus;
  /** True when the gateway is in simulation mode (no real credentials yet). */
  simulated: boolean;
}

export interface OrderPublicStatus {
  orderId: string;
  status: OrderStatus;
  amount: number;
  offeringName: string;
  quantity: number;
  merchantTransactionId: string;
  paidAt: string | null;
  fulfillmentStatus: OrderFulfillmentStatus;
  proofStatus: OrderProofStatus;
}

export interface Order {
  id: string;
  offeringName: string;
  unitPrice: string;
  quantity: number;
  amount: string;
  buyerPhone: string;
  buyerName: string | null;
  status: OrderStatus;
  leadId: string | null;
  fulfillmentStatus: OrderFulfillmentStatus;
  customerNotes: string | null;
  proofObjectPath: string | null;
  proofStatus: OrderProofStatus;
  proofSubmittedAt: string | null;
  proofReviewedAt: string | null;
  lastFollowUpAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface WalletLedgerEntry {
  id: string;
  type: "venda" | "saque" | "estorno_saque" | "ajuste";
  amount: string;
  description: string;
  createdAt: string;
}

export interface WalletData {
  balance: number;
  entries: WalletLedgerEntry[];
  payoutMin: number;
  simulation: boolean;
}

export interface OrderAnalytics {
  totalOrders: number;
  paidOrders: number;
  pendingPayments: number;
  grossSales: number;
  awaitingFollowUp: number;
  awaitingProof: number;
  averageFulfillmentHours: number | null;
  topProducts: Array<{ name: string; quantity: number; sales: number }>;
}

export interface OrderEvent {
  id: string;
  orderId: string;
  businessId: number;
  type: string;
  actor: "sistema" | "cliente" | "ia" | "dono";
  content: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface OrderTracking {
  id: string;
  offeringName: string;
  quantity: number;
  amount: string;
  status: OrderStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: Array<{
    type: string;
    actor: string;
    content: string;
    createdAt: string;
  }>;
}

export type PayoutStatus = "pendente" | "processado" | "falhado" | "revertido";

export interface Payout {
  id: string;
  amount: string;
  destinationType: "telemovel" | "iban";
  destination: string;
  status: PayoutStatus;
  error: string | null;
  createdAt: string;
}

export type SubscriptionStatus = "pendente" | "ativa" | "expirada" | "falhada";

export interface Subscription {
  id: string;
  plan: string;
  amount: string;
  status: SubscriptionStatus;
  startsAt: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface SubscriptionInfo {
  active: Subscription | null;
  pending: Subscription | null;
  history: Subscription[];
  planPrice: number;
  simulation: boolean;
}

/** SIMULATION ONLY — approve a pending charge as if paid on the phone. */
export function simulatePayment(merchantTransactionId: string, approve = true) {
  return request<{ ok: boolean }>("/payments/simulate/pay", {
    method: "POST",
    body: JSON.stringify({ merchantTransactionId, approve }),
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
    getLeadSession: (id: string) =>
      bRequest<{
        leadId: string;
        chatMessages: ChatMessage[];
        createdAt: string;
        updatedAt: string;
      }>(`/leads/${encodeURIComponent(id)}/session`),
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
      bRequest<{ reply: string; products?: Offering[] }>(`/leads/${leadId}/chat`, {
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
    getCatalogAnalytics: () =>
      bRequest<{ analytics: CatalogAnalytics }>("/catalog/analytics"),
    saveCatalogSlug: (catalogSlug: string | null) =>
      bRequest<{ profile: BusinessProfile; filled: boolean }>("/profile", {
        method: "PUT", body: JSON.stringify({ catalogSlug }),
      }),
    toggleCatalog: (catalogEnabled: boolean) =>
      bRequest<{ profile: BusinessProfile; filled: boolean }>("/profile", {
        method: "PUT", body: JSON.stringify({ catalogEnabled }),
      }),

    // Payments — public checkout (visitor)
    createOrder: (data: {
      offeringName: string;
      quantity: number;
      phone: string;
      buyerName?: string;
      leadId?: string;
      customerNotes?: string;
    }) =>
      bRequest<OrderCheckout>("/orders", { method: "POST", body: JSON.stringify(data) }),
    getOrderStatus: (orderId: string) =>
      bRequest<OrderPublicStatus>(`/orders/${orderId}/status`),
    getOrderTracking: (orderId: string, leadId: string) =>
      bRequest<{ tracking: OrderTracking }>(
        `/orders/${encodeURIComponent(orderId)}/tracking?leadId=${encodeURIComponent(leadId)}`,
      ),

    // Payments — owner
    listOrders: () =>
      bRequest<{ orders: Order[]; simulation: boolean }>("/orders"),
    getOrderAnalytics: () =>
      bRequest<{ analytics: OrderAnalytics }>("/orders/analytics"),
    getOrdersEventsUrl: () => {
      const token = sessionToken();
      return `${API_BASE}/b/${encodeURIComponent(slug)}/orders/events${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    },
    updateOrderFulfillment: (orderId: string, status: OrderFulfillmentStatus, note?: string) =>
      bRequest<{ order: Order }>(`/orders/${encodeURIComponent(orderId)}/fulfillment`, {
        method: "PATCH",
        body: JSON.stringify({ status, ...(note ? { note } : {}) }),
      }),
    reviewOrderProof: (orderId: string, status: "aprovado" | "rejeitado", note?: string) =>
      bRequest<{ order: Order }>(`/orders/${encodeURIComponent(orderId)}/proof`, {
        method: "PATCH",
        body: JSON.stringify({ status, ...(note ? { note } : {}) }),
      }),
    listOrderEvents: (orderId: string) =>
      bRequest<{ events: OrderEvent[] }>(`/orders/${encodeURIComponent(orderId)}/events`),
    requestOrderProofUrl: (orderId: string, file: Pick<File, "name" | "size" | "type">) =>
      bRequest<{ uploadURL: string; objectPath: string }>(
        `/orders/${encodeURIComponent(orderId)}/proof/request-url`,
        {
          method: "POST",
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        },
      ),
    submitOrderProof: (orderId: string, objectPath: string) =>
      bRequest<{ order: Order | null }>(`/orders/${encodeURIComponent(orderId)}/proof`, {
        method: "POST",
        body: JSON.stringify({ objectPath }),
      }),
    downloadOrderProof: async (orderId: string): Promise<Blob> => {
      const token = sessionToken();
      const res = await fetch(
        `${API_BASE}/b/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}/proof`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error("Não foi possível abrir o comprovativo");
      return res.blob();
    },
    getWallet: () =>
      bRequest<WalletData>("/wallet"),
    listPayouts: () =>
      bRequest<{ payouts: Payout[] }>("/wallet/payouts"),
    requestPayout: (data: { amount: number; destinationType: "iban"; destination: string }) =>
      bRequest<{ payout: Payout }>("/wallet/payouts", { method: "POST", body: JSON.stringify(data) }),
    reconcilePayout: (id: string) =>
      bRequest<{
        payout: Payout;
        reconciliation: "processed" | "reverted" | "pending";
      }>(`/wallet/payouts/${id}/reconcile`, { method: "POST" }),
    getSubscription: () =>
      bRequest<SubscriptionInfo>("/subscription"),
    checkoutSubscription: (phone: string) =>
      bRequest<{ subscriptionId: string; merchantTransactionId: string; amount: number; status: SubscriptionStatus; simulated: boolean }>(
        "/subscription/checkout",
        { method: "POST", body: JSON.stringify({ phone }) },
      ),
    getSubscriptionStatus: (id: string) =>
      bRequest<{ subscriptionId: string; status: SubscriptionStatus; expiresAt: string | null }>(`/subscription/${id}/status`),

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
      name: string; platform: CampaignPlatform; objective: string; budget: number; durationDays?: number;
    }) =>
      bRequest<{ campaign: Campaign }>("/campaigns", {
        method: "POST", body: JSON.stringify(data),
      }),
    updateCampaignStatus: (
      id: string,
      patch: { status?: CampaignStatus; budget?: number; totalSpend?: number; durationDays?: number; objective?: string },
    ) =>
      bRequest<{ campaign: Campaign }>(`/campaigns/${id}`, {
        method: "PATCH", body: JSON.stringify(patch),
      }),
    updateCampaignSetup: (id: string, setup: CampaignSetup) =>
      bRequest<{ campaign: Campaign }>(`/campaigns/${id}/setup`, {
        method: "PATCH", body: JSON.stringify(setup),
      }),
    deleteCampaign: (id: string) =>
      bRequest<{ deleted: boolean }>(`/campaigns/${id}`, { method: "DELETE" }),
    searchMetaLocations: (query: string) =>
      bRequest<{ results: MetaTargetingSuggestion[] }>(
        `/campaigns/targeting/locations?q=${encodeURIComponent(query)}`,
      ),
    searchMetaInterests: (query: string) =>
      bRequest<{ results: MetaTargetingSuggestion[] }>(
        `/campaigns/targeting/interests?q=${encodeURIComponent(query)}`,
      ),
    generateCampaignKit: (id: string) =>
      bRequest<{ campaign: Campaign }>(`/campaigns/${id}/generate`, { method: "POST" }),
    analyzeCampaignImage: (id: string) =>
      bRequest<{ recommendations: {
        audience: CampaignSetup["audience"];
        description: { headline: string; body: string; prompt: string; callToAction: string };
        budget: { recommendedBudgetAoa: number; expectedReach: string; expectedReturn: string; budgetReason: string };
        audienceReason: string;
        imageAnalysis: NonNullable<CampaignSetup["imageAnalysis"]>;
        suggestedImagePath: string | null;
      } }>(`/campaigns/${id}/ai-recommendations`, { method: "POST" }),
    getCampaignMetrics: (id: string) =>
      bRequest<{ metrics: CampaignMetrics }>(`/campaigns/${id}/metrics`),
    getCampaignOptimizations: (id: string) =>
      bRequest<{ suggestions: string[] }>(`/campaigns/${id}/optimize`),
    duplicateCampaign: (id: string) =>
      bRequest<{ campaign: Campaign }>(`/campaigns/${id}/duplicate`, { method: "POST" }),
    getAdsQuote: (budget: number) =>
      bRequest<AdsQuote>(`/campaigns/ads/quote?budget=${budget}`),
    payCampaign: (id: string, data: { method: "carteira" } | { method: "multicaixa"; phone: string }) =>
      bRequest<{ campaign: Campaign }>(`/campaigns/${id}/pay`, {
        method: "POST", body: JSON.stringify(data),
      }),
    generateCampaignCreative: (id: string) =>
      bRequest<{ campaign: Campaign }>(`/campaigns/${id}/creative`, { method: "POST" }),
    publishCampaign: (id: string) =>
      bRequest<{ campaign: Campaign }>(`/campaigns/${id}/publish`, { method: "POST" }),
    controlCampaignAd: (id: string, action: "pause" | "resume" | "end") =>
      bRequest<{ campaign: Campaign }>(`/campaigns/${id}/control`, {
        method: "POST", body: JSON.stringify({ action }),
      }),

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
