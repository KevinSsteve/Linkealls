import { useState, useEffect, useRef } from "react";
import { ArrowRight, Globe, Camera, AlignLeft, X, Loader2, Check } from "lucide-react";
import { Link, Redirect, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { saveBusinessOnboarding, readBusinessOnboarding, clearBusinessOnboarding } from "@/lib/businessOnboarding";
import { AuthBrand, AuthMark } from "@/components/auth/AuthBrand";
import { analyzeBusinessOnboarding, AuthApiError, type BusinessAnalysisResult, type BusinessAnalysisInput } from "@/lib/api";
import { processAnalysisImage } from "@/lib/imageProcessor";

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
      <main className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-[var(--bg)] text-[var(--ink)]">
        <AuthMark size={64} className="animate-pulse" />
      </main>
    );
  }

  if (!isLoggedIn) return <Redirect to="/login?next=/configurar-negocio" />;
  if (user?.handle) return <Redirect to={`/e/${user.handle}/dono`} />;

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
        setError("Para o Instagram, usa 'Imagem' e carrega um screenshot.");
        submitGuardRef.current = false;
        return;
      }
      if (!valid) {
        setError("Link inválido.");
        submitGuardRef.current = false;
        return;
      }
      input = { mode: "site", url: valid };
    } else if (mode === "description") {
      if (trimmedDesc.length < 20) {
        setError("Descreve o negócio com mais detalhe (mín 20 letras).");
        submitGuardRef.current = false;
        return;
      }
      if (trimmedDesc.length > 6000) {
        setError("Texto muito longo.");
        submitGuardRef.current = false;
        return;
      }
      input = { mode: "description", description: trimmedDesc };
    } else {
      if (!imageFile) {
        setError("Carrega uma imagem primeiro.");
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
        setError(saveErr instanceof Error ? saveErr.message : "Erro ao guardar.");
      }
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 401) {
        setIsAuthExpired(true);
      }
      const msg = err instanceof Error ? err.message : "Erro a analisar. Confere os teus dados.";
      setError(msg);

      try {
        if (input.mode === "site") saveBusinessOnboarding({ mode, value: input.url, userId: user?.id });
        if (input.mode === "description" && input.description) {
          saveBusinessOnboarding({ mode, value: input.description, userId: user?.id });
        }
        if (input.mode === "image") {
          saveBusinessOnboarding({ mode, value: imageDesc.trim() || imageFile?.name || "Imagem carregada", userId: user?.id });
        }
      } catch {
        setError(`${msg} O navegador também não conseguiu guardar o rascunho. Mantém a página aberta.`);
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
      setError(err instanceof Error ? err.message : "Erro a guardar. Tenta de novo.");
    }
  }

  function resetAnalysis() {
    setAnalysisResult(null);
    clearBusinessOnboarding();
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--bg)] text-[var(--ink)] flex flex-col items-center p-6 sm:p-12 font-sans" style={{ paddingTop: "max(32px, env(safe-area-inset-top, 32px))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="w-full max-w-[500px] flex flex-col">
        <div className="mb-12 flex items-center justify-between">
          <AuthBrand />
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#635BFF]">
            1 de 2
          </span>
        </div>

        {analysisResult ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col pb-12">
            <h1 className="text-[clamp(36px,9vw,48px)] font-bold leading-[1.05] tracking-tight mb-4" style={{ fontFamily: "var(--font-display)" }}>
              Análise concluída.
            </h1>
            <p className="text-[17px] text-[var(--ink-soft)] font-medium leading-relaxed">
              Vê o resumo gerado pela IA e avança. Podes ajustar tudo depois.
            </p>

            <div className="mt-8 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
              <div className="mb-5 inline-flex items-center gap-2 rounded-xl bg-[#dff1e9] px-3.5 py-1.5 text-[14px] font-bold text-[#246a59]">
                <Check size={18} strokeWidth={3} /> Preparado com sucesso
              </div>
              <h2 className="text-[28px] font-bold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
                {analysisResult.draft.name || "Negócio sem nome"}
              </h2>
              {analysisResult.draft.sector && (
                <p className="mt-2 text-[14px] font-bold uppercase tracking-wider text-[#635BFF]">
                  {analysisResult.draft.sector}
                </p>
              )}
              <p className="mt-5 text-[16px] font-medium leading-relaxed text-[var(--ink-soft)]">
                {analysisResult.draft.description || "Sem descrição disponível."}
              </p>

              {analysisResult.draft.offerings && analysisResult.draft.offerings.length > 0 && (
                <div className="mt-8 border-t border-[var(--border-soft)] pt-6">
                  <h3 className="text-[13px] font-bold uppercase tracking-widest text-[var(--ink-faint)] mb-5">
                    Serviços extraídos ({analysisResult.draft.offerings.length})
                  </h3>
                  <ul className="flex flex-col gap-5">
                    {analysisResult.draft.offerings.slice(0, 3).map((offering, i) => (
                      <li key={i} className="flex flex-col gap-1.5">
                        <span className="text-[16px] font-bold text-[var(--ink)]">{offering.name}</span>
                        {offering.description && (
                          <span className="text-[15px] font-medium text-[var(--ink-soft)] leading-relaxed">
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
              <div className="mt-6 rounded-2xl bg-[#fff0eb] border border-[#f4c6bc] p-5 text-[15px] font-medium text-[#b34235]" role="alert">
                <p id="onboarding-error">{error}</p>
              </div>
            )}

            <div className="mt-8 flex flex-col gap-4">
              <button
                onClick={saveAndContinue}
                className="flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-[#635bff] text-white text-[17px] font-bold transition-transform hover:-translate-y-0.5 active:scale-95 shadow-[0_8px_20px_rgba(99,91,255,0.18)]"
              >
                Rever e Continuar <ArrowRight size={20} strokeWidth={2.5} />
              </button>
              <button
                onClick={resetAnalysis}
                className="flex h-[60px] w-full items-center justify-center rounded-2xl font-bold text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)] text-[16px]"
              >
                Voltar e alterar a fonte
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col pb-12">
            <h1 className="text-[clamp(40px,9vw,48px)] font-bold leading-[1.05] tracking-tight mb-4" style={{ fontFamily: "var(--font-display)" }}>
              O teu perfil.
            </h1>
            <p className="text-[17px] text-[var(--ink-soft)] font-medium leading-relaxed mb-8">
              Diz-nos o que já tens. A IA lê e cria o teu catálogo.
            </p>

            <div className="flex p-1.5 rounded-[20px] bg-[var(--surface)] border border-[var(--border)] shadow-sm overflow-x-auto mb-8">
              {(["site", "image", "description"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleModeChange(opt)}
                  disabled={isProcessingImage}
                  className={`flex h-[52px] min-w-[110px] flex-1 items-center justify-center gap-2 rounded-[16px] text-[15px] font-bold transition-all disabled:opacity-50 ${
                    mode === opt ? "bg-white text-[var(--ink)] shadow-[0_2px_12px_rgba(0,0,0,0.06)]" : "text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
                  }`}
                >
                  {opt === "site" && <><Globe size={18} /> Site</>}
                  {opt === "image" && <><Camera size={18} /> Imagem</>}
                  {opt === "description" && <><AlignLeft size={18} /> Texto</>}
                </button>
              ))}
            </div>

            {mode === "site" && (
              <div>
                <input
                  value={siteValue}
                  onChange={(e) => { setSiteValue(e.target.value); setError(""); setIsAuthExpired(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") continueOnboarding(); }}
                  placeholder="https://oteusite.com"
                  inputMode="url"
                  autoCapitalize="none"
                  className="h-[64px] w-full rounded-[20px] border border-[var(--border)] bg-[var(--surface)] px-5 text-[18px] font-bold text-[var(--ink)] outline-none focus:border-[#635bff] focus:ring-2 focus:ring-[#635bff]/20 placeholder:text-[var(--ink-faint)] placeholder:font-medium shadow-sm"
                  data-testid="input-onboarding-website"
                  aria-invalid={!!error}
                  disabled={isAnalyzing || isProcessingImage}
                />
              </div>
            )}

            {mode === "description" && (
              <div>
                <textarea
                  value={descValue}
                  onChange={(e) => { setDescValue(e.target.value); setError(""); setIsAuthExpired(false); }}
                  placeholder="Ex: Tenho uma loja de roupa e acessórios para senhora. Fazemos entregas ao domicílio..."
                  autoFocus
                  className="min-h-[160px] w-full resize-y rounded-[20px] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 text-[17px] font-medium leading-relaxed text-[var(--ink)] outline-none focus:border-[#635bff] focus:ring-2 focus:ring-[#635bff]/20 placeholder:text-[var(--ink-faint)] shadow-sm"
                  data-testid="input-onboarding-description"
                  aria-invalid={!!error}
                  disabled={isAnalyzing || isProcessingImage}
                />
              </div>
            )}

            {mode === "image" && (
              <div>
                {isProcessingImage ? (
                  <div className="flex flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center">
                    <Loader2 size={32} className="animate-spin mb-5 text-[#635bff]" />
                    <p className="text-[16px] font-medium text-[var(--ink-soft)]">A preparar imagem...</p>
                  </div>
                ) : !imageFile ? (
                  <div className="flex flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center transition-colors hover:bg-[var(--subtle)]">
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#f4efe8] text-[var(--ink-faint)]">
                      <Camera size={30} strokeWidth={1.5} />
                    </div>
                    <p className="mb-8 text-[16px] leading-relaxed text-[var(--ink-soft)] font-medium">
                      Carrega um screenshot do teu Instagram ou um folheto digital com os teus serviços.
                    </p>
                    <label className="cursor-pointer rounded-[20px] bg-white px-8 py-4 text-[16px] font-bold text-[var(--ink)] shadow-sm border border-[var(--border)] transition-transform hover:bg-[#fafafa] active:scale-95">
                      Escolher Imagem
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={isAnalyzing || isProcessingImage}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    <div className="relative overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-2">
                      <img src={imageFile.objectUrl} alt="Preview" className="w-full max-h-[300px] object-cover rounded-[14px]" />
                      {!isAnalyzing && (
                        <button
                          onClick={() => setImageFile(null)}
                          className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-transform hover:scale-105"
                          title="Remover imagem"
                        >
                          <X size={20} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                    <textarea
                      value={imageDesc}
                      onChange={(e) => { setImageDesc(e.target.value); setError(""); setIsAuthExpired(false); }}
                      placeholder="Mais alguma coisa a acrescentar? (Opcional)"
                      className="min-h-[120px] w-full resize-y rounded-[20px] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 text-[17px] font-medium leading-relaxed text-[var(--ink)] outline-none focus:border-[#635bff] focus:ring-2 focus:ring-[#635bff]/20 placeholder:text-[var(--ink-faint)] shadow-sm"
                      disabled={isAnalyzing || isProcessingImage}
                    />
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="mt-8 rounded-2xl bg-[#fff0eb] border border-[#f4c6bc] p-5 text-[15px] font-semibold leading-relaxed text-[#b34235]" role="alert">
                <p id="onboarding-error">{error}</p>
                {isAuthExpired && (
                  <Link href="/login?next=/configurar-negocio" className="mt-3 inline-block text-[15px] font-bold underline underline-offset-4 hover:text-[#8a2f24]">
                    Fazer login novamente
                  </Link>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={continueOnboarding}
              disabled={isAnalyzing || isProcessingImage || (mode === "image" && !imageFile)}
              className="mt-8 flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-[#635bff] text-white text-[17px] font-bold transition-transform hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-50 shadow-[0_8px_20px_rgba(99,91,255,0.18)]"
              data-testid="button-onboarding-continue"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={22} className="animate-spin" />
                  <span role="status">{isSlow ? "Quase pronto..." : "A analisar..."}</span>
                </>
              ) : (
                <>
                  <span>
                    {mode === "site" ? "Analisar site" : mode === "image" ? "Extrair" : "Estruturar com IA"}
                  </span>
                  <ArrowRight size={20} strokeWidth={2.5} />
                </>
              )}
            </button>

            {!isAnalyzing && !isProcessingImage && (
              <div className="mt-10 text-center">
                <Link
                  href="/escolher-handle"
                  onClick={() => clearBusinessOnboarding()}
                  className="text-[15px] font-bold text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]"
                >
                  Saltar por agora
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
