import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, Copy, Loader2, Megaphone, Check, Plus, Image as ImageIcon, Video, X, Pause, Play, Link2 } from "lucide-react";
import { businessApi, uploadMedia, confirmSensitiveAction, getStorageObjectUrl, type TrafficCreative } from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { OwnerNav } from "../../components/owner/OwnerNav";

function CreativeCard({ creative, businessSlug, onToggle, onCopy, onError }: { creative: TrafficCreative; businessSlug: string; onToggle: (c: TrafficCreative) => Promise<void>; onCopy: (url: string) => void; onError: (msg: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [toggling, setToggling] = useState(false);
  const isActive = creative.active === 1;
  const mediaUrl = getStorageObjectUrl(creative.objectPath);
  const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL}e/${encodeURIComponent(businessSlug)}/t/${encodeURIComponent(creative.publicSlug)}`;

  const handleCopy = useCallback(() => {
    onCopy(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl, onCopy]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      await onToggle(creative);
    } catch (e) {
      onError("Não foi possível actualizar o estado do link.");
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm mb-4">
      <div className="relative aspect-video w-full bg-[var(--subtle)] overflow-hidden">
        {creative.mediaType === "video" ? (
          <video src={mediaUrl} controls playsInline className="h-full w-full object-contain bg-black" />
        ) : (
          <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          {isActive ? (
            <span className="flex items-center gap-1 rounded-full bg-[#166534] px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Activo
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-[#B45309] px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
              Pausado
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        <p className="text-[14px] leading-relaxed text-[var(--ink)] whitespace-pre-wrap font-medium">{creative.description}</p>
        <p className="mt-2 text-[12px] font-medium text-[var(--ink-soft)]">
          Criado em {new Date(creative.createdAt).toLocaleDateString("pt-AO")}
        </p>

        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">Link público do anúncio</span>
            <div className="flex items-center gap-2">
              <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--green)]">
                {shareUrl}
              </a>
              <button onClick={handleCopy} className="app-icon-button bg-[var(--subtle)] shrink-0" aria-label="Copiar link">
                {copied ? <Check size={16} className="text-[#166534]" /> : <Copy size={16} className="text-[var(--ink-soft)]" />}
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)]">
            <button
              onClick={handleToggle}
              disabled={toggling}
              className="w-full rounded-xl bg-[var(--subtle)] py-2.5 text-[13px] font-bold text-[var(--ink)] transition-colors active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {toggling ? <Loader2 size={16} className="animate-spin" /> : isActive ? <Pause size={16} /> : <Play size={16} />}
              {isActive ? "Pausar link" : "Activar link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LaunchCampaigns() {
  const slug = useBusinessSlug();
  const api = useMemo(() => (slug ? businessApi(slug) : null), [slug]);
  const [creatives, setCreatives] = useState<TrafficCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const res = await api.listTrafficCreatives();
      setCreatives(res.creatives);
      setError(null);
    } catch {
      setError("Não foi possível carregar os criativos de tráfego.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const handleCopy = useCallback((url: string) => {
    navigator.clipboard.writeText(url).catch(() => {});
  }, []);

  const handleToggle = useCallback(async (creative: TrafficCreative) => {
    if (!api) return;
    if (!(await confirmSensitiveAction())) return;
    const res = await api.updateTrafficCreative(creative.id, { active: creative.active !== 1 });
    setCreatives((prev) => prev.map(c => c.id === creative.id ? res.creative : c));
  }, [api]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime"];
    if (!allowed.includes(f.type)) {
      setFormError("Escolhe uma imagem PNG, JPG ou WebP, ou um vídeo MP4, WebM ou MOV.");
      e.target.value = "";
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setFormError("O ficheiro deve ter no máximo 50 MB.");
      e.target.value = "";
      return;
    }
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setFormError(null);
  };

  const cancelCreate = () => {
    setIsCreating(false);
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setDescription("");
    setFormError(null);
  };

  const submitCreative = async () => {
    if (!file || !description.trim() || !api || !slug) return;
    setUploading(true);
    setFormError(null);
    try {
      if (!(await confirmSensitiveAction())) {
        setUploading(false);
        return;
      }
      const objectPath = await uploadMedia(file, slug);
      const res = await api.createTrafficCreative({
        description: description.trim(),
        objectPath,
        mediaMimeType: file.type,
      });
      setCreatives(prev => [res.creative, ...prev]);
      cancelCreate();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao guardar anúncio.");
    } finally {
      setUploading(false);
    }
  };

  if (!slug || !api) return null;

  return (
    <div className="owner-view-root bg-[var(--app-bg)]">
      <header className="owner-header justify-between">
        <div className="owner-header-title">Tráfego Pago</div>
        {!isCreating && (
          <Link href={`/e/${slug}/dono/campanhas/historico`} className="text-[13px] font-semibold text-[var(--green)]">
             Histórico
          </Link>
        )}
      </header>

      <main className="owner-content-scroll px-4 py-4">
        {isCreating ? (
          <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--subtle)]">
              <h2 className="text-[15px] font-bold text-[var(--ink)]">Novo Anúncio</h2>
              <button onClick={cancelCreate} disabled={uploading} className="app-icon-button -mr-2">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              {formError && (
                <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-[13px] text-[#B91C1C] flex gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" /> {formError}
                </div>
              )}

              <div
                className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--subtle)] overflow-hidden aspect-square cursor-pointer active:scale-95 transition-transform"
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                {previewUrl ? (
                  file?.type.startsWith("video/") ? (
                    <video src={previewUrl} className="h-full w-full object-cover" muted loop autoPlay playsInline />
                  ) : (
                    <img src={previewUrl} className="h-full w-full object-cover" alt="Preview" />
                  )
                ) : (
                  <div className="flex flex-col items-center gap-3 p-6 text-center">
                    <div className="flex gap-2 text-[var(--green)]">
                      <ImageIcon size={28} />
                      <Video size={28} />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold text-[var(--ink)]">Adicionar mídia</p>
                      <p className="mt-1 text-[12px] text-[var(--ink-soft)]">Imagem ou vídeo do teu anúncio. Usa a mesma mídia que vais publicar no Facebook/Instagram.</p>
                    </div>
                  </div>
                )}
              </div>
              <input type="file" accept=".png,.jpg,.jpeg,.webp,.mp4,.webm,.mov" className="hidden" ref={fileInputRef} onChange={handleFileSelect} disabled={uploading} />

              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide text-[var(--ink-faint)] mb-1.5">Contexto / Copy</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Cola aqui o texto (copy) do teu anúncio. Isto ajuda o assistente a entender o contexto da conversa."
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--subtle)] p-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--green)] min-h-[100px] resize-none"
                  disabled={uploading}
                />
              </div>

              <button
                onClick={submitCreative}
                disabled={uploading || !file || !description.trim()}
                className="w-full flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[var(--green)] text-[15px] font-bold text-white shadow-sm disabled:opacity-50 active:scale-95 transition-transform"
              >
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <Megaphone size={18} />}
                {uploading ? "A processar..." : "Gerar link público"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setIsCreating(true)}
              className="mb-6 w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-white p-5 text-[15px] font-bold text-[var(--green)] active:scale-95 transition-transform"
            >
              <Plus size={20} />
              Criar novo link de anúncio
            </button>

            {loading ? (
              <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-[var(--green)]" /></div>
            ) : error ? (
              <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-[13px] text-[#B91C1C] flex gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
              </div>
            ) : creatives.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-white py-12 px-6 text-center shadow-sm">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--green-light)] mb-4">
                  <Link2 size={24} className="text-[var(--green)]" />
                </div>
                <h3 className="text-[16px] font-bold text-[var(--ink)]">A tua ponte das redes sociais</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-soft)]">
                  Cria um link dedicado para os teus anúncios. Quando alguém clica no teu anúncio no Facebook ou Instagram, cai diretamente no WhatsApp do teu negócio com o contexto certo.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {creatives.map(c => (
                  <CreativeCard key={c.id} creative={c} businessSlug={slug} onToggle={handleToggle} onCopy={handleCopy} onError={setError} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <OwnerNav />
    </div>
  );
}
