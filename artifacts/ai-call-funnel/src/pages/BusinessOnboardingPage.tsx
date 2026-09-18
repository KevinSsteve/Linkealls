import { useState, useEffect, useRef } from "react";
import { ArrowRight, Globe, Camera, AlignLeft, X, Loader2, Check } from "lucide-react";
import { Link, Redirect, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { saveBusinessOnboarding, readBusinessOnboarding, clearBusinessOnboarding } from "@/lib/businessOnboarding";
import { AuthBrand, AuthMark } from "@/components/auth/AuthBrand";
import { analyzeBusinessOnboarding, AuthApiError, type BusinessAnalysisResult, type BusinessAnalysisInput } from "@/lib/api";
import { processAnalysisImage } from "@/lib/imageProcessor";

const INK = "#0A2540";
const SOFT = "#344558";
const FAINT = "#5b6e82";
const LINE = "#E6EBF1";
const SUBTLE = "#F1F5F9";
const ACCENT = "#635BFF";

type Mode = "site" | "image" | "description";

export function BusinessOnboardingPage() {
  const [, nav] = useLocation();
  const { isLoading, isLoggedIn, user } = useAuth();

  const [mode, setMode] = useState<Mode>("site");
  const [siteValue, setSiteValue] = useState("");
  const [descValue, setDescValue] = useState("");
  const [imageFile, setImageFile] = useState<{ name: string; base64: string; mimeType: string; objectUrl: string } | null>(null);
  const [imageDesc, setImageDesc] = useState("");

  const [error, setError] = useState("");
  const [isAuthExpired, setIsAuthExpired] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<BusinessAnalysisResult | null>(null);

  const submitGuardRef = useRef(false);
  const imageRequestRef = useRef(0);

  useEffect(() => {
    if (!user?.id) return;
    const draft = readBusinessOnboarding(user.id);
    if (draft) {
      setMode(draft.mode === "image" ? "image" : draft.mode === "description" ? "description" : "site");
      if (draft.mode === "site") {
        setSiteValue(draft.value);
      } else if (draft.mode === "description") {
        setDescValue(draft.value);
      } else if (draft.mode === "image") {
        setImageDesc(draft.value === "Imagem carregada" ? "" : draft.value);
      }
      if (draft.analysis) {
        setAnalysisResult(draft.analysis);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    let timer: number;
    if (isAnalyzing) {
      timer = window.setTimeout(() => setIsSlow(true), 8000);
    } else {
      setIsSlow(false);
    }
    return () => window.clearTimeout(timer);
  }, [isAnalyzing]);

  useEffect(() => {
    return () => {
      if (imageFile?.objectUrl) {
        URL.revokeObjectURL(imageFile.objectUrl);
      }
    };
  }, [imageFile?.objectUrl]);

  if (isLoading) {
    return (
      <main className="auth-clean-page min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-[#FBFAFF]">
        <AuthMark size={64} className="animate-pulse" />
        <p role="status" className="text-sm text-[#344558]">A abrir a configuração…</p>
      </main>
    );
  }

  if (!isLoggedIn) return <Redirect to="/login?next=/configurar-negocio" />;

  function checkUrl(url: string): { valid: string | null; isInstagram: boolean } {
    if (!url || /\s/.test(url)) return { valid: null, isInstagram: false };
    if (/^[a-z][a-z\d+.-]*:/i.test(url) && !/^https?:\/\//i.test(url)) return { valid: null, isInstagram: false };
    let urlToTest = url;
    if (!/^https?:\/\//i.test(urlToTest)) {
      urlToTest = `https://${urlToTest}`;
    }
    try {
      const parsed = new URL(urlToTest);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { valid: null, isInstagram: false };
      if (!parsed.hostname.includes(".")) return { valid: null, isInstagram: false };
      if (parsed.username || parsed.password) return { valid: null, isInstagram: false };
      const isInstagram = parsed.hostname.includes("instagram.com");
      return { valid: isInstagram ? null : parsed.href, isInstagram };
    } catch {
      return { valid: null, isInstagram: false };
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = "";
    setError("");
    setIsProcessingImage(true);
    const reqId = ++imageRequestRef.current;

    try {
      const processed = await processAnalysisImage(file);
      if (reqId === imageRequestRef.current) {
        setImageFile((prev) => {
          if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
          return {
            name: file.name,
            ...processed
          };
        });
      } else {
        URL.revokeObjectURL(processed.objectUrl);
      }
    } catch (err) {
      if (reqId === imageRequestRef.current) {
        setError(err instanceof Error ? err.message : "Erro ao processar a imagem.");
      }
    } finally {
      if (reqId === imageRequestRef.current) {
        setIsProcessingImage(false);
      }
    }
  }

  async function continueOnboarding() {
    if (submitGuardRef.current || isProcessingImage || isAnalyzing) return;
    submitGuardRef.current = true;
    setError("");
    setIsAuthExpired(false);
    const trimmedSite = siteValue.trim();
    const trimmedDesc = descValue.trim();

    let input: BusinessAnalysisInput;

    if (mode === "site") {
      if (trimmedSite.length < 4) {
        setError("Coloca o link do site da tua empresa.");
        submitGuardRef.current = false;
        return;
      }
      const { valid, isInstagram } = checkUrl(trimmedSite);
      if (isInstagram) {
        setError("Para o Instagram, usa a opção 'Imagem' e carrega um screenshot do teu perfil ou dos serviços.");
        submitGuardRef.current = false;
        return;
      }
      if (!valid) {
        setError("O endereço do site não parece ser válido.");
        submitGuardRef.current = false;
        return;
      }
      input = { mode: "site", url: valid };
    } else if (mode === "description") {
      if (trimmedDesc.length < 20) {
        setError("Descreve o teu negócio com pelo menos 20 caracteres.");
        submitGuardRef.current = false;
        return;
      }
      if (trimmedDesc.length > 6000) {
        setError("A descrição não pode ter mais de 6000 caracteres.");
        submitGuardRef.current = false;
        return;
      }
      input = { mode: "description", description: trimmedDesc };
    } else {
      if (!imageFile) {
        setError("Carrega uma imagem ou escolhe outra opção.");
        submitGuardRef.current = false;
        return;
      }
      if (imageDesc.length > 6000) {
        setError("A descrição opcional é demasiado longa.");
        submitGuardRef.current = false;
        return;
      }
      input = {
        mode: "image",
        imageBase64: imageFile.base64,
        mimeType: imageFile.mimeType as "image/jpeg" | "image/png" | "image/webp",
        description: imageDesc.trim() || undefined,
      };
    }

    setIsAnalyzing(true);
    try {
      const result = await analyzeBusinessOnboarding(input);
      setAnalysisResult(result);

      let value = "";
      if (input.mode === "site") value = input.url;
      if (input.mode === "description" && input.description) value = input.description;
      if (input.mode === "image") value = imageDesc.trim() || imageFile?.name || "Imagem carregada";

      try {
        saveBusinessOnboarding({ mode, value, analysis: result, userId: user?.id });
      } catch (saveErr) {
        setError(saveErr instanceof Error ? saveErr.message : "Erro ao guardar o rascunho na sessão.");
      }
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 401) {
        setIsAuthExpired(true);
      }
      const msg = err instanceof Error ? err.message : "Erro ao analisar o material.";
      setError(msg);

      // Preserve safe drafts even on error
      try {
        if (input.mode === "site") saveBusinessOnboarding({ mode, value: input.url, userId: user?.id });
        if (input.mode === "description" && input.description) {
          saveBusinessOnboarding({ mode, value: input.description, userId: user?.id });
        }
        if (input.mode === "image") {
          saveBusinessOnboarding({ mode, value: imageDesc.trim() || imageFile?.name || "Imagem carregada", userId: user?.id });
        }
      } catch {
        setError(`${msg} O navegador também não conseguiu guardar o rascunho. Mantém esta página aberta para não perderes os dados.`);
      }
    } finally {
      setIsAnalyzing(false);
      submitGuardRef.current = false;
    }
  }

  function handleModeChange(newMode: Mode) {
    if (isAnalyzing || isProcessingImage) return;
    setMode(newMode);
    setError("");
  }

  function saveAndContinue() {
    if (!analysisResult) return;
    try {
      saveBusinessOnboarding({
        mode,
        value: mode === "site" ? analysisResult.sourceUrl || siteValue.trim()
          : mode === "description" ? descValue.trim()
          : imageDesc.trim() || imageFile?.name || "Imagem carregada",
        analysis: analysisResult,
        userId: user?.id,
      });
      nav(user?.handle ? `/e/${user.handle}/dono?onboarding=1` : "/escolher-handle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível guardar o rascunho. Tenta novamente.");
    }
  }

  function resetAnalysis() {
    setAnalysisResult(null);
    clearBusinessOnboarding();
  }

  return (
    <main
      className="auth-clean-page flex min-h-[100dvh] justify-center"
      style={{
        background: "#FBFAFF",
        color: INK,
      }}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[560px] flex-col px-5 py-6 sm:px-10 sm:py-10">
        <div className="mb-12 flex items-center justify-between">
          <AuthBrand />
          <span className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: FAINT }}>
            1 de 2
          </span>
        </div>

        {analysisResult ? (
          <section className="auth-content my-auto pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="max-w-[520px] text-[clamp(28px,7vw,40px)] font-extrabold leading-[1.05] tracking-[-0.04em]">
              Análise concluída.
            </h1>
            <p className="mt-4 max-w-[490px] text-[16px] leading-relaxed" style={{ color: SOFT }}>
              Aqui está o resumo do teu negócio estruturado pela IA. Revê e avança para o editor.
            </p>

            <div className="mt-8 rounded-[16px] border bg-white p-6 text-left shadow-sm" style={{ borderColor: LINE }}>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#EEECFF] px-3 py-1 text-[12px] font-bold text-[#635BFF]">
                <Check size={14} strokeWidth={2.5} /> Preparado com sucesso
              </div>
              <h2 className="text-[20px] font-extrabold leading-tight tracking-tight" style={{ color: INK }}>
                {analysisResult.draft.name || "Negócio sem nome"}
              </h2>
              {analysisResult.draft.sector && (
                <p className="mt-1 text-[12px] font-bold uppercase tracking-wider text-[#635BFF]">
                  {analysisResult.draft.sector}
                </p>
              )}
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: SOFT }}>
                {analysisResult.draft.description || "Não foi possível gerar uma descrição."}
              </p>

              {analysisResult.draft.offerings && analysisResult.draft.offerings.length > 0 && (
                <div className="mt-6 border-t pt-5" style={{ borderColor: LINE }}>
                  <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: FAINT }}>
                    Principais Serviços ({analysisResult.draft.offerings.length})
                  </h3>
                  <ul className="mt-3 flex flex-col gap-4">
                    {analysisResult.draft.offerings.slice(0, 3).map((offering, i) => (
                      <li key={i} className="flex flex-col gap-1">
                        <span className="text-[14px] font-bold" style={{ color: INK }}>{offering.name}</span>
                        {offering.description && (
                          <span className="text-[13px] leading-relaxed" style={{ color: SOFT }}>
                            {offering.description.length > 90 ? offering.description.substring(0, 90) + "..." : offering.description}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3">
                <p className="text-[13px] font-medium text-[#B34235]" role="alert">{error}</p>
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={saveAndContinue}
                className="auth-primary flex min-h-[56px] w-full items-center justify-between rounded-[16px] px-5 text-left font-bold transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
                style={{ background: ACCENT, color: "#FFFFFF", boxShadow: "0 8px 20px rgba(99,91,255,0.15)" }}
              >
                <span>Rever e Continuar</span>
                <ArrowRight size={19} strokeWidth={2.3} />
              </button>
              <button
                onClick={resetAnalysis}
                className="flex min-h-[56px] w-full items-center justify-center rounded-[16px] font-bold transition-colors"
                style={{ color: FAINT, background: SUBTLE }}
              >
                Alterar fonte e analisar novamente
              </button>
            </div>
          </section>
        ) : (
          <section className="auth-content my-auto pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <p className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.12em]" style={{ color: ACCENT }}>
              Configurar negócio
            </p>
            <h1 className="max-w-[520px] text-[clamp(32px,8vw,48px)] font-extrabold leading-[1.05] tracking-[-0.04em]">
              Vamos preparar o teu perfil.
            </h1>
            <p className="mt-4 max-w-[490px] text-[16px] leading-relaxed" style={{ color: SOFT }}>
              Partilha material que já tens. A IA lê e estrutura um rascunho de perfil pronto para tu reveres.
            </p>

            <div className="mt-8 flex overflow-x-auto rounded-[16px] border p-1" style={{ borderColor: LINE, background: SUBTLE }}>
              {(["site", "image", "description"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleModeChange(opt)}
                  disabled={isProcessingImage}
                  className="flex min-h-[44px] min-w-[100px] flex-1 items-center justify-center gap-2 rounded-[12px] text-[14px] font-bold transition-colors disabled:opacity-50"
                  style={{
                    background: mode === opt ? "#FFFFFF" : "transparent",
                    color: mode === opt ? INK : FAINT,
                    boxShadow: mode === opt ? "0 2px 8px rgba(10,37,64,0.07)" : "none",
                  }}
                >
                  {opt === "site" && <><Globe size={16} /> Site</>}
                  {opt === "image" && <><Camera size={16} /> Imagem</>}
                  {opt === "description" && <><AlignLeft size={16} /> Texto</>}
                </button>
              ))}
            </div>

            {mode === "site" && (
              <div className="mt-4">
                <input
                  value={siteValue}
                  onChange={(e) => { setSiteValue(e.target.value); setError(""); setIsAuthExpired(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") continueOnboarding(); }}
                  placeholder="https://oteusite.co.ao"
                  inputMode="url"
                  autoCapitalize="none"
                  className="min-h-[56px] w-full rounded-[16px] border px-4 text-[16px] outline-none focus:border-[#635BFF]"
                  style={{ borderColor: LINE, background: "#FFFFFF", color: INK }}
                  data-testid="input-onboarding-website"
                  aria-invalid={!!error}
                  disabled={isAnalyzing || isProcessingImage}
                />
              </div>
            )}

            {mode === "description" && (
              <div className="mt-4">
                <textarea
                  value={descValue}
                  onChange={(e) => { setDescValue(e.target.value); setError(""); setIsAuthExpired(false); }}
                  placeholder="Ex.: Tenho uma pastelaria em Luanda. Vendemos bolos, salgados e fazemos entregas..."
                  autoFocus
                  className="min-h-[150px] w-full resize-y rounded-[16px] border px-4 py-4 text-[16px] leading-relaxed outline-none focus:border-[#635BFF]"
                  style={{ borderColor: LINE, background: "#FFFFFF", color: INK }}
                  data-testid="input-onboarding-description"
                  aria-invalid={!!error}
                  disabled={isAnalyzing || isProcessingImage}
                />
              </div>
            )}

            {mode === "image" && (
              <div className="mt-4">
                {isProcessingImage ? (
                  <div className="flex flex-col items-center justify-center rounded-[16px] border-2 border-dashed p-6 text-center transition-colors bg-[#F8FAFC]" style={{ borderColor: LINE }}>
                    <Loader2 size={24} className="animate-spin mb-3" style={{ color: ACCENT }} />
                    <p className="text-[14px] leading-relaxed text-[#344558]">A preparar imagem...</p>
                  </div>
                ) : !imageFile ? (
                  <div className="flex flex-col items-center justify-center rounded-[16px] border-2 border-dashed p-6 text-center transition-colors hover:bg-[#F8FAFC]" style={{ borderColor: LINE }}>
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9] text-[#5b6e82]">
                      <Camera size={24} strokeWidth={1.5} />
                    </div>
                    <p className="mb-4 text-[14px] leading-relaxed text-[#344558]">
                      Para Instagram: abre o teu perfil, tira screenshot da bio e dos serviços, volta aqui e carrega a imagem. Se não tens Instagram, escolhe uma foto dos teus serviços ou descreve o negócio em Texto.
                    </p>
                    <label className="cursor-pointer rounded-[12px] bg-white px-5 py-2.5 text-[14px] font-bold text-[#0A2540] shadow-[0_2px_8px_rgba(10,37,64,0.08)] transition-transform hover:bg-[#F8FAFC] active:scale-95">
                      Escolher Imagem
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={isAnalyzing || isProcessingImage}
                      />
                    </label>
                    <p className="mt-4 text-[12px] text-[#5b6e82]">
                      A imagem serve apenas para extrair informação. Não será guardada nem publicada.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="relative overflow-hidden rounded-[16px] border bg-[#F8FAFC]" style={{ borderColor: LINE }}>
                      <img src={imageFile.objectUrl} alt="Preview" className="w-full max-h-[220px] object-cover" />
                      {!isAnalyzing && (
                        <button
                          onClick={() => setImageFile(null)}
                          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-black/80"
                          title="Remover imagem"
                        >
                          <X size={16} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                    <textarea
                      value={imageDesc}
                      onChange={(e) => { setImageDesc(e.target.value); setError(""); setIsAuthExpired(false); }}
                      placeholder="Informação adicional que não está na imagem (opcional)..."
                      className="min-h-[100px] w-full resize-y rounded-[16px] border px-4 py-4 text-[15px] leading-relaxed outline-none focus:border-[#635BFF]"
                      style={{ borderColor: LINE, background: "#FFFFFF", color: INK }}
                      disabled={isAnalyzing || isProcessingImage}
                    />
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3">
                <p id="onboarding-error" className="text-[13px] font-medium text-[#B34235]" role="alert">
                  {error}
                </p>
                {isAuthExpired && (
                  <Link href="/login?next=/configurar-negocio" className="mt-2 inline-block text-[13px] font-bold text-[#B34235] underline underline-offset-2">
                    Fazer login novamente
                  </Link>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={continueOnboarding}
              disabled={isAnalyzing || isProcessingImage || (mode === "image" && !imageFile)}
              className="auth-primary mt-4 flex min-h-[56px] w-full items-center justify-between rounded-[16px] px-5 text-left font-bold transition-transform hover:-translate-y-0.5 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-75"
              style={{ background: ACCENT, color: "#FFFFFF", boxShadow: "0 8px 20px rgba(99,91,255,0.15)" }}
              data-testid="button-onboarding-continue"
            >
              {isAnalyzing ? (
                <div className="flex w-full items-center justify-center gap-2">
                  <Loader2 size={19} className="animate-spin" />
                  <span role="status">{isSlow ? "Ainda a analisar. Aguarda a resposta…" : "A analisar o teu negócio…"}</span>
                </div>
              ) : (
                <>
                  <span>
                    {mode === "site" ? "Analisar site" : mode === "image" ? "Extrair informação" : "Estruturar com IA"}
                  </span>
                  <ArrowRight size={19} strokeWidth={2.3} />
                </>
              )}
            </button>

            {!isAnalyzing && !isProcessingImage && (
              <div className="mt-6 text-center">
                <Link
                  href="/escolher-handle"
                  onClick={() => clearBusinessOnboarding()}
                  className="text-[14px] font-bold text-center underline underline-offset-4 decoration-[#E6EBF1] transition-colors hover:text-[#0A2540]"
                  style={{ color: FAINT }}
                >
                  Saltar e configurar depois
                </Link>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
