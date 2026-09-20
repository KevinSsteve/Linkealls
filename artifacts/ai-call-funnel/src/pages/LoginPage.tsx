import { useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Delete,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userLogin } from "@/lib/api";
import { AuthBrand } from "@/components/auth/AuthBrand";

type Key = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "0" | "backspace";
const KEYS: Key[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "backspace"];

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--border-soft)] text-[var(--ink)] transition-transform hover:scale-105 active:scale-95"
      aria-label="Voltar"
      data-testid="button-back"
    >
      <ArrowLeft size={20} strokeWidth={2.5} />
    </button>
  );
}

function PhoneField({
  value,
  onChange,
  onEnter,
  errorId,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  errorId?: string;
}) {
  return (
    <div className="flex min-h-[64px] items-center gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--surface)] px-5 transition-colors focus-within:border-[#635bff] focus-within:ring-2 focus-within:ring-[#635bff]/20 shadow-sm">
      <span className="text-[18px] font-bold text-[var(--ink)]" style={{ fontFamily: "var(--font-display)" }}>+244</span>
      <span className="h-7 w-px bg-[var(--border)]" aria-hidden="true" />
      <label className="sr-only" htmlFor="login-phone">Número de telemóvel</label>
      <input
        id="login-phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d\s]/g, ""))}
        onKeyDown={(event) => event.key === "Enter" && onEnter()}
        placeholder="9XX XXX XXX"
        className="min-w-0 flex-1 bg-transparent text-[18px] font-bold text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] placeholder:font-medium"
        autoFocus
        data-testid="input-login-phone"
        aria-invalid={!!errorId}
        aria-describedby={errorId}
      />
    </div>
  );
}

function PinDots({ value }: { value: string }) {
  return (
    <div className="flex items-center justify-center gap-5 py-4" aria-label={`${value.length} de 4 dígitos preenchidos`} aria-live="polite" role="status">
      {[0, 1, 2, 3].map((index) => {
        const filled = index < value.length;
        return (
          <span
            key={index}
            className={`transition-all duration-200 rounded-full ${
              filled ? "w-4 h-4 bg-[#635bff] shadow-[0_0_0_4px_rgba(99,91,255,0.15)] scale-110" : "w-3.5 h-3.5 border-2 border-[var(--ink-faint)]"
            }`}
          />
        );
      })}
    </div>
  );
}

function Keypad({ value, onKey, disabled }: { value: string; onKey: (key: Key) => void; disabled: boolean }) {
  return (
    <div className="grid w-full max-w-[300px] grid-cols-3 gap-2.5 mx-auto" aria-label="Teclado numérico">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            onKey(key);
          }}
          className="flex h-[56px] items-center justify-center rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-[22px] font-bold transition-transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          style={{ fontFamily: "var(--font-display)", color: key === "backspace" ? "var(--ink-soft)" : "var(--ink)", background: key === "backspace" ? "transparent" : "", border: key === "backspace" ? "none" : "", boxShadow: key === "backspace" ? "none" : "" }}
          aria-label={key === "backspace" ? "Apagar" : `Dígito ${key}`}
          data-testid={`button-pin-${key}`}
        >
          {key === "backspace" ? <Delete size={22} strokeWidth={2.5} /> : key}
        </button>
      ))}
    </div>
  );
}

function ErrorNotice({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      id="login-error"
      className="mb-6 flex items-start gap-3 rounded-2xl bg-[#fff0eb] border border-[#f4c6bc] p-4 text-[14px] leading-snug text-[#b34235]"
      role="alert"
      aria-live="polite"
      data-testid="status-login-error"
    >
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#b34235]" aria-hidden="true" />
      <span className="font-semibold">{message}</span>
    </div>
  );
}

function getSafeNext(handle: string | null): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return handle ? `/e/${handle}/dono` : "/escolher-handle";
}

