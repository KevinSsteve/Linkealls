import { useState, useEffect } from "react";
import { ArrowRight, Globe, Sparkles } from "lucide-react";
import { Link, Redirect, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { saveBusinessOnboarding, readBusinessOnboarding, clearBusinessOnboarding, type BusinessOnboardingDraft } from "@/lib/businessOnboarding";
import { AuthBrand, AuthMark } from "@/components/auth/AuthBrand";

const INK = "#0A2540";
const SOFT = "#344558"; // Darkened
const FAINT = "#5b6e82"; // Darkened
const LINE = "#E6EBF1";
const SUBTLE = "#F1F5F9";
const ACCENT = "#635BFF";
const ACCENT_SOFT = "#EEECFF";

export function BusinessOnboardingPage() {
  const [, nav] = useLocation();
  const { isLoading, isLoggedIn } = useAuth();
  const [mode, setMode] = useState<BusinessOnboardingDraft["mode"]>("site");
  const [siteValue, setSiteValue] = useState("");
  const [descValue, setDescValue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const draft = readBusinessOnboarding();
    if (draft) {
      setMode(draft.mode);
      if (draft.mode === "site") {
        setSiteValue(draft.value);
      } else {
        setDescValue(draft.value);
      }
    }
  }, []);

  if (isLoading) {
    return (
      <main className="auth-clean-page min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-[#FBFAFF]">
        <AuthMark size={64} className="animate-pulse" />
        <p role="status" className="text-sm text-[#344558]">A abrir a configuração…</p>
      </main>
    );
  }

  if (!isLoggedIn) return <Redirect to="/login?next=/configurar-negocio" />;

  function validateUrl(url: string): string | null {
    if (!url || /\s/.test(url)) return null;
    if (/^[a-z][a-z\d+.-]*:/i.test(url) && !/^https?:\/\//i.test(url)) return null;
    let urlToTest = url;
    if (!/^https?:\/\//i.test(urlToTest)) {
      urlToTest = `https://${urlToTest}`;
    }
    try {
      const parsed = new URL(urlToTest);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      if (!parsed.hostname.includes(".")) return null;
      if (parsed.username || parsed.password) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  function continueOnboarding() {
    const isSite = mode === "site";
    const value = isSite ? siteValue : descValue;
    const trimmed = value.trim();

    if (isSite) {
      if (trimmed.length < 4) {
        setError("Coloca o link do site da tua empresa.");
        return;
      }
      const validUrl = validateUrl(trimmed);
      if (!validUrl) {
        setError("O endereço do site não parece ser válido.");
        return;
      }
      try {
        saveBusinessOnboarding({ mode, value: validUrl });
        nav("/escolher-handle");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao guardar.");
      }
      return;
    }

    if (trimmed.length < 20) {
      setError("Descreve o teu negócio com pelo menos 20 caracteres.");
      return;
    }

    try {
      saveBusinessOnboarding({ mode, value: trimmed });
      nav("/escolher-handle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao guardar.");
    }
  }

  return (
    <main
      className="auth-clean-page flex min-h-[100dvh] justify-center"
      style={{
        background: "#FBFAFF",
        color: INK,
        fontFamily: "'Avenir Next', 'Trebuchet MS', system-ui, sans-serif",
      }}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[560px] flex-col px-5 py-6 sm:px-10 sm:py-10">
        <div className="flex items-center justify-between mb-12">
          <AuthBrand />
          <span className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: FAINT }}>
            1 de 2
          </span>
        </div>

        <section className="auth-content my-auto pb-12">
          <p className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.12em]" style={{ color: ACCENT }}>
            Configurar negócio
          </p>
          <h1 className="max-w-[520px] text-[clamp(32px,8vw,48px)] font-extrabold leading-[1.05] tracking-[-0.04em]">
            Vamos preparar o teu negócio.
          </h1>
          <p className="mt-4 max-w-[490px] text-[16px] leading-relaxed" style={{ color: SOFT }}>
            Usa o teu site ou descreve o que fazes. A IA ajuda a preparar o perfil; tu revês os detalhes antes de guardar.
          </p>

          <div className="mt-8 flex rounded-[16px] border p-1" style={{ borderColor: LINE, background: SUBTLE }}>
            {(["site", "description"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => { setMode(option); setError(""); }}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[12px] text-[14px] font-bold transition-colors"
                style={{
                  background: mode === option ? "#FFFFFF" : "transparent",
                  color: mode === option ? INK : FAINT,
                  boxShadow: mode === option ? "0 2px 8px rgba(10,37,64,0.07)" : "none",
                }}
              >
                {option === "site" ? <><Globe size={18} /> Tenho site</> : <><Sparkles size={18} /> Sem site</>}
              </button>
            ))}
          </div>

          {mode === "site" ? (
            <input
              value={siteValue}
              onChange={(event) => { setSiteValue(event.target.value); setError(""); }}
              onKeyDown={(event) => { if (event.key === "Enter") continueOnboarding(); }}
              placeholder="https://oteusite.co.ao"
              inputMode="url"
              autoCapitalize="none"
              className="mt-4 min-h-[56px] w-full rounded-[16px] border px-4 text-[16px] outline-none focus:border-[#635BFF]"
              style={{ borderColor: LINE, background: "#FFFFFF", color: INK }}
              data-testid="input-onboarding-website"
              aria-invalid={!!error}
              aria-describedby={error ? "onboarding-error" : undefined}
            />
          ) : (
            <textarea
              value={descValue}
              onChange={(event) => { setDescValue(event.target.value); setError(""); }}
              placeholder="Ex.: Tenho uma pastelaria em Luanda. Vendemos bolos, salgados e fazemos entregas..."
              autoFocus
              className="mt-4 min-h-[150px] w-full resize-y rounded-[16px] border px-4 py-4 text-[16px] leading-relaxed outline-none focus:border-[#635BFF]"
              style={{ borderColor: LINE, background: "#FFFFFF", color: INK }}
              data-testid="input-onboarding-description"
              aria-invalid={!!error}
              aria-describedby={error ? "onboarding-error" : undefined}
            />
          )}

          {error && <p id="onboarding-error" className="mt-3 text-[13px] font-medium" style={{ color: "#B34235" }} role="alert">{error}</p>}

          <button
            type="button"
            onClick={continueOnboarding}
             className="auth-primary mt-4 flex min-h-[56px] w-full items-center justify-between rounded-[16px] px-5 text-left font-bold transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
            style={{ background: ACCENT, color: "#FFFFFF", boxShadow: "0 8px 20px rgba(99,91,255,0.15)" }}
            data-testid="button-onboarding-continue"
          >
            <span>{mode === "site" ? "Analisar o meu site" : "Estruturar com IA"}</span>
            <ArrowRight size={19} strokeWidth={2.3} />
          </button>

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
        </section>
      </div>
    </main>
  );
}