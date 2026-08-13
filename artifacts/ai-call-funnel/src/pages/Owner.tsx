import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Globe, Sparkles, Loader2, AlertCircle, CheckCircle2,
  Zap, Grid3x3, Megaphone, Users, ChevronRight, X, Store,
} from "lucide-react";
import { OwnerNav } from "../components/owner/OwnerNav";
import {
  businessApi,
  type BusinessProfile,
  type ProfileDraft,
} from "../lib/api";
import { useBusinessSlug } from "../hooks/useBusinessSlug";
import { ProfileEditor } from "../components/owner/ProfileEditor";

type View = "loading" | "start" | "analyzing" | "editor";

const POLL_MS = 2500;

// ─── Colours ─────────────────────────────────────────────────────────────────
const C = {
  bg:       "#F0F2F5",
  white:    "#FFFFFF",
  text:     "#111B21",
  text2:    "#667781",
  text3:    "#8696A0",
  green:    "#00A884",
  border:   "#E9EDEF",
  inputBg:  "#F0F2F5",
};

// ─── Tool row ─────────────────────────────────────────────────────────────────
function ToolRow({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  description,
  href,
  active,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className="flex items-center gap-4 px-5 py-3.5 cursor-pointer active:bg-gray-50 transition-colors"
        style={{ background: C.white }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: iconBg }}
        >
          <Icon size={20} style={{ color: iconColor }} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium" style={{ color: C.text }}>{title}</p>
          <p className="text-[13px] mt-0.5 leading-snug" style={{ color: C.text2 }}>{description}</p>
        </div>
        {active !== undefined && (
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: active ? C.green : C.border }}
          />
        )}
        {active === undefined && (
          <ChevronRight size={16} style={{ color: C.text3 }} className="shrink-0" />
        )}
      </div>
    </Link>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-5 pt-5 pb-2">
      <p className="text-[13px] font-semibold" style={{ color: C.text2 }}>{label}</p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function Owner() {
  const slug = useBusinessSlug();
  const api = useMemo(() => (slug ? businessApi(slug) : null), [slug]);

  const [view, setView] = useState<View>("loading");
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [mode, setMode] = useState<"site" | "manual">("site");
  const [url, setUrl] = useState("");
  const [descriptionText, setDescriptionText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [promoVisible, setPromoVisible] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const { profile: p, filled } = await api.getProfile();
      setProfile(p);
      setUrl(p.websiteUrl ?? "");
      if (p.analysisStatus === "running") setView("analyzing");
      else if (filled) setView("editor");
      else {
        if (p.analysisStatus === "error" && p.analysisError) setError(p.analysisError);
        setView("start");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
      setView("start");
    }
  }, [api]);

  useEffect(() => { void load(); return stopPolling; }, [load, stopPolling]);

  useEffect(() => {
    if (view !== "analyzing" || !api) { stopPolling(); return; }
    pollRef.current = setInterval(async () => {
      try {
        const { profile: p, filled } = await api.getProfile();
        setProfile(p);
        if (p.analysisStatus === "done" && filled) {
          stopPolling(); setDraft(null); setEditorKey((k) => k + 1);
          setNotice("Análise concluída! Revê o perfil e guarda."); setView("editor");
        } else if (p.analysisStatus === "done" && !filled) {
          stopPolling();
          setError("A análise terminou mas não consegui identificar o negócio. Tenta outro endereço ou preenche manualmente.");
          setView("start");
        } else if (p.analysisStatus === "error") {
          stopPolling();
          setError(p.analysisError ?? "A análise falhou. Tenta de novo.");
          setView(p.name.trim().length > 0 ? "editor" : "start");
        }
      } catch { /* transient */ }
    }, POLL_MS);
    return stopPolling;
  }, [view, stopPolling, api]);

  const handleAnalyze = async () => {
    if (!url.trim() || !api) return;
    setBusy(true); setError(null);
    try { await api.startAnalysis(url.trim()); setView("analyzing"); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível iniciar a análise"); }
    finally { setBusy(false); }
  };

  const handleAssist = async () => {
    if (descriptionText.trim().length < 20) {
      setError("Descreve o negócio com um pouco mais de detalhe (mínimo 20 caracteres)."); return;
    }
    if (!api) return;
    setBusy(true); setError(null);
    try {
      const { draft: d } = await api.assistFromDescription(descriptionText.trim());
      setDraft(d); setEditorKey((k) => k + 1);
      setNotice("A IA estruturou o teu negócio. Revê os campos e guarda."); setView("editor");
    } catch (err) { setError(err instanceof Error ? err.message : "A IA não conseguiu estruturar a descrição"); }
    finally { setBusy(false); }
  };

  const handleSave = async (fields: ProfileDraft & { websiteUrl?: string | null }) => {
    if (!api) return;
    setSaving(true); setError(null);
    try {
      const { profile: p } = await api.saveProfile(fields);
      setProfile(p); setDraft(null);
      setNotice("Perfil guardado. O agente de chamadas já fala pelo teu negócio ✅");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível guardar"); }
    finally { setSaving(false); }
  };

  const handleReanalyze = async (u: string) => {
    if (!api) return;
    setReanalyzing(true); setError(null); setNotice(null);
    try { await api.startAnalysis(u); setView("analyzing"); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível iniciar a análise"); }
    finally { setReanalyzing(false); }
  };

  if (!slug) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: C.text2, background: C.bg }}>
        Negócio não encontrado.
      </div>
    );
  }

  const isProfileReady = view === "editor" && profile;

  return (
    <div className="h-full flex flex-col" style={{ background: C.bg }}>

      {/* ── Header (WhatsApp Business style) ─────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-5 py-4"
        style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}
      >
        <h1 className="text-[22px] font-bold" style={{ color: C.text }}>
          {profile?.name || "Linkealls"}
        </h1>
        <div className="flex items-center gap-4" style={{ color: C.text2 }}>
          <Link href={`/e/${slug}`} title="Ver página pública">
            <Store size={20} strokeWidth={1.8} style={{ color: C.text2 }} />
          </Link>
        </div>
      </header>

      {/* ── Alerts ───────────────────────────────────────────────────────── */}
      {(error || notice) && (
        <div className="shrink-0 px-4 pt-3">
          {error && (
            <div className="flex items-start gap-2 text-[13px] rounded-xl px-3.5 py-2.5"
              style={{ background: "#FFF0F0", border: "1px solid #FFCDD2", color: "#C62828" }}>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto shrink-0"><X size={14} /></button>
            </div>
          )}
          {notice && !error && (
            <div className="flex items-start gap-2 text-[13px] rounded-xl px-3.5 py-2.5"
              style={{ background: "#F0FFF8", border: "1px solid #C3E6D5", color: "#1B7A55" }}>
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{notice}</span>
              <button onClick={() => setNotice(null)} className="ml-auto shrink-0"><X size={14} /></button>
            </div>
          )}
        </div>
      )}

      <main className="flex-1 overflow-y-auto">

        {/* ── Loading ────────────────────────────────────────────────────── */}
        {view === "loading" && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.text3 }} />
          </div>
        )}

        {/* ── Start: setup form ──────────────────────────────────────────── */}
        {view === "start" && (
          <>
            {/* Promo card "Para você" */}
            {promoVisible && (
              <>
                <SectionLabel label="Para você" />
                <div className="mx-4">
                  <div className="rounded-2xl p-4 flex gap-3 relative" style={{ background: C.white, border: `1px solid ${C.border}` }}>
                    <button
                      onClick={() => setPromoVisible(false)}
                      className="absolute top-3 right-3"
                      style={{ color: C.text3 }}
                    >
                      <X size={16} />
                    </button>
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "#E8F5E9" }}>
                      <Sparkles size={22} style={{ color: C.green }} />
                    </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="font-semibold text-[14px] leading-snug" style={{ color: C.text }}>
                        Configura o teu assistente IA
                      </p>
                      <p className="text-[12px] mt-1 leading-relaxed" style={{ color: C.text2 }}>
                        Ensina a IA sobre o teu negócio para atender clientes automaticamente, 24h por dia.
                      </p>
                      <button
                        onClick={() => {
                          setPromoVisible(false);
                          // Scroll to the setup form which is rendered next
                          setTimeout(() => {
                            document.querySelector<HTMLInputElement>("input[inputmode='url'], textarea")?.focus();
                          }, 100);
                        }}
                        className="mt-3 px-4 py-1.5 rounded-full text-[13px] font-semibold"
                        style={{ background: C.text, color: "#FFFFFF" }}
                      >
                        Começar agora
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            <SectionLabel label="Configurar negócio" />
            <div className="mx-4 rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.white }}>
              {/* Mode toggle */}
              <div className="flex" style={{ borderBottom: `1px solid ${C.border}` }}>
                <button
                  onClick={() => setMode("site")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[14px] font-medium transition-colors"
                  style={{
                    color: mode === "site" ? C.green : C.text2,
                    borderBottom: mode === "site" ? `2px solid ${C.green}` : "2px solid transparent",
                  }}
                >
                  <Globe className="w-4 h-4" /> Tenho site
                </button>
                <button
                  onClick={() => setMode("manual")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[14px] font-medium transition-colors"
                  style={{
                    color: mode === "manual" ? C.green : C.text2,
                    borderBottom: mode === "manual" ? `2px solid ${C.green}` : "2px solid transparent",
                  }}
                >
                  <Sparkles className="w-4 h-4" /> Sem site
                </button>
              </div>

              <div className="p-4 space-y-3">
                {mode === "site" ? (
                  <>
                    <input
                      className="w-full rounded-xl px-4 py-3 text-[15px] outline-none transition-colors"
                      style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text }}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                      placeholder="https://oteusite.co.ao"
                      inputMode="url"
                      autoCapitalize="none"
                    />
                    <button
                      onClick={handleAnalyze}
                      disabled={busy || !url.trim()}
                      className="w-full flex items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold transition-opacity"
                      style={{ background: C.green, color: "#fff", opacity: busy || !url.trim() ? 0.5 : 1 }}
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                      Analisar o meu site
                    </button>
                  </>
                ) : (
                  <>
                    <textarea
                      className="w-full rounded-xl px-4 py-3 text-[15px] outline-none resize-y min-h-[120px]"
                      style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text }}
                      value={descriptionText}
                      onChange={(e) => setDescriptionText(e.target.value)}
                      placeholder="Descreve o teu negócio: o que vendes, preços, quem são os clientes..."
                    />
                    <button
                      onClick={handleAssist}
                      disabled={busy || descriptionText.trim().length < 20}
                      className="w-full flex items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold transition-opacity"
                      style={{ background: C.green, color: "#fff", opacity: busy || descriptionText.trim().length < 20 ? 0.5 : 1 }}
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Estruturar com IA
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Analyzing ──────────────────────────────────────────────────── */}
        {view === "analyzing" && (
          <div className="flex flex-col items-center justify-center py-20 gap-5 px-8 text-center">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${C.green}20` }} />
              <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                style={{ borderTopColor: C.green }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Globe className="w-8 h-8" style={{ color: C.green }} />
              </div>
            </div>
            <div>
              <h2 className="text-[18px] font-semibold" style={{ color: C.text }}>A estudar o teu site...</h2>
              <p className="text-[14px] mt-1.5 leading-relaxed" style={{ color: C.text2 }}>
                Estou a ler as páginas, identificar produtos e preços. Isto leva alguns segundos.
              </p>
            </div>
            <p className="text-[12px] flex items-center gap-1.5" style={{ color: C.text3 }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {profile?.websiteUrl}
            </p>
          </div>
        )}

        {/* ── Editor ─────────────────────────────────────────────────────── */}
        {view === "editor" && profile && (
          <div className="mx-4 my-4">
            <ProfileEditor
              key={editorKey}
              profile={profile}
              draft={draft}
              saving={saving}
              reanalyzing={reanalyzing}
              onSave={handleSave}
              onReanalyze={handleReanalyze}
            />
          </div>
        )}

        {/* ── Ferramentas (only when profile is ready) ───────────────────── */}
        {isProfileReady && (
          <>
            <SectionLabel label="Expanda o teu negócio" />
            <div className="rounded-none overflow-hidden" style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
              <ToolRow
                icon={Zap}
                iconColor="#00A884"
                iconBg="#E8F5E9"
                title="Assistente IA"
                description="Responde aos clientes 24 horas por dia, 7 dias por semana"
                href={`/e/${slug}/dono/assistente`}
                active={true}
              />
              <div style={{ borderTop: `1px solid ${C.border}` }} />
              <ToolRow
                icon={Grid3x3}
                iconColor="#1976D2"
                iconBg="#E3F2FD"
                title="Catálogo"
                description="Exibe os teus produtos e serviços"
                href={`/e/${slug}/catalogo`}
              />
              <div style={{ borderTop: `1px solid ${C.border}` }} />
              <ToolRow
                icon={Megaphone}
                iconColor="#E65100"
                iconBg="#FFF3E0"
                title="Campanhas"
                description="Cria anúncios para trazer mais clientes"
                href={`/e/${slug}/dono/campanhas`}
              />
              <div style={{ borderTop: `1px solid ${C.border}` }} />
              <ToolRow
                icon={Users}
                iconColor="#7B1FA2"
                iconBg="#F3E5F5"
                title="Leads"
                description="Gere todos os contactos qualificados"
                href={`/e/${slug}/dono/leads`}
              />
            </div>
          </>
        )}

        <div className="h-4" />
      </main>

      <OwnerNav />
    </div>
  );
}
