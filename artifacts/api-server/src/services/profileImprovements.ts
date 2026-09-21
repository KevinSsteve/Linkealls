import {
  db,
  businessProfilesTable,
  leadsTable,
  profileChangeProposalTable,
  profileImprovementAuditTable,
  resourceRequestsTable,
  resourceLibraryTable,
  resourceUploadsTable,
  resourceDeliveryAuditTable,
  profileChangeProposalInputSchema,
  resourceRequestInputSchema,
  resourceInputSchema,
  updateBusinessProfileSchema,
  type BusinessProfile,
  type ProfileChangeProposal,
  type ResourceRequest,
  type ResourceLibraryItem,
  type ProfileImprovementField,
} from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

const DENIED_PATH = /(wallet|payment|payout|refund|sale|order|subscription|campaign|fund|publish)/i;
export class ProfileImprovementError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

function assertField(fieldPath: string): ProfileImprovementField {
  if (DENIED_PATH.test(fieldPath) || !profileChangeProposalInputSchema.shape.fieldPath.safeParse(fieldPath).success) {
    throw new ProfileImprovementError("FIELD_NOT_ALLOWED", "Este campo não pode ser alterado por este fluxo.");
  }
  return fieldPath as ProfileImprovementField;
}

function currentField(profile: BusinessProfile, field: keyof BusinessProfile): unknown {
  return profile[field];
}

export async function assessProfileGaps(businessId: number): Promise<Array<{ fieldPath: string; reason: string; currentValue: unknown }>> {
  const rows = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, businessId)).limit(1);
  const profile = rows[0];
  if (!profile) throw new ProfileImprovementError("PROFILE_NOT_FOUND", "Perfil não encontrado.");
  const gaps: Array<{ fieldPath: string; reason: string; currentValue: unknown }> = [];
  const checks: Array<[keyof BusinessProfile, string]> = [
    ["description", "Uma descrição ajuda o visitante a perceber rapidamente o negócio."],
    ["targetAudience", "O público-alvo orienta respostas mais úteis."],
    ["websiteUrl", "Um website permite validar informação adicional."],
    ["offerings", "Sem ofertas, o catálogo e as respostas comerciais ficam incompletos."],
    ["faq", "Perguntas frequentes reduzem dúvidas repetidas."],
    ["hours", "O horário é necessário para orientar visitas e contactos."],
    ["address", "A morada ajuda visitantes que procuram atendimento presencial."],
  ];
  for (const [field, reason] of checks) {
    const value = currentField(profile, field);
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      gaps.push({ fieldPath: field, reason, currentValue: value });
    }
  }
  return gaps;
}

export async function createProfileChangeProposal(
  businessId: number,
  input: unknown,
  provenance: { source: "owner_assistant" | "owner"; sourceRef: string; model?: string } = {
    source: "owner",
    sourceRef: "owner_profile_improvement",
  },
): Promise<ProfileChangeProposal> {
  const parsed = profileChangeProposalInputSchema.safeParse(input);
  if (!parsed.success) throw new ProfileImprovementError("INVALID_PROPOSAL", "Proposta de perfil inválida.");
  const field = assertField(parsed.data.fieldPath);
  const rows = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, businessId)).limit(1);
  const profile = rows[0];
  if (!profile) throw new ProfileImprovementError("PROFILE_NOT_FOUND", "Perfil não encontrado.");
  const valueSchema = updateBusinessProfileSchema.shape[field];
  const checked = valueSchema?.safeParse(parsed.data.proposedValue);
  if (!checked?.success) throw new ProfileImprovementError("INVALID_VALUE", "O valor não é válido para este campo.");
  const inserted = await db.insert(profileChangeProposalTable).values({
    businessId, fieldPath: parsed.data.fieldPath, proposedValue: parsed.data.proposedValue,
    baseValue: currentField(profile, field), baseVersion: profile.updatedAt,
    reason: parsed.data.reason,
    source: provenance.source,
    sourceRef: provenance.sourceRef,
    preview: parsed.data.preview,
    model: provenance.model,
  }).returning();
  return inserted[0]!;
}

export async function listProfileChangeProposals(businessId: number): Promise<ProfileChangeProposal[]> {
  return db.select().from(profileChangeProposalTable)
    .where(eq(profileChangeProposalTable.businessId, businessId))
    .orderBy(desc(profileChangeProposalTable.createdAt));
}

