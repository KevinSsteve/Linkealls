import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  X, ArrowLeft, Upload, Link as LinkIcon, FileText, File, Image as ImageIcon, 
  Send, RefreshCcw, Loader2, Plus, AlertCircle, Edit2, CheckCircle2, XCircle, Archive,
  Eye, EyeOff, Calendar
} from "lucide-react";
import { C } from "../../theme";
import { 
  businessApi, 
  confirmSensitiveAction,
  uploadResourceFile,
  getStorageObjectUrl,
  type ProfileImprovementProposal,
  type ProfileImprovementRequest,
  type Resource,
  type ResourceKind
} from "../../lib/api";

import { AppHeader } from "../app/AppHeader";

export function AssistantManager({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [tab, setTab] = useState<"proposals" | "requests" | "resources">("proposals");
  const api = useMemo(() => businessApi(slug), [slug]);
  
  const [proposals, setProposals] = useState<ProfileImprovementProposal[]>([]);
  const [requests, setRequests] = useState<ProfileImprovementRequest[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [requestedResource, setRequestedResource] = useState<ProfileImprovementRequest | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchImprovements = useCallback(async () => {
    try {
      const data = await api.listProfileImprovements();
      setProposals(data.proposals);
      setRequests(data.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar sugestões.");
    }
  }, [api]);

  const fetchResources = useCallback(async () => {
    try {
      const data = await api.listResources();
      setResources(data.resources);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar recursos.");
    }
  }, [api]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchImprovements(), fetchResources()]);
    setLoading(false);
  }, [fetchImprovements, fetchResources]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[var(--bg)]" style={{ background: C.bg }}>
      <AppHeader
        variant="dark"
        title="Gestão do Assistente"
        onBack={onClose}
      />
      
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2" style={{ borderColor: C.border, background: C.white }}>
        <div className="flex gap-4">
          {(["proposals", "requests", "resources"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-1 pt-2 text-[14px] font-medium transition-colors ${
                tab === t ? "border-b-2 text-[var(--ink)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
              style={{ borderBottomColor: tab === t ? C.green : "transparent" }}
            >
              {t === "proposals" ? "Sugestões" : t === "requests" ? "Pedidos" : "Recursos"}
            </button>
          ))}
        </div>
        <button onClick={refreshAll} className="app-icon-button" aria-label="Actualizar">
          <RefreshCcw size={16} />
        </button>
      </div>

      <div className="owner-content-scroll flex-1 p-4">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-[var(--radius-md)] border p-3 text-[13px]" style={{ background: C.errorBg, color: C.errorText, borderColor: C.errorBorder }}>
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X size={16} /></button>
          </div>
        )}

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-[var(--ink-faint)]" />
          </div>
        ) : (
          <>
            {tab === "proposals" && <ProposalsTab api={api} proposals={proposals} onRefresh={fetchImprovements} />}
            {tab === "requests" && <RequestsTab api={api} requests={requests} onRefresh={fetchImprovements} onCreate={(request) => { setRequestedResource(request); setTab("resources"); }} />}
            {tab === "resources" && <ResourcesTab api={api} slug={slug} resources={resources} requestedResource={requestedResource} onRequestHandled={() => setRequestedResource(null)} onRefresh={fetchResources} />}
          </>
        )}
      </div>
    </div>
  );
}

