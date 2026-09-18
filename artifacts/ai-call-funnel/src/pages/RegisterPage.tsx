import { useEffect, useRef, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Delete,
  Loader2,
  Copy
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userRegister } from "@/lib/api";
import { AuthBrand } from "@/components/auth/AuthBrand";

type Key = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "0" | "backspace";
const KEYS: Key[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "backspace"];
type Step = "name" | "phone" | "pin" | "confirm";

function BackButton({ onClick, testId = "button-back" }: { onClick: () => void, testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--border-soft)] text-[var(--ink)] transition-transform hover:scale-105 active:scale-95"
      aria-label="Voltar"
      data-testid={testId}
    >
      <ArrowLeft size={20} strokeWidth={2.5} />
    </button>
  );
}

function StepRail({ current }: { current: Step }) {
  const index = current === "name" ? 0 : current === "phone" ? 1 : 2;
  return (
    <div className="flex items-center gap-2 mb-2" aria-label={`Passo ${index + 1} de 3`}>
      {[0, 1, 2].map((stepIndex) => (
        <span
          key={stepIndex}
          className="h-2 rounded-full transition-all duration-300"
          style={{
            width: stepIndex === index ? 36 : 12,
            background: stepIndex <= index ? "#635bff" : "var(--border)",
          }}
        />
      ))}
    </div>
  );
}

function TextField({
  id,
  placeholder,
  value,
  onChange,
  onEnter,
  type = "text",
  autoComplete,
  errorId,
}: {
  id: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  type?: string;
  autoComplete?: string;
  errorId?: string;
}) {
  return (
    <div className="flex min-h-[64px] items-center rounded-[20px] border border-[var(--border)] bg-[var(--surface)] px-5 transition-colors focus-within:border-[#635bff] focus-within:ring-2 focus-within:ring-[#635bff]/20 shadow-sm">
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && onEnter()}
        className="w-full bg-transparent text-[18px] font-bold text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] placeholder:font-medium"
        data-testid={`input-${id}`}
        aria-invalid={!!errorId}
        aria-describedby={errorId}
      />
    </div>
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
      <label className="sr-only" htmlFor="register-phone">Número de telemóvel</label>
      <input
        id="register-phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d\s]/g, ""))}
        onKeyDown={(event) => event.key === "Enter" && onEnter()}
        placeholder="9XX XXX XXX"
        className="min-w-0 flex-1 bg-transparent text-[18px] font-bold text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] placeholder:font-medium"
        autoFocus
        data-testid="input-register-phone"
        aria-invalid={!!errorId}
        aria-describedby={errorId}
      />
    </div>
  );
}

function PinDots({ value, confirmed }: { value: string; confirmed?: boolean }) {
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

function Keypad({ onKey, disabled }: { onKey: (key: Key) => void; disabled: boolean }) {
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
          data-testid={`button-register-pin-${key}`}
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
      id="register-error"
      className="mb-6 flex items-start gap-3 rounded-2xl bg-[#fff0eb] border border-[#f4c6bc] p-4 text-[14px] leading-snug text-[#b34235]"
      role="alert"
      aria-live="polite"
      data-testid="status-register-error"
    >
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#b34235]" aria-hidden="true" />
      <span className="font-semibold">{message}</span>
    </div>
  );
}

function RecoveryCodeNotice({ code, onContinue }: { code: string; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  async function copyCode() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyError("Não foi possível copiar. Seleciona o código acima e copia manualmente.");
    }
  }

  return (
    <main className="min-h-[100dvh] flex flex-col bg-[var(--bg)] text-[var(--ink)] font-sans">
      <div className="flex-1 w-full max-w-[500px] mx-auto flex flex-col p-6 sm:p-12">
         <AuthBrand className="mb-12" />
         <div className="flex-1 flex flex-col justify-center pb-12">
            <div className="mb-6 h-16 w-16 rounded-2xl bg-[#dff1e9] text-[#246a59] flex items-center justify-center">
               <Check size={32} strokeWidth={2.5} />
            </div>
            <h1 className="text-[clamp(40px,9vw,48px)] font-bold leading-[1.05] tracking-tight mb-4" style={{ fontFamily: "var(--font-display)" }}>
              Guarda este código.
            </h1>
            <p className="text-[17px] text-[var(--ink-soft)] font-medium leading-relaxed mb-10">
              É a única forma de recuperar a conta se te esqueceres do PIN. Não o partilhes.
            </p>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-8 text-center mb-6 shadow-sm">
               <p className="text-[13px] font-bold uppercase tracking-widest text-[var(--ink-faint)] mb-4">Código de Recuperação</p>
               <p className="font-mono text-[28px] font-bold tracking-[0.1em] text-[#635BFF] select-all break-words" data-sentry-mask="true" data-private="true">
                 {code}
               </p>
            </div>
            <button
               onClick={() => void copyCode()}
               className={`flex h-[60px] items-center justify-center gap-2 rounded-2xl border-2 font-bold transition-all hover:-translate-y-0.5 active:scale-95 mb-3 ${copied ? "bg-[#dff1e9] border-[#246a59] text-[#246a59]" : "bg-[var(--surface)] border-[var(--border)] text-[var(--ink)]"}`}
            >
               {copied ? <Check size={20} /> : <Copy size={20} />}
               {copied ? "Copiado com sucesso!" : "Copiar código"}
            </button>
            <p role="status" className="min-h-6 text-[14px] font-semibold text-[#b34235] text-center mb-8">{copyError}</p>
            <button
               onClick={onContinue}
               className="flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-[#635bff] text-white text-[17px] font-bold transition-transform hover:-translate-y-0.5 active:scale-95 shadow-[0_8px_20px_rgba(99,91,255,0.18)]"
            >
               Continuar para o espaço <ArrowRight size={20} strokeWidth={2.5} />
            </button>
         </div>
      </div>
    </main>
  );
}