export async function reviewProfileChangeProposal(
  businessId: number,
  proposalId: string,
  decision: "approve" | "reject",
  expectedUpdatedAt: Date,
  proposedValue?: unknown,
  reason?: string,
): Promise<ProfileChangeProposal> {
  return db.transaction(async (tx) => {
    const proposal = (await tx.select().from(profileChangeProposalTable).where(and(
      eq(profileChangeProposalTable.id, proposalId), eq(profileChangeProposalTable.businessId, businessId),
    )).limit(1))[0];
    if (!proposal || proposal.status !== "proposed") {
      throw new ProfileImprovementError("NOT_FOUND", "Proposta pendente não encontrada.");
    }
    const field = assertField(proposal.fieldPath);
    const value = proposedValue === undefined ? proposal.proposedValue : proposedValue;
    if (!updateBusinessProfileSchema.shape[field]?.safeParse(value).success) {
      throw new ProfileImprovementError("INVALID_VALUE", "O ajuste não é válido para este campo.");
    }
    const updated = (await tx.update(profileChangeProposalTable).set({
      status: decision === "approve" ? "approved" : "rejected",
      proposedValue: value,
      reason: reason?.trim() || proposal.reason,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(profileChangeProposalTable.id, proposalId),
      eq(profileChangeProposalTable.businessId, businessId),
      eq(profileChangeProposalTable.status, "proposed"),
      eq(profileChangeProposalTable.updatedAt, expectedUpdatedAt),
    )).returning())[0];
    if (!updated) throw new ProfileImprovementError("CONFLICT", "A proposta já foi revista.");
    await tx.insert(profileImprovementAuditTable).values({
      businessId,
      proposalId,
      action: decision,
      beforeValue: proposal.proposedValue,
      afterValue: value,
      model: proposal.model,
      author: "owner",
      result: decision === "approve" ? "approved" : "rejected",
    });
    return updated;
  });
}

export async function adjustProfileChangeProposal(
  businessId: number,
  proposalId: string,
  proposedValue: unknown,
  expectedUpdatedAt: Date,
  reason?: string,
): Promise<ProfileChangeProposal> {
  return db.transaction(async (tx) => {
    const proposal = (await tx.select().from(profileChangeProposalTable).where(and(
      eq(profileChangeProposalTable.id, proposalId),
      eq(profileChangeProposalTable.businessId, businessId),
    )).limit(1))[0];
    if (!proposal || proposal.status !== "proposed") {
      throw new ProfileImprovementError("NOT_FOUND", "Proposta pendente não encontrada.");
    }
    const field = assertField(proposal.fieldPath);
    const checked = updateBusinessProfileSchema.shape[field]?.safeParse(proposedValue);
    if (!checked?.success) throw new ProfileImprovementError("INVALID_VALUE", "O ajuste não é válido para este campo.");
    const updated = (await tx.update(profileChangeProposalTable).set({
      proposedValue,
      reason: reason?.trim() || proposal.reason,
      updatedAt: new Date(),
    }).where(and(
      eq(profileChangeProposalTable.id, proposalId),
      eq(profileChangeProposalTable.businessId, businessId),
      eq(profileChangeProposalTable.status, "proposed"),
      eq(profileChangeProposalTable.updatedAt, expectedUpdatedAt),
    )).returning())[0];
    if (!updated) throw new ProfileImprovementError("CONFLICT", "A proposta foi alterada durante a revisão.");
    await tx.insert(profileImprovementAuditTable).values({
      businessId,
      proposalId,
      action: "adjust",
      beforeValue: proposal.proposedValue,
      afterValue: proposedValue,
      model: proposal.model,
      author: "owner",
      result: "adjusted",
    });
    return updated;
  });
}