function ProposalsTab({ 
  api, 
  proposals, 
  onRefresh 
}: { 
  api: ReturnType<typeof businessApi>; 
  proposals: ProfileImprovementProposal[]; 
  onRefresh: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [editReason, setEditReason] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  const handleApply = async (id: string) => {
    setSubmitting(id);
    try {
      if (!(await confirmSensitiveAction())) return;
      const proposal = proposals.find((item) => item.id === id);
      if (!proposal) return;
      if (proposal.status === "proposed") {
        await api.updateProfileImprovement(id, { decision: "approve", expectedUpdatedAt: proposal.updatedAt });
      }
      await api.applyProfileImprovement(id, crypto.randomUUID());
      await onRefresh();
    } catch (e) {
      alert("Erro ao aplicar.");
    } finally {
      setSubmitting(null);
    }
  };

  const handleReopen = async (proposal: ProfileImprovementProposal) => {
    setSubmitting(proposal.id);
    try {
      await api.reopenProfileImprovement(proposal.id, proposal.updatedAt);
      await onRefresh();
    } catch {
      alert("Erro ao reabrir a sugestão.");
    } finally {
      setSubmitting(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm("Rejeitar esta sugestão?")) return;
    setSubmitting(id);
    try {
      const proposal = proposals.find((item) => item.id === id);
      if (!proposal) return;
      await api.updateProfileImprovement(id, { decision: "reject", expectedUpdatedAt: proposal.updatedAt });
      await onRefresh();
    } catch (e) {
      alert("Erro ao rejeitar.");
    } finally {
      setSubmitting(null);
    }
  };

  const handleReverse = async (id: string) => {
    setSubmitting(id);
    try {
      if (!(await confirmSensitiveAction())) return;
      await api.reverseProfileImprovement(id, crypto.randomUUID());
      await onRefresh();
    } catch (e) {
      alert("Erro ao reverter.");
    } finally {
      setSubmitting(null);
    }
  };

  const saveEdit = async (id: string) => {
    setSubmitting(id);
    try {
      let proposedValue: unknown = editVal;
      try { proposedValue = JSON.parse(editVal); } catch { /* string fields stay as text */ }
      const proposal = proposals.find((item) => item.id === id);
      if (!proposal) return;
      await api.updateProfileImprovement(id, { proposedValue, reason: editReason, expectedUpdatedAt: proposal.updatedAt });
      setEditingId(null);
      await onRefresh();
    } catch (e) {
      alert("Erro ao guardar edição.");
    } finally {
      setSubmitting(null);
    }
  };

  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-[var(--ink-soft)]">
        <CheckCircle2 size={32} className="mb-3 text-[var(--green)]" opacity={0.3} />
        <p className="text-[14px]">Nenhuma sugestão pendente.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {proposals.map(p => {
        const isEditing = editingId === p.id;
        const valStr = typeof p.proposedValue === "string" ? p.proposedValue : JSON.stringify(p.proposedValue, null, 2);

        return (
          <div key={p.id} className="flex flex-col rounded-[var(--radius-md)] border bg-[var(--white)] p-4 shadow-sm" style={{ borderColor: C.borderSoft }}>
            <div className="mb-2 flex items-start justify-between">
              <span className="text-[12px] font-semibold text-[var(--ink-soft)] uppercase tracking-wide">
                Campo: {p.fieldPath}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                p.status === 'proposed' ? 'bg-[#FFF8E1] text-[#F57F17]' :
                p.status === 'applied' ? 'bg-[#E8F5E9] text-[#2E7D32]' :
                'bg-[#F5F5F5] text-[#9E9E9E]'
              }`}>
                {p.status === 'proposed' ? 'Pendente' : p.status === 'approved' ? 'Aprovado' : p.status === 'applied' ? 'Aplicado' : p.status === 'rejected' ? 'Rejeitado' : p.status === 'conflict' ? 'Conflito' : 'Revertido'}
              </span>
            </div>

            {isEditing ? (
              <div className="mb-3 flex flex-col gap-2">
                <label className="text-[12px] font-medium text-[var(--ink-soft)]">Motivo</label>
                <input 
                  className="rounded-[var(--radius-sm)] border px-3 py-2 text-[13px]" 
                  style={{ borderColor: C.border, background: C.inputBg }}
                  value={editReason} 
                  onChange={e => setEditReason(e.target.value)} 
                />
                <label className="text-[12px] font-medium text-[var(--ink-soft)] mt-1">Valor proposto</label>
                <textarea 
                  className="rounded-[var(--radius-sm)] border px-3 py-2 text-[13px] min-h-[60px]" 
                  style={{ borderColor: C.border, background: C.inputBg }}
                  value={editVal} 
                  onChange={e => setEditVal(e.target.value)} 
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => setEditingId(null)} className="rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-medium border" style={{ borderColor: C.border }}>Cancelar</button>
                  <button onClick={() => saveEdit(p.id)} disabled={submitting === p.id} className="rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-medium bg-[var(--green)] text-white">Guardar</button>
                </div>
              </div>
            ) : (
              <div className="mb-4 flex flex-col gap-2">
                {p.reason && (
                  <p className="text-[13px] text-[var(--ink)]">
                    <span className="font-semibold text-[var(--ink-soft)]">Motivo:</span> {p.reason}
                  </p>
                )}
                <p className="text-[12px] text-[var(--ink-soft)]">
                  Fonte: {p.source}{p.sourceRef ? ` · ${p.sourceRef}` : ""}
                </p>
                {p.preview && <p className="text-[12px] text-[var(--ink-soft)]">{p.preview}</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[var(--radius-sm)] bg-[var(--subtle)] p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase text-[var(--ink-faint)]">Antes</p>
                    <p className="break-words text-[12px] text-[var(--ink-soft)]">
                      {typeof p.baseValue === "string" ? p.baseValue || "Vazio" : JSON.stringify(p.baseValue)}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] bg-[var(--subtle)] p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase text-[var(--ink-faint)]">Depois</p>
                    <p className="break-words text-[12px] text-[var(--ink)]">{valStr}</p>
                  </div>
                </div>
              </div>
            )}

            {!isEditing && p.status === "proposed" && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: C.borderSoft }}>
                <button 
                  onClick={() => handleApply(p.id)} 
                  disabled={submitting === p.id}
                  className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--green)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-50"
                >
                  {submitting === p.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Aplicar
                </button>
                <button 
                  onClick={() => handleReject(p.id)} 
                  disabled={submitting === p.id}
                  className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[#FEF2F2] px-3 py-1.5 text-[12px] font-semibold text-[#DC2626] transition-opacity active:opacity-80 disabled:opacity-50"
                >
                  <XCircle size={14} /> Rejeitar
                </button>
                <button 
                  onClick={() => {
                    setEditingId(p.id);
                    setEditVal(valStr);
                    setEditReason(p.reason || "");
                  }} 
                  disabled={submitting === p.id}
                  className="ml-auto flex items-center gap-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--subtle)]"
                >
                  <Edit2 size={14} /> Editar
                </button>
              </div>
            )}

            {!isEditing && p.status === "approved" && (
              <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: C.borderSoft }}>
                <button onClick={() => handleApply(p.id)} disabled={submitting === p.id} className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--green)] px-3 py-1.5 text-[12px] font-semibold text-white">
                  {submitting === p.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Tentar aplicar novamente
                </button>
                <button onClick={() => handleReopen(p)} disabled={submitting === p.id} className="rounded-[var(--radius-sm)] border px-3 py-1.5 text-[12px] font-semibold" style={{ borderColor: C.border }}>
                  Reabrir para editar
                </button>
              </div>
            )}

            {!isEditing && p.status === "applied" && (
              <div className="flex border-t pt-3" style={{ borderColor: C.borderSoft }}>
                <button 
                  onClick={() => handleReverse(p.id)} 
                  disabled={submitting === p.id}
                  className="flex items-center gap-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-soft)] hover:bg-[var(--subtle)]"
                >
                  {submitting === p.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                  Reverter
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RequestsTab({ api, requests, onRefresh, onCreate }: {
  api: ReturnType<typeof businessApi>;
  requests: ProfileImprovementRequest[];
  onRefresh: () => Promise<void>;
  onCreate: (request: ProfileImprovementRequest) => void;
}) {
  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-[var(--ink-soft)]">
        <CheckCircle2 size={32} className="mb-3 text-[var(--green)]" opacity={0.3} />
        <p className="text-[14px]">Nenhum pedido pendente.</p>
      </div>
    );
  }

  const openReqs = requests.filter(r => r.status === "open");
  const fulfilledReqs = requests.filter(r => r.status === "fulfilled");

  return (
    <div className="flex flex-col gap-6">
      {openReqs.length > 0 && (
        <div>
          <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Pedidos em aberto</h3>
          <div className="flex flex-col gap-3">
            {openReqs.map(r => (
              <div key={r.id} className="flex flex-col rounded-[var(--radius-md)] border bg-[#FFF8E1] p-4 shadow-sm" style={{ borderColor: "#FFECB3" }}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={16} className="text-[#F57F17]" />
                  <span className="text-[14px] font-semibold text-[#F57F17]">Necessário: {
                    r.kind === 'document' ? 'Documento' : 
                    r.kind === 'image' ? 'Imagem/Media' : 
                    r.kind === 'link' ? 'Link' : 'Texto'
                  }</span>
                </div>
                 <p className="text-[13px] text-[#5D4037]">{r.request}</p>
                 <p className="mt-1 text-[12px] text-[#8D6E63]">Finalidade: {r.purpose}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => onCreate(r)} className="rounded-[var(--radius-sm)] bg-[var(--green)] px-3 py-1.5 text-[12px] font-semibold text-white">Adicionar recurso</button>
                  <button onClick={async () => { await api.updateResourceRequest(r.id, "cancelled"); await onRefresh(); }} className="rounded-[var(--radius-sm)] border px-3 py-1.5 text-[12px] font-semibold" style={{ borderColor: "#D7CCC8" }}>Cancelar pedido</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {fulfilledReqs.length > 0 && (
        <div>
          <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">Pedidos concluídos</h3>
          <div className="flex flex-col gap-3">
            {fulfilledReqs.map(r => (
              <div key={r.id} className="flex flex-col rounded-[var(--radius-md)] border bg-[var(--subtle)] p-4 shadow-sm" style={{ borderColor: C.borderSoft }}>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={16} className="text-[var(--green)]" />
                  <span className="text-[14px] font-semibold text-[var(--ink)]">{r.kind}</span>
                </div>
                <p className="text-[13px] text-[var(--ink-soft)] line-through">{r.purpose}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResourcesTab({
  api,
  slug,
  resources,
  requestedResource,
  onRequestHandled,
  onRefresh,
}: {
  api: ReturnType<typeof businessApi>;
  slug: string;
  resources: Resource[];
  requestedResource: ProfileImprovementRequest | null;
  onRequestHandled: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [view, setView] = useState<"list" | "create" | "edit">(requestedResource ? "create" : "list");
  const [editingResource, setEditingResource] = useState<Resource | null>(null);

  if (view === "create" || view === "edit") {
    return (
      <ResourceForm 
        api={api} 
        slug={slug} 
        initial={view === "edit" ? editingResource : null}
        request={view === "create" ? requestedResource : null}
        onSaved={async () => {
          await onRefresh();
          setView("list");
          setEditingResource(null);
          onRequestHandled();
        }}
        onCancel={() => {
          setView("list");
          setEditingResource(null);
          onRequestHandled();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex justify-end">
        <button 
          onClick={() => setView("create")}
          className="flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--green)] px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
        >
          <Plus size={16} /> Novo recurso
        </button>
      </div>

      {resources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-[var(--ink-soft)]">
          <Archive size={32} className="mb-3 text-[var(--ink-faint)]" opacity={0.5} />
          <p className="text-[14px]">Nenhum recurso guardado.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {resources.map(r => (
            <ResourceCard 
              key={r.id} 
              resource={r} 
              api={api} 
              onEdit={() => {
                setEditingResource(r);
                setView("edit");
              }}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResourceCard({ 
  resource, 
  api, 
  onEdit, 
  onRefresh 
}: { 
  resource: Resource; 
  api: ReturnType<typeof businessApi>; 
  onEdit: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [showSend, setShowSend] = useState(false);

  const handleSend = async () => {
    if (!leadId.trim()) return alert("Insere o ID do lead.");
    if (!purpose.trim()) return alert("Insere o propósito.");
    
    setSending(true);
    try {
      if (!(await confirmSensitiveAction())) return;
      await api.sendResource(resource.id, leadId, purpose, crypto.randomUUID());
      alert("Enviado com sucesso!");
      setShowSend(false);
      setLeadId("");
      setPurpose("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao enviar.");
    } finally {
      setSending(false);
    }
  };

  const handleToggleStatus = async () => {
    try {
      if (!(await confirmSensitiveAction())) return;
      await api.reviewResource(resource.id, resource.status === "approved" ? "reject" : "approve", resource.updatedAt);
      await onRefresh();
    } catch (e) {
      alert("Erro ao alterar estado.");
    }
  };

  const isImage = resource.kind === "image" && resource.objectPath;
  const imageUrl = isImage ? getStorageObjectUrl(resource.objectPath!) : null;

  return (
    <div className="flex flex-col rounded-[var(--radius-md)] border bg-[var(--white)] shadow-sm" style={{ borderColor: C.borderSoft }}>
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {resource.kind === 'image' ? <ImageIcon size={16} className="text-[var(--green)]" /> : 
             resource.kind === 'link' ? <LinkIcon size={16} className="text-[var(--green)]" /> :
             resource.kind === 'document' ? <File size={16} className="text-[var(--green)]" /> :
             <FileText size={16} className="text-[var(--green)]" />}
            <h4 className="text-[15px] font-semibold text-[var(--ink)] line-clamp-1">{resource.title}</h4>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
            resource.status === 'draft' ? 'bg-[#F5F5F5] text-[#9E9E9E]' :
            resource.status === 'approved' ? 'bg-[#E8F5E9] text-[#2E7D32]' :
            'bg-[#FFF3E0] text-[#F57F17]'
          }`}>
            {resource.status === 'draft' ? 'Rascunho' : resource.status === 'approved' ? 'Aprovado' : 'Arquivado'}
          </span>
        </div>

        {resource.description && (
          <p className="text-[13px] text-[var(--ink-soft)] line-clamp-2">{resource.description}</p>
        )}

        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium">
          <span className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--subtle)] px-2 py-1 text-[var(--ink-soft)]">
            {resource.visibility === 'public' ? <Eye size={12} /> : <EyeOff size={12} />}
            {resource.visibility === 'public' ? 'Público' : 'Privado'}
          </span>
          {(resource.validFrom || resource.validUntil) && (
            <span className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--subtle)] px-2 py-1 text-[var(--ink-soft)]">
              <Calendar size={12} />
              {resource.validUntil ? `Até ${new Date(resource.validUntil).toLocaleDateString()}` : 'Com validade'}
            </span>
          )}
        </div>

        {isImage && imageUrl && (
          <div className="mt-3 aspect-video w-full max-w-[200px] overflow-hidden rounded-[var(--radius-sm)] bg-[var(--subtle)]">
            <img src={imageUrl} alt={resource.title} className="h-full w-full object-cover" />
          </div>
        )}

        {resource.url && (
          <a href={resource.url} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-1 text-[13px] font-medium text-[var(--green)] hover:underline">
            <LinkIcon size={14} /> Abrir link
          </a>
        )}

        {resource.textContent && (
          <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--subtle)] p-3 text-[12px] font-mono text-[var(--ink-soft)] line-clamp-3 break-words">
            {resource.textContent}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: C.borderSoft, background: C.chatBg }}>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="app-icon-button" aria-label="Editar" style={{ background: C.white, border: `1px solid ${C.border}` }}>
            <Edit2 size={14} />
          </button>
          <button onClick={handleToggleStatus} className="app-icon-button" aria-label={resource.status === "approved" ? "Arquivar" : "Aprovar"} style={{ background: C.white, border: `1px solid ${C.border}` }}>
            <Archive size={14} />
          </button>
        </div>
        
        {resource.status === 'approved' && (
          <button 
            onClick={() => setShowSend(!showSend)} 
            className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--green)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity active:opacity-80"
          >
            <Send size={14} />
            Enviar a Lead
          </button>
        )}
      </div>

      {showSend && (
        <div className="border-t p-4" style={{ borderColor: C.borderSoft, background: C.white }}>
          <h5 className="mb-2 text-[13px] font-semibold text-[var(--ink)]">Enviar recurso manualmente</h5>
          <div className="flex flex-col gap-3">
            <input 
              placeholder="UUID do Lead" 
              value={leadId} 
              onChange={e => setLeadId(e.target.value)}
              className="rounded-[var(--radius-sm)] border px-3 py-2 text-[13px]" 
              style={{ borderColor: C.border, background: C.inputBg }}
            />
            <input 
              placeholder="Propósito (ex: responder_duvida)" 
              value={purpose} 
              onChange={e => setPurpose(e.target.value)}
              className="rounded-[var(--radius-sm)] border px-3 py-2 text-[13px]" 
              style={{ borderColor: C.border, background: C.inputBg }}
            />
            <div className="flex justify-end">
              <button 
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--green)] px-4 py-2 text-[13px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-50"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResourceForm({
  api,
  slug,
  initial,
  request,
  onSaved,
  onCancel,
}: {
  api: ReturnType<typeof businessApi>;
  slug: string;
  initial: Resource | null;
  request: ProfileImprovementRequest | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title || request?.request.slice(0, 200) || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [kind, setKind] = useState<ResourceKind>(initial?.kind || request?.kind || "link");
  const [purposesStr, setPurposesStr] = useState(initial?.purposes?.join(", ") || request?.purpose || "");
  const [validUntil, setValidUntil] = useState(initial?.validUntil ? initial.validUntil.split("T")[0] : "");

  const [url, setUrl] = useState(initial?.url || "");
  const [textContent, setTextContent] = useState(initial?.textContent || "");
  
  const [uploading, setUploading] = useState(false);
  const [objectPath, setObjectPath] = useState(initial?.objectPath || "");
  const [mimeType, setMimeType] = useState(initial?.mimeType || "");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const path = await uploadResourceFile(file, slug);
      setObjectPath(path);
      setMimeType(file.type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload do ficheiro");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError("Título é obrigatório.");
    
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        description,
        kind,
        purposes: purposesStr.split(",").map(s => s.trim()).filter(Boolean),
        validUntil: validUntil || null,
        url: kind === "link" || kind === "document" || kind === "video" ? url || null : null,
        textContent: kind === "text" || kind === "document" ? textContent || null : null,
        objectPath: ["image", "video", "document"].includes(kind) ? objectPath || null : null,
        mimeType: ["image", "video", "document"].includes(kind) ? mimeType || null : null,
        requestId: request?.id,
      };

      if (isEdit) {
        await api.updateResource(initial.id, payload);
      } else {
        await api.createResource(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao guardar recurso.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-2">
        <button type="button" onClick={onCancel} className="app-icon-button">
          <ArrowLeft size={16} />
        </button>
        <h3 className="text-[16px] font-semibold text-[var(--ink)]">
          {isEdit ? "Editar Recurso" : "Novo Recurso"}
        </h3>
      </div>

      {error && (
        <div className="rounded-[var(--radius-sm)] bg-[#FEF2F2] p-3 text-[13px] text-[#DC2626]">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Título *</span>
          <input 
            value={title} onChange={e => setTitle(e.target.value)}
            className="rounded-[var(--radius-md)] border px-3 py-2 text-[14px]" style={{ borderColor: C.borderSoft, background: C.white }}
            placeholder="Ex: Tabela de Preços 2024"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Descrição</span>
          <textarea 
            value={description} onChange={e => setDescription(e.target.value)}
            className="rounded-[var(--radius-md)] border px-3 py-2 text-[14px] min-h-[60px]" style={{ borderColor: C.borderSoft, background: C.white }}
            placeholder="Para que serve este recurso..."
          />
        </label>

        <div className="grid grid-cols-1 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Tipo</span>
            <select 
              value={kind} onChange={e => setKind(e.target.value as ResourceKind)}
              className="rounded-[var(--radius-md)] border px-3 py-2 text-[14px]" style={{ borderColor: C.borderSoft, background: C.white }}
            >
              <option value="link">Link</option>
              <option value="text">Texto</option>
              <option value="image">Imagem</option>
              <option value="video">Vídeo</option>
              <option value="document">Documento (PDF/Doc)</option>
            </select>
          </label>

        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Propósitos (vírgula)</span>
            <input 
              value={purposesStr} onChange={e => setPurposesStr(e.target.value)}
              className="rounded-[var(--radius-md)] border px-3 py-2 text-[14px]" style={{ borderColor: C.borderSoft, background: C.white }}
              placeholder="ex: menu, regras"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-[var(--ink-soft)]">Válido Até</span>
            <input 
              type="date"
              value={validUntil} onChange={e => setValidUntil(e.target.value)}
              className="rounded-[var(--radius-md)] border px-3 py-2 text-[14px]" style={{ borderColor: C.borderSoft, background: C.white }}
            />
          </label>
        </div>

        {!isEdit && (
          <p className="text-[12px] text-[var(--ink-soft)]">
            O recurso será guardado como rascunho privado. A publicação exige confirmação separada.
          </p>
        )}

        <div className="mt-2 flex flex-col gap-3 rounded-[var(--radius-md)] border p-4" style={{ borderColor: C.borderSoft, background: C.chatBg }}>
          <h4 className="text-[13px] font-semibold text-[var(--ink)] mb-1">Conteúdo do Recurso</h4>
          
          {["image", "video", "document"].includes(kind) && (
            <div className="flex flex-col gap-2">
              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--white)] px-4 py-2 text-[13px] font-semibold text-[var(--green)] border" style={{ borderColor: C.border }}>
                <Upload size={16} /> {uploading ? "A carregar..." : kind === "image" ? "Carregar imagem" : kind === "video" ? "Carregar vídeo" : "Carregar PDF"}
                <input type="file" accept={kind === "image" ? "image/png,image/jpeg,image/webp" : kind === "video" ? "video/mp4,video/webm,video/quicktime" : "application/pdf"} className="hidden" onChange={handleUpload} disabled={uploading} />
              </label>
              {objectPath && (
                <div className="text-[11px] text-[var(--ink-soft)] mt-1 flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-[var(--green)]" /> Upload concluído
                </div>
              )}
            </div>
          )}

          {(kind === "link" || kind === "document" || kind === "video") && (
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-[var(--ink-soft)]">URL {kind !== "link" ? "(alternativo ao upload)" : ""}</span>
              <input 
                value={url} onChange={e => setUrl(e.target.value)}
                className="rounded-[var(--radius-sm)] border px-3 py-2 text-[13px]" style={{ borderColor: C.border, background: C.white }}
                placeholder="https://"
                type="url"
              />
            </label>
          )}

          {(kind === "text" || kind === "document") && (
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-[var(--ink-soft)]">Texto {kind === "document" ? "(Ou cola o texto do documento aqui)" : ""}</span>
              <textarea 
                value={textContent} onChange={e => setTextContent(e.target.value)}
                className="rounded-[var(--radius-sm)] border px-3 py-2 text-[13px] min-h-[100px]" style={{ borderColor: C.border, background: C.white }}
                placeholder="Insere o texto..."
              />
            </label>
          )}
          
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-3 pt-4 border-t" style={{ borderColor: C.borderSoft }}>
        <button type="button" onClick={onCancel} className="rounded-[var(--radius-md)] border px-4 py-2 text-[13px] font-medium" style={{ borderColor: C.border, background: C.white }}>
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--green)] px-4 py-2 text-[13px] font-semibold text-white">
          {saving && <Loader2 size={14} className="animate-spin" />}
          Guardar Recurso
        </button>
      </div>
    </form>
  );
}