export function LoginPage() {
  const [, nav] = useLocation();
  const { login, isLoading: isAuthLoading, isLoggedIn, user } = useAuth();
  const [step, setStep] = useState<"phone" | "pin">("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handlePhoneNext() {
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Verifica o teu número para continuar.");
      return;
    }
    setError("");
    setStep("pin");
  }

  async function submitPin(nextPin: string) {
    if (loading || nextPin.length !== 4) return;
    setLoading(true);
    setError("");
    try {
      const { user } = await userLogin({ phone, pin: nextPin });
      login(user);
      nav(getSafeNext(user.handle ?? null));
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Número ou PIN incorretos.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  function handlePinKey(key: Key) {
    if (key === "backspace") {
      setPin((current) => current.slice(0, -1));
      return;
    }
    const nextPin = `${pin}${key}`.slice(0, 4);
    setPin(nextPin);
    if (nextPin.length === 4) void submitPin(nextPin);
  }

  if (isAuthLoading) return null;
  if (isLoggedIn) {
    return <Redirect to={user?.handle ? `/e/${user.handle}/dono` : "/configurar-negocio"} />;
  }

  return (
    <main className="page-scroll-container min-h-[100dvh] bg-[var(--bg)] text-[var(--ink)] flex flex-col lg:flex-row font-sans" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="hidden lg:flex flex-col justify-between w-[40%] max-w-[500px] p-12 bg-[#2d176d] text-white">
        <AuthBrand style={{ color: "#fff" }} />
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-[#9b8cff] mb-4">
            O teu negócio num só lugar
          </p>
          <h2 className="text-[44px] font-bold leading-[1.05] tracking-tight mb-5" style={{ fontFamily: "var(--font-display)" }}>
            Conversas que viram negócio.
          </h2>
          <p className="text-white/80 text-[17px] font-medium leading-relaxed max-w-[340px]">
            Fala com clientes, mostra o que vendes e deixa o teu link trabalhar por ti.
          </p>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative w-full">
         <div className="w-full max-w-[420px] flex flex-col" aria-label={`Passo ${step === "phone" ? "1" : "2"} de 2`}>
            <div className="lg:hidden mb-12 flex items-center justify-between">
               <AuthBrand />
               {step === "pin" && <BackButton onClick={() => { setStep("phone"); setPin(""); }} />}
            </div>
            <div className="hidden lg:block absolute top-12 left-12">
               {step === "pin" ? <BackButton onClick={() => { setStep("phone"); setPin(""); }} /> : <BackButton onClick={() => nav("/")} />}
            </div>

            <div className="mb-8">
               <h1 className="text-[clamp(40px,9vw,48px)] font-bold leading-[1.05] tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                 {step === "phone" ? "Entrar." : "O teu PIN."}
               </h1>
               <p className="mt-4 text-[17px] text-[var(--ink-soft)] font-medium">
                 {step === "phone" ? "Coloca o teu número para continuar." : `Código de 4 dígitos para ${phone}.`}
               </p>
            </div>

            <ErrorNotice message={error} />

            {step === "phone" ? (
               <div className="flex flex-col gap-4">
                 <PhoneField value={phone} onChange={setPhone} onEnter={handlePhoneNext} errorId={error ? "login-error" : undefined} />
                 <button
                    type="button"
                    onClick={handlePhoneNext}
                    className="mt-2 flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-[#635bff] text-white text-[17px] font-bold transition-transform hover:-translate-y-0.5 active:scale-95 shadow-[0_8px_20px_rgba(99,91,255,0.18)]"
                    data-testid="button-login-continue"
                 >
                    Continuar <ArrowRight size={20} strokeWidth={2.5} />
                 </button>

                 <Link href="/recuperar-acesso" className="mt-6 text-center text-[15px] font-bold text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]">
                   Esqueci-me do PIN
                 </Link>
               </div>
            ) : (
               <div className="flex flex-col gap-6 items-center">
                  <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[24px] p-6 flex flex-col items-center shadow-sm">
                    <PinDots value={pin} />
                    <p className="mt-2 text-[15px] font-bold text-[var(--ink-soft)]" aria-live="polite" data-testid="status-login-loading">
                      {loading ? "A abrir o teu espaço…" : "Quatro dígitos"}
                    </p>
                  </div>
                  <Keypad value={pin} onKey={handlePinKey} disabled={loading} />
                  <button
                    type="button"
                    disabled={pin.length !== 4 || loading}
                    onClick={() => void submitPin(pin)}
                    className="mt-2 flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-[#635bff] text-white text-[17px] font-bold transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_20px_rgba(99,91,255,0.18)]"
                    data-testid="button-login-submit"
                  >
                    {loading ? <Sparkles size={20} className="animate-pulse" /> : "Entrar"}
                  </button>
               </div>
            )}

            <div className="mt-12 border-t border-[var(--border-soft)] pt-8 text-center flex flex-col items-center gap-5">
              <p className="text-[16px] text-[var(--ink-soft)] font-medium">
                 Ainda não tens conta? <Link href={`/registar${window.location.search}`} className="font-bold text-[#635bff] underline underline-offset-4 hover:text-[#5046e5]" data-testid="link-login-register">Criar conta</Link>
              </p>
              {step === "pin" && (
                <button onClick={() => { setStep("phone"); setPin(""); setError(""); }} className="text-[15px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]" data-testid="button-login-back">
                  Trocar de número
                </button>
              )}
            </div>
         </div>
      </div>
    </main>
  );
}