export async function reopenProfileChangeProposal(
  businessId: number, proposalId: string, expectedUpdatedAt: Date,
): Promise<ProfileChangeProposal> {
  return db.transaction(async (tx) => {
    const proposal = (await tx.select().from(profileChangeProposalTable).where(and(
      eq(profileChangeProposalTable.id, proposalId),
      eq(profileChangeProposalTable.businessId, businessId),
    )).limit(1))[0];
    if (!proposal || proposal.status !== "approved") {
      throw new ProfileImprovementError("NOT_FOUND", "Proposta aprovada não encontrada.");
    }
    const reopened = (await tx.update(profileChangeProposalTable).set({
      status: "proposed",
      reviewedAt: null,
      updatedAt: new Date(),
    }).where(and(
      eq(profileChangeProposalTable.id, proposalId),
      eq(profileChangeProposalTable.businessId, businessId),
      eq(profileChangeProposalTable.status, "approved"),
      eq(profileChangeProposalTable.updatedAt, expectedUpdatedAt),
    )).returning())[0];
    if (!reopened) throw new ProfileImprovementError("CONFLICT", "A proposta mudou noutra sessão.");
    await tx.insert(profileImprovementAuditTable).values({
      businessId,
      proposalId,
      action: "reopen",
      beforeValue: proposal.proposedValue,
      afterValue: proposal.proposedValue,
      model: proposal.model,
      author: "owner",
      result: "proposed",
    });
    return reopened;
  });
}

export async function applyProfileChangeProposal(
  businessId: number, proposalId: string, idempotencyKey: string, author = "owner",
): Promise<ProfileChangeProposal> {
  if (!idempotencyKey || idempotencyKey.length > 200) throw new ProfileImprovementError("IDEMPOTENCY_REQUIRED", "Chave de idempotência obrigatória.");
  return db.transaction(async (tx) => {
    const proposal = (await tx.select().from(profileChangeProposalTable).where(and(
      eq(profileChangeProposalTable.id, proposalId), eq(profileChangeProposalTable.businessId, businessId),
    )).limit(1))[0];
    if (!proposal) throw new ProfileImprovementError("NOT_FOUND", "Proposta não encontrada.");
    if (proposal.status === "applied" && proposal.idempotencyKey === idempotencyKey) return proposal;
    if (proposal.status !== "approved") throw new ProfileImprovementError("NOT_APPROVED", "A proposta precisa de aprovação.");
    const profile = (await tx.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, businessId)).limit(1))[0];
    if (!profile) throw new ProfileImprovementError("PROFILE_NOT_FOUND", "Perfil não encontrado.");
    const field = assertField(proposal.fieldPath);
    if (JSON.stringify(currentField(profile, field)) !== JSON.stringify(proposal.baseValue)) {
      throw new ProfileImprovementError("CONFLICT", "Este campo mudou desde a proposta; cria ou ajusta uma nova proposta.");
    }
    const appliedAt = new Date();
    const updated = await tx.update(businessProfilesTable)
      .set({ [field]: proposal.proposedValue, updatedAt: appliedAt } as Partial<BusinessProfile>)
      .where(and(eq(businessProfilesTable.id, businessId), eq(businessProfilesTable.updatedAt, profile.updatedAt)))
      .returning();
    if (!updated[0]) throw new ProfileImprovementError("CONFLICT", "O perfil mudou durante a aplicação.");
    const result = {
      idempotencyKey,
      appliedAt: appliedAt.toISOString(),
      fieldPath: field,
      baseVersion: proposal.baseVersion.toISOString(),
    };
    const saved = (await tx.update(profileChangeProposalTable).set({
      status: "applied", idempotencyKey, appliedAt, appliedVersion: updated[0].updatedAt,
      applicationResult: result, updatedAt: appliedAt,
    }).where(and(
      eq(profileChangeProposalTable.id, proposalId),
      eq(profileChangeProposalTable.businessId, businessId),
      eq(profileChangeProposalTable.status, "approved"),
    )).returning())[0];
    if (!saved) throw new ProfileImprovementError("CONFLICT", "A proposta já foi processada.");
    await tx.insert(profileImprovementAuditTable).values({
      businessId, proposalId, action: "apply", beforeValue: proposal.baseValue,
      afterValue: proposal.proposedValue, model: proposal.model, author, result: "applied",
    });
    return saved;
  });
}

