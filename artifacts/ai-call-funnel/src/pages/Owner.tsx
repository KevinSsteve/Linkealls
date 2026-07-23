import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Store, Globe, Sparkles, ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { OwnerNav } from "../components/owner/OwnerNav";
import {
  getBusinessProfile,
  saveBusinessProfile,
  startAnalysis,
  assistFromDescription,
  type BusinessProfile,
  type ProfileDraft,
} from "../lib/api";
import { ProfileEditor } from "../components/owner/ProfileEditor";

type View = "loading" | "start" | "analyzing" | "editor";

const POLL_MS = 2500;

export function Owner() {
  const [view, setView] = useState<View>("loading");
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Start view state
  const [mode, setMode] = useState<"site" | "manual">("site");
  const [url, setUrl] = useState("");
  const [descriptionText, setDescriptionText] = useState("");
  const [busy, setBusy] = useState(false);

  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  /** Remounts the editor when a fresh analysis/draft arrives. */
  const [editorKey, setEditorKey] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const { profile: p, filled } = await getBusinessProfile();
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
  }, []);

  useEffect(() => {
    void load();
    return stopPolling;
  }, [load, stopPolling]);

  // Poll while analyzing
  useEffect(() => {
    if (view !== "analyzing") {
      stopPolling();
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const { profile: p, filled } = await getBusinessProfile();
        setProfile(p);
        if (p.analysisStatus === "done" && filled) {
          stopPolling();
          setDraft(null);
          setEditorKey((k) => k + 1);
          setNotice("Análise concluída! Revê o perfil e guarda.");
          setView("editor");
        } else if (p.analysisStatus === "done" && !filled) {
          // Analysis finished but couldn't identify the business — never poll forever
          stopPolling();
          setError(
            "A análise terminou mas não consegui identificar o negócio nesse site. Tenta outro endereço ou preenche manualmente.",
          );
          setView("start");
        } else if (p.analysisStatus === "error") {
          stopPolling();
          setError(p.analysisError ?? "A análise falhou. Tenta de novo.");
          setView(filledOr(p) ? "editor" : "start");
        }
      } catch {
        // transient polling error — keep trying
      }
    }, POLL_MS);
    return stopPolling;
  }, [view, stopPolling]);

  const filledOr = (p: BusinessProfile) => p.name.trim().length > 0;

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await startAnalysis(url.trim());
      setView("analyzing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar a análise");
    } finally {
      setBusy(false);
    }
  };

  const handleAssist = async () => {
    if (descriptionText.trim().length < 20) {
      setError("Descreve o negócio com um pouco mais de detalhe (mínimo 20 caracteres).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { draft: d } = await assistFromDescription(descriptionText.trim());
      setDraft(d);
      setEditorKey((k) => k + 1);
      setNotice("A IA estruturou o teu negócio. Revê os campos e guarda.");
      setView("editor");
    } catch (err) {
      setError(err instanceof Error ? err.message : "A IA não conseguiu estruturar a descrição");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (fields: ProfileDraft & { websiteUrl?: string | null }) => {
    setSaving(true);
    setError(null);
    try {
      const { profile: p } = await saveBusinessProfile(fields);
      setProfile(p);
      setDraft(null);
      setNotice("Perfil guardado. O agente de chamadas já fala pelo teu negócio ✅");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleReanalyze = async (u: string) => {
    setReanalyzing(true);
    setError(null);
    setNotice(null);
    try {
      await startAnalysis(u);
      setView("analyzing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar a análise");
    } finally {
      setReanalyzing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#080E18]">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-4 py-3 bg-[#101B29] border-b border-white/[0.06]">
        <Link href="/" className="p-1.5 -ml-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors" aria-label="Voltar ao funil">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="w-9 h-9 rounded-full bg-[#00A884]/15 flex items-center justify-center">
          <Store className="w-5 h-5 text-[#00A884]" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-semibold text-slate-100 leading-tight">Cérebro do Negócio</h1>
          <p className="text-[12px] text-slate-500 leading-tight">A IA atende com este conhecimento</p>
        </div>
      </header>

      {/* Alerts */}
      {(error || notice) && (
        <div className="shrink-0 flex justify-center px-4 pt-3">
          {error && (
            <div className="w-full max-w-2xl flex items-start gap-2 text-[13px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {notice && !error && (
            <div className="w-full max-w-2xl flex items-start gap-2 text-[13px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 py-4 flex justify-center">
        <div className="w-full max-w-2xl">
          {view === "loading" && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
            </div>
          )}

          {view === "start" && (
            <div className="pt-6 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-[#00A884]/15 flex items-center justify-center">
                  <Store className="w-8 h-8 text-[#00A884]" />
                </div>
                <h2 className="text-xl font-semibold text-slate-100">Ensina a IA sobre o teu negócio</h2>
                <p className="text-[14px] text-slate-400 max-w-md mx-auto">
                  Dá-me o site do teu negócio e eu estudo tudo: produtos, preços, tom de voz. Depois atendo as chamadas como se fosse da tua equipa.
                </p>
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-xl bg-[#0D1826] border border-white/[0.06] p-1">
                <button
                  onClick={() => setMode("site")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "site" ? "bg-[#00A884] text-[#06251C]" : "text-slate-400 hover:text-slate-200"}`}
                >
                  <Globe className="w-4 h-4" /> Tenho site
                </button>
                <button
                  onClick={() => setMode("manual")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "manual" ? "bg-[#00A884] text-[#06251C]" : "text-slate-400 hover:text-slate-200"}`}
                >
                  <Sparkles className="w-4 h-4" /> Não tenho site
                </button>
              </div>

              {mode === "site" ? (
                <div className="space-y-3">
                  <input
                    className="w-full bg-[#0D1826] border border-white/10 rounded-xl px-4 py-3 text-[15px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#00A884]/60 transition-colors"
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
                    className="w-full flex items-center justify-center gap-2 bg-[#00A884] hover:bg-[#02BD7E] disabled:opacity-40 text-[#06251C] font-semibold rounded-xl px-4 py-3 transition-colors"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                    Analisar o meu site
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    className="w-full bg-[#0D1826] border border-white/10 rounded-xl px-4 py-3 text-[15px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#00A884]/60 transition-colors min-h-[140px] resize-y"
                    value={descriptionText}
                    onChange={(e) => setDescriptionText(e.target.value)}
                    placeholder="Descreve o teu negócio: o que vendes, preços, quem são os clientes, o que te diferencia..."
                  />
                  <button
                    onClick={handleAssist}
                    disabled={busy || descriptionText.trim().length < 20}
                    className="w-full flex items-center justify-center gap-2 bg-[#00A884] hover:bg-[#02BD7E] disabled:opacity-40 text-[#06251C] font-semibold rounded-xl px-4 py-3 transition-colors"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Estruturar com IA
                  </button>
                </div>
              )}
            </div>
          )}

          {view === "analyzing" && (
            <div className="pt-16 text-center space-y-5">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border-2 border-[#00A884]/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#00A884] animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Globe className="w-8 h-8 text-[#00A884]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold text-slate-100">A estudar o teu site...</h2>
                <p className="text-[14px] text-slate-400 max-w-sm mx-auto">
                  Estou a ler as páginas, identificar produtos, preços e tom de voz. Isto leva alguns segundos.
                </p>
              </div>
              <div className="flex flex-col items-center gap-2 text-[13px] text-slate-500">
                <span className="inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {profile?.websiteUrl}</span>
              </div>
            </div>
          )}

          {view === "editor" && profile && (
            <ProfileEditor
              key={editorKey}
              profile={profile}
              draft={draft}
              saving={saving}
              reanalyzing={reanalyzing}
              onSave={handleSave}
              onReanalyze={handleReanalyze}
            />
          )}
        </div>
      </main>
      <OwnerNav />
    </div>
  );
}
