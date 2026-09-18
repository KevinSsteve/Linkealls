import { useState } from "react";
import { ArrowLeft, ArrowRight, Globe, Sparkles } from "lucide-react";
import { Link, Redirect, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { saveBusinessOnboarding, type BusinessOnboardingDraft } from "@/lib/businessOnboarding";
import { AuthBrand } from "@/components/auth/AuthBrand";

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
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  if (isLoading) return null;
  if (!isLoggedIn) return <Redirect to="/login?next=/configurar-negocio" />;

  function continueOnboarding() {
    const trimmed = value.trim();
    if (mode === "site" && trimmed.length < 4) {
      setError("Coloca o link do site da tua empresa.");
      return;
    }
    if (mode === "description" && trimmed.length < 20) {
      setError("Descreve o teu negócio com pelo menos 20 caracteres.");
      return;
    }
    const draft: BusinessOnboardingDraft = { mode, value: trimmed };
    saveBusinessOnboarding(draft);
    nav("/escolher-handle");
  }

  return (
    <main
      className="auth-clean-page min-h-[100dvh]"
      style={{
        background: "#FFFFFF",
        color: INK,
        fontFamily: "'Avenir Next', 'Trebuchet MS', system-ui, sans-serif",
      }}
    >
      <div className="auth-onboarding-shell mx-auto flex min-h-[100dvh] w-full max-w-[620px] flex-col px-5 py-6 sm:px-10 sm:py-10">
        <AuthBrand />
        <div className="flex items-center justify-between">
          <Link href="/login" className="inline-flex h-11 w-11 items-center justify-center rounded-full" style={{ background: ACCENT_SOFT, color: INK }} aria-label="Voltar">
            <ArrowLeft size={18} />
          </Link>
          <span className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: FAINT }}>
            1 de 2
          </span>
        </div>

        <section className="auth-content my-auto py-12">
          <p className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.12em]" style={{ color: ACCENT }}>
            Configurar negócio
          </p>
          <h1 className="max-w-[520px] text-[clamp(32px,8vw,48px)] font-extrabold leading-[1.05] tracking-[-0.04em]">
            Vamos preparar o teu negócio.
          </h1>
          <p className="mt-4 max-w-[490px] text-[16px] leading-relaxed" style={{ color: SOFT }}>
            A IA ajuda a organizar o teu perfil, catálogo e respostas para atender clientes por voz e chat. Podes começar pelo site ou explicar brevemente o teu negócio.
          </p>

          <div className="mt-8 flex rounded-[16px] border p-1" style={{ borderColor: LINE, background: SUBTLE }}>
            {(["site", "description"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => { setMode(option); setValue(""); setError(""); }}
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
              value={value}
              onChange={(event) => { setValue(event.target.value); setError(""); }}
              onKeyDown={(event) => { if (event.key === "Enter") continueOnboarding(); }}
              placeholder="https://oteusite.co.ao"
              inputMode="url"
              autoCapitalize="none"
              autoFocus
              className="mt-4 min-h-[56px] w-full rounded-[16px] border px-4 text-[16px] outline-none focus:border-[#635BFF]"
              style={{ borderColor: LINE, background: "#FFFFFF", color: INK }}
              data-testid="input-onboarding-website"
              aria-invalid={!!error}
              aria-describedby={error ? "onboarding-error" : undefined}
            />
          ) : (
            <textarea
              value={value}
              onChange={(event) => { setValue(event.target.value); setError(""); }}
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

          <p className="mt-5 text-center text-[13px] leading-relaxed" style={{ color: FAINT }}>
            No passo seguinte escolhes o endereço público do teu negócio.
          </p>
        </section>
      </div>
    </main>
  );
}