export async function reverseProfileChangeProposal(businessId: number, proposalId: string, idempotencyKey: string): Promise<ProfileChangeProposal> {
  if (!idempotencyKey || idempotencyKey.length > 200) throw new ProfileImprovementError("IDEMPOTENCY_REQUIRED", "Chave de idempotência obrigatória.");
  return db.transaction(async (tx) => {
    const proposal = (await tx.select().from(profileChangeProposalTable).where(and(
      eq(profileChangeProposalTable.id, proposalId),
      eq(profileChangeProposalTable.businessId, businessId),
    )).limit(1))[0];
    if (!proposal) throw new ProfileImprovementError("NOT_REVERSIBLE", "Proposta não encontrada.");
    const previousResult = proposal.applicationResult as { reversalIdempotencyKey?: string } | null;
    if (proposal.status === "reversed" && previousResult?.reversalIdempotencyKey === idempotencyKey) return proposal;
    if (proposal.status !== "applied") throw new ProfileImprovementError("NOT_REVERSIBLE", "Só uma alteração aplicada pode ser revertida.");
    const profile = (await tx.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, businessId)).limit(1))[0];
    if (!profile) throw new ProfileImprovementError("PROFILE_NOT_FOUND", "Perfil não encontrado.");
    const field = assertField(proposal.fieldPath);
    if (JSON.stringify(currentField(profile, field)) !== JSON.stringify(proposal.proposedValue)) {
      throw new ProfileImprovementError("CONFLICT", "O campo mudou depois da aplicação; reversão cancelada.");
    }
    const now = new Date();
    const updated = (await tx.update(businessProfilesTable).set({ [field]: proposal.baseValue, updatedAt: now })
      .where(and(eq(businessProfilesTable.id, businessId), eq(businessProfilesTable.updatedAt, profile.updatedAt))).returning())[0];
    if (!updated) throw new ProfileImprovementError("CONFLICT", "O perfil mudou durante a reversão.");
    await tx.insert(profileImprovementAuditTable).values({
      businessId, proposalId, action: "reverse", beforeValue: proposal.proposedValue,
      afterValue: proposal.baseValue, model: proposal.model, author: "owner", result: "reversed",
    });
    return (await tx.update(profileChangeProposalTable).set({
      status: "reversed",
      updatedAt: now,
      applicationResult: {
        ...(proposal.applicationResult ?? {}),
        reversedAt: now.toISOString(),
        reversalIdempotencyKey: idempotencyKey,
      },
    }).where(and(
      eq(profileChangeProposalTable.id, proposalId),
      eq(profileChangeProposalTable.businessId, businessId),
      eq(profileChangeProposalTable.status, "applied"),
    )).returning())[0]!;
  });
}