function getSafeNext(handle: string | null): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return handle ? `/e/${handle}/dono` : "/configurar-negocio";
}

export function RegisterPage() {
  const [, nav] = useLocation();
  const { login, isLoading: isAuthLoading, isLoggedIn, user } = useAuth();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [slowLoading, setSlowLoading] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (step !== "pin" || pin.length !== 4) return;
    const timer = window.setTimeout(() => setStep("confirm"), 220);
    return () => window.clearTimeout(timer);
  }, [pin, step]);

  useEffect(() => {
    if (!loading) {
      setSlowLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      setSlowLoading(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  function back() {
    if (submitting.current) return;
    setError("");
    if (step === "phone") setStep("name");
    else if (step === "pin") {
      setStep("phone");
      setPin("");
    } else if (step === "confirm") {
      setStep("pin");
      setPin("");
      setConfirmPin("");
    } else nav("/login");
  }

  function handleNameNext() {
    if (name.trim().length < 2) {
      setError("Escreve o teu nome para continuarmos.");
      return;
    }
    setError("");
    setStep("phone");
  }

  function handlePhoneNext() {
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Verifica o teu número para continuar.");
      return;
    }
    setError("");
    setStep("pin");
  }

  async function submitRegistration() {
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await userRegister({ phone, name: name.trim(), pin });
      login(response.user);
      if (response.recoveryCode) {
        setRecoveryCode(response.recoveryCode);
      } else {
        nav(getSafeNext(response.user.handle ?? null));
      }
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível criar a conta.");
      setPin("");
      setConfirmPin("");
      setStep("pin");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  function handlePinKey(key: Key) {
    if (submitting.current) return;
    if (step === "pin") {
      if (key === "backspace") {
        setPin((current) => current.slice(0, -1));
        return;
      }
      if (pin.length === 4) return;
      const nextPin = `${pin}${key}`.slice(0, 4);
      setPin(nextPin);
      return;
    }
    if (key === "backspace") {
      setConfirmPin((current) => current.slice(0, -1));
      return;
    }
    if (confirmPin.length === 4) return;
    const nextConfirm = `${confirmPin}${key}`.slice(0, 4);
    setConfirmPin(nextConfirm);
    if (nextConfirm.length === 4) {
      if (nextConfirm !== pin) {
        setError("Os PINs não coincidem. Vamos tentar de novo.");
        setPin("");
        setConfirmPin("");
        setStep("pin");
      } else {
        void submitRegistration();
      }
    }
  }

  const pinStep = step === "pin" || step === "confirm";
  const title =
    step === "name" ? "Criar conta." : step === "phone" ? "O teu número." : step === "pin" ? "Cria um PIN." : "Confirma o PIN.";
  const description =
    step === "name" ? "Como te chamas?" : step === "phone" ? "Onde vais gerir o negócio?" : step === "pin" ? "Quatro dígitos fáceis de lembrar." : "Só para termos a certeza.";

  if (recoveryCode) {
    return (
      <RecoveryCodeNotice
        code={recoveryCode}
        onContinue={() => nav("/configurar-negocio")}
      />
    );
  }

  if (isAuthLoading) return null;
  if (isLoggedIn) {
    return <Redirect to={user?.handle ? `/e/${user.handle}/dono` : "/configurar-negocio"} />;
  }

  return (
    <main className="min-h-[100dvh] bg-[var(--bg)] text-[var(--ink)] flex flex-col lg:flex-row overflow-x-hidden font-sans" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="hidden lg:flex flex-col justify-between w-[40%] max-w-[500px] p-12 bg-[#2d176d] text-white">
        <AuthBrand style={{ color: "#fff" }} />
        <div>
          <h2 className="text-[44px] font-bold leading-[1.05] tracking-tight mb-10" style={{ fontFamily: "var(--font-display)" }}>
            O teu espaço.<br />À tua maneira.
          </h2>
          <ul className="space-y-6 text-white/90 font-medium text-[17px]">
            <li className="flex items-center gap-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#635bff]"><Check size={18} strokeWidth={3} /></span> Catálogo num único link</li>
            <li className="flex items-center gap-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#635bff]"><Check size={18} strokeWidth={3} /></span> Atendimento com IA 24/7</li>
            <li className="flex items-center gap-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#635bff]"><Check size={18} strokeWidth={3} /></span> Pedidos e pagamentos rápidos</li>
          </ul>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative w-full">
         <div className="w-full max-w-[420px] flex flex-col">
            <div className="lg:hidden mb-12 flex items-center justify-between">
               <AuthBrand />
               {!loading && <BackButton onClick={back} testId="button-register-back" />}
            </div>
            <div className="hidden lg:block absolute top-12 left-12">
               {!loading && <BackButton onClick={back} testId="button-register-back" />}
            </div>

            <div className="mb-10">
               <StepRail current={step} />
               <h1 className="text-[clamp(40px,9vw,48px)] font-bold leading-[1.05] tracking-tight mt-5" style={{ fontFamily: "var(--font-display)" }}>
                 {loading ? "A preparar..." : title}
               </h1>
               <p className="mt-4 text-[17px] text-[var(--ink-soft)] font-medium">
                 {loading ? "Aguarda um momento." : description}
               </p>
            </div>

            <ErrorNotice message={error} />

            {step === "name" && !loading && (
               <div className="flex flex-col gap-4">
                 <TextField id="register-name" placeholder="O teu nome (ex: Ana)" value={name} onChange={setName} onEnter={handleNameNext} autoComplete="name" errorId={error ? "register-error" : undefined} />
                 <button
                    type="button"
                    onClick={handleNameNext}
                    className="mt-2 flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-[#635bff] text-white text-[17px] font-bold transition-transform hover:-translate-y-0.5 active:scale-95 shadow-[0_8px_20px_rgba(99,91,255,0.18)]"
                    data-testid="button-register-name-continue"
                 >
                    Continuar <ArrowRight size={20} strokeWidth={2.5} />
                 </button>
               </div>
            )}

            {step === "phone" && !loading && (
               <div className="flex flex-col gap-4">
                 <PhoneField value={phone} onChange={setPhone} onEnter={handlePhoneNext} errorId={error ? "register-error" : undefined} />
                 <button
                    type="button"
                    onClick={handlePhoneNext}
                    className="mt-2 flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-[#635bff] text-white text-[17px] font-bold transition-transform hover:-translate-y-0.5 active:scale-95 shadow-[0_8px_20px_rgba(99,91,255,0.18)]"
                    data-testid="button-register-phone-continue"
                 >
                    Continuar <ArrowRight size={20} strokeWidth={2.5} />
                 </button>
               </div>
            )}

            {pinStep && (
               <div className="flex flex-col gap-6 items-center">
                  {loading ? (
                    <div role="status" aria-live="polite" aria-busy="true" data-testid="status-register-loading" className="w-full flex flex-col items-center justify-center rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-12 text-center shadow-sm">
                      <Loader2 size={48} className="mb-6 animate-spin text-[#635bff]" />
                      <p className="text-[20px] font-bold text-[var(--ink)]" style={{ fontFamily: "var(--font-display)" }}>A criar a tua conta</p>
                      <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)] font-medium">
                        {slowLoading ? "Quase pronto. Estamos à espera da confirmação." : "A preparar o teu espaço. Aguarda."}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[24px] p-6 flex flex-col items-center shadow-sm">
                        <PinDots value={step === "pin" ? pin : confirmPin} confirmed={step === "confirm"} />
                        <p className="mt-2 text-[15px] font-bold text-[var(--ink-soft)]" aria-live="polite">
                          Quatro dígitos
                        </p>
                      </div>
                      <Keypad onKey={handlePinKey} disabled={false} />
                    </>
                  )}
               </div>
            )}

            <div className="mt-12 border-t border-[var(--border-soft)] pt-8 text-center flex flex-col items-center gap-5" style={{ opacity: loading ? 0.5 : 1, pointerEvents: loading ? "none" : "auto" }}>
              <p className="text-[14px] text-[var(--ink-faint)] leading-relaxed max-w-[340px]">
                Ao continuar, aceitas os nossos <Link href="/termos" target="_blank" rel="noopener noreferrer" className="font-bold underline hover:text-[var(--ink)]">termos</Link> e a <Link href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-bold underline hover:text-[var(--ink)]">política de privacidade</Link>.
              </p>
              <p className="text-[16px] text-[var(--ink-soft)] font-medium mt-2">
                 Já tens conta? <Link href={`/login${window.location.search}`} className="font-bold text-[#635bff] underline underline-offset-4 hover:text-[#5046e5]" data-testid="link-register-login">Entrar</Link>
              </p>
            </div>
         </div>
      </div>
    </main>
  );
}