export async function createResourceRequest(businessId: number, input: unknown): Promise<ResourceRequest> {
  const parsed = resourceRequestInputSchema.safeParse(input);
  if (!parsed.success) throw new ProfileImprovementError("INVALID_REQUEST", "Pedido de recurso inválido.");
  return (await db.insert(resourceRequestsTable).values({ businessId, ...parsed.data }).returning())[0]!;
}
export async function listResourceRequests(businessId: number): Promise<ResourceRequest[]> {
  return db.select().from(resourceRequestsTable).where(eq(resourceRequestsTable.businessId, businessId)).orderBy(desc(resourceRequestsTable.createdAt));
}
export async function createResource(
  businessId: number, input: unknown, requestId?: string,
): Promise<ResourceLibraryItem> {
  const raw = input as Record<string, unknown>;
  const parsed = resourceInputSchema.safeParse({
    ...raw,
    purpose: raw["purpose"] ?? (Array.isArray(raw["purposes"]) ? raw["purposes"][0] : undefined),
    content: raw["content"] ?? raw["textContent"],
  });
  if (!parsed.success) throw new ProfileImprovementError("INVALID_RESOURCE", "Recurso inválido.");
  return db.transaction(async (tx) => {
    if (requestId) {
      const request = (await tx.select().from(resourceRequestsTable).where(and(
        eq(resourceRequestsTable.id, requestId), eq(resourceRequestsTable.businessId, businessId),
        eq(resourceRequestsTable.status, "open"),
      )).limit(1))[0];
      if (!request) throw new ProfileImprovementError("REQUEST_CONFLICT", "O pedido já foi concluído ou cancelado.");
      parsed.data.purpose = `request:${request.id}`;
    }
    const resource = (await tx.insert(resourceLibraryTable).values({ businessId, ...parsed.data }).returning())[0]!;
    if (parsed.data.objectPath) {
      const claimed = await tx.update(resourceUploadsTable).set({ claimedResourceId: resource.id }).where(and(
        eq(resourceUploadsTable.businessId, businessId),
        eq(resourceUploadsTable.objectPath, parsed.data.objectPath),
        sql`${resourceUploadsTable.claimedResourceId} IS NULL`,
      )).returning({ id: resourceUploadsTable.id });
      if (!claimed[0]) throw new ProfileImprovementError("UPLOAD_NOT_OWNED", "O upload não pertence a este negócio ou já foi usado.");
    }
    if (requestId) {
      const fulfilled = await tx.update(resourceRequestsTable).set({
        status: "fulfilled",
        updatedAt: new Date(),
      }).where(and(
        eq(resourceRequestsTable.id, requestId),
        eq(resourceRequestsTable.businessId, businessId),
        eq(resourceRequestsTable.status, "open"),
      )).returning({ id: resourceRequestsTable.id });
      if (!fulfilled[0]) throw new ProfileImprovementError("REQUEST_CONFLICT", "O pedido já foi concluído ou cancelado.");
    }
    return resource;
  });
}
export async function updateResource(businessId: number, resourceId: string, input: unknown): Promise<ResourceLibraryItem> {
  return db.transaction(async (tx) => {
    const current = (await tx.select().from(resourceLibraryTable).where(and(
      eq(resourceLibraryTable.id, resourceId),
      eq(resourceLibraryTable.businessId, businessId),
    )).limit(1))[0];
    if (!current) throw new ProfileImprovementError("NOT_FOUND", "Recurso não encontrado.");
    const raw = input as Record<string, unknown>;
    const candidate = {
      title: raw["title"] ?? current.title,
      description: raw["description"] ?? current.description,
      kind: raw["kind"] ?? current.kind,
      purpose: raw["purpose"] ?? (Array.isArray(raw["purposes"]) ? raw["purposes"][0] : current.purpose),
      url: raw["url"] === undefined ? current.url : raw["url"],
      objectPath: raw["objectPath"] === undefined ? current.objectPath : raw["objectPath"],
      content: raw["content"] ?? raw["textContent"] ?? current.content,
      mimeType: raw["mimeType"] === undefined ? current.mimeType : raw["mimeType"],
      validFrom: raw["validFrom"] === undefined ? current.validFrom : raw["validFrom"],
      validUntil: raw["validUntil"] === undefined ? current.validUntil : raw["validUntil"],
    };
    const parsed = resourceInputSchema.safeParse(candidate);
    if (!parsed.success) throw new ProfileImprovementError("INVALID_RESOURCE", "Recurso inválido.");
    if (parsed.data.objectPath && parsed.data.objectPath !== current.objectPath) {
      const claimed = await tx.update(resourceUploadsTable).set({ claimedResourceId: resourceId }).where(and(
        eq(resourceUploadsTable.businessId, businessId),
        eq(resourceUploadsTable.objectPath, parsed.data.objectPath!),
        sql`${resourceUploadsTable.claimedResourceId} IS NULL`,
      )).returning({ id: resourceUploadsTable.id });
      if (!claimed[0]) throw new ProfileImprovementError("UPLOAD_NOT_OWNED", "O upload não pertence a este negócio ou já foi usado.");
    }
    const updated = (await tx.update(resourceLibraryTable).set({
      ...parsed.data,
      status: "draft",
      visibility: "private",
      approvedAt: null,
      approvedBy: null,
      updatedAt: new Date(),
    }).where(and(
      eq(resourceLibraryTable.id, resourceId),
      eq(resourceLibraryTable.businessId, businessId),
      eq(resourceLibraryTable.updatedAt, current.updatedAt),
    )).returning())[0];
    if (!updated) throw new ProfileImprovementError("CONFLICT", "O recurso foi alterado noutra sessão.");
    return updated;
  });
}
export async function listResources(businessId: number): Promise<ResourceLibraryItem[]> {
  return db.select().from(resourceLibraryTable).where(eq(resourceLibraryTable.businessId, businessId)).orderBy(desc(resourceLibraryTable.createdAt));
}
export async function approveResource(
  businessId: number, resourceId: string, expectedUpdatedAt: Date, author = "owner",
): Promise<ResourceLibraryItem> {
  const rows = await db.update(resourceLibraryTable).set({ status: "approved", visibility: "public", approvedAt: new Date(), approvedBy: author, updatedAt: new Date() })
    .where(and(
      eq(resourceLibraryTable.id, resourceId),
      eq(resourceLibraryTable.businessId, businessId),
      eq(resourceLibraryTable.status, "draft"),
      eq(resourceLibraryTable.updatedAt, expectedUpdatedAt),
    )).returning();
  if (!rows[0]) throw new ProfileImprovementError("CONFLICT", "O recurso mudou desde a revisão.");
  return rows[0];
}
export async function reviewResource(
  businessId: number, resourceId: string, decision: "approve" | "reject", expectedUpdatedAt: Date, author = "owner",
): Promise<ResourceLibraryItem> {
  if (decision === "approve") return approveResource(businessId, resourceId, expectedUpdatedAt, author);
  const rows = await db.update(resourceLibraryTable).set({ status: "archived", visibility: "private", updatedAt: new Date() })
    .where(and(
      eq(resourceLibraryTable.id, resourceId),
      eq(resourceLibraryTable.businessId, businessId),
      eq(resourceLibraryTable.updatedAt, expectedUpdatedAt),
    )).returning();
  if (!rows[0]) throw new ProfileImprovementError("CONFLICT", "O recurso mudou desde a revisão.");
  return rows[0];
}
export async function updateResourceRequestStatus(businessId: number, requestId: string, status: "open" | "fulfilled" | "cancelled"): Promise<ResourceRequest> {
  const rows = await db.update(resourceRequestsTable).set({ status, updatedAt: new Date() })
    .where(and(eq(resourceRequestsTable.id, requestId), eq(resourceRequestsTable.businessId, businessId))).returning();
  if (!rows[0]) throw new ProfileImprovementError("NOT_FOUND", "Pedido não encontrado.");
  return rows[0];
}
export async function deliverResource(businessId: number, resourceId: string, leadId: string, purpose: string, idempotencyKey: string): Promise<ResourceLibraryItem> {
  if (!idempotencyKey || idempotencyKey.length > 200) throw new ProfileImprovementError("IDEMPOTENCY_REQUIRED", "Chave de idempotência obrigatória.");
  return db.transaction(async (tx) => {
    const resource = (await tx.select().from(resourceLibraryTable).where(and(
      eq(resourceLibraryTable.id, resourceId),
      eq(resourceLibraryTable.businessId, businessId),
    )).limit(1))[0];
    if (!resource || resource.status !== "approved" || resource.visibility !== "public") {
      throw new ProfileImprovementError("RESOURCE_NOT_PUBLIC", "O recurso não está aprovado e público.");
    }
    const now = new Date();
    if ((resource.validFrom && resource.validFrom > now) || (resource.validUntil && resource.validUntil < now) || resource.purpose !== purpose) {
      throw new ProfileImprovementError("RESOURCE_NOT_VALID", "O recurso não é válido para este propósito.");
    }
    const lead = (await tx.select().from(leadsTable).where(and(
      eq(leadsTable.id, leadId),
      eq(leadsTable.businessId, businessId),
    )).limit(1))[0];
    if (!lead) throw new ProfileImprovementError("LEAD_NOT_FOUND", "Visitante não encontrado neste negócio.");
    const existing = (await tx.select().from(resourceDeliveryAuditTable).where(and(
      eq(resourceDeliveryAuditTable.businessId, businessId),
      eq(resourceDeliveryAuditTable.idempotencyKey, idempotencyKey),
    )).limit(1))[0];
    if (existing) {
      if (existing.resourceId !== resourceId || existing.leadId !== leadId || existing.purpose !== purpose) {
        throw new ProfileImprovementError("CONFLICT", "Esta chave de envio já foi usada noutro pedido.");
      }
      return resource;
    }
    await tx.insert(resourceDeliveryAuditTable).values({ businessId, resourceId, leadId, purpose, idempotencyKey });
    const content = resource.url
      ?? (resource.objectPath ? `/api/storage${resource.objectPath}` : null)
      ?? resource.content
      ?? "";
    const text = [resource.title, resource.description, content].filter(Boolean).join("\n");
    await tx.update(leadsTable).set({
      chatMessages: sql`${leadsTable.chatMessages} || ${JSON.stringify([{ role: "agent", text, ts: now.toISOString() }])}::jsonb`,
      updatedAt: now,
    }).where(and(eq(leadsTable.id, leadId), eq(leadsTable.businessId, businessId)));
    return resource;
  });
}