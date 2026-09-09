import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Delete,
  LockKeyhole,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userRegister } from "@/lib/api";
import brandLogo from "@assets/1000379740_1788938201385.png";

const COLORS = {
  page: "#fbfaff",
  panel: "#f1edff",
  panelDeep: "#2d176d",
  ink: "#0a2540",
  soft: "#425466",
  muted: "#8898aa",
  line: "#e6ebf1",
  field: "#ffffff",
  accent: "#635bff",
  accentSoft: "#eeecff",
  error: "#b34235",
  errorBg: "#fff0eb",
};

type Key = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "0" | "backspace";
const KEYS: Key[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "backspace"];
type Step = "name" | "phone" | "pin" | "confirm";

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" style={{ color: COLORS.ink }} data-testid="brand-linkealls">
      <img
        src={brandLogo}
        alt="Linkealls"
        className="shrink-0 object-cover"
        style={{
          width: compact ? 40 : 48,
          height: compact ? 40 : 48,
          borderRadius: compact ? 14 : 16,
          background: "#ffffff",
          boxShadow: "0 10px 24px rgba(99, 91, 255, 0.2)",
        }}
      />
      <span style={{ fontFamily: "'Avenir Next', 'Trebuchet MS', sans-serif", fontSize: compact ? 18 : 20, fontWeight: 800, letterSpacing: "-0.04em" }}>
        linkealls
      </span>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-200 hover:-translate-x-0.5 active:scale-95"
      style={{ color: COLORS.ink, background: COLORS.accentSoft }}
      aria-label="Voltar"
      data-testid="button-back"
    >
      <ArrowLeft size={18} strokeWidth={2} />
    </button>
  );
}

function StepRail({ current }: { current: Step }) {
  const index = current === "name" ? 0 : current === "phone" ? 1 : 2;
  return (
    <div className="flex items-center gap-1.5" aria-label={`Passo ${index + 1} de 3`}>
      {[0, 1, 2].map((stepIndex) => (
        <span
          key={stepIndex}
          className="h-1.5 rounded-full transition-all duration-300"
          style={{
            width: stepIndex === index ? 34 : 15,
            background: stepIndex <= index ? COLORS.accent : COLORS.line,
          }}
        />
      ))}
      <span style={{ marginLeft: 5, color: COLORS.muted, fontSize: 12, fontWeight: 700 }}>{index + 1} / 3</span>
    </div>
  );
}

function TextField({
  id,
  label,
  placeholder,
  value,
  onChange,
  onEnter,
  type = "text",
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  type?: string;
}) {
  return (
    <div
      className="rounded-[18px] border px-4 py-3 transition-colors duration-200 focus-within:border-[#635bff] focus-within:bg-white"
      style={{ borderColor: COLORS.line, background: COLORS.field }}
    >
      <label htmlFor={id} className="mb-1 block text-[11px] font-bold uppercase tracking-[0.13em]" style={{ color: COLORS.muted }}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && onEnter()}
        className="w-full bg-transparent text-[16px] outline-none"
        style={{ color: COLORS.ink, caretColor: COLORS.accent }}
        data-testid={`input-${id}`}
      />
    </div>
  );
}

function PhoneField({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
}) {
  return (
    <div
      className="group flex min-h-[62px] items-center gap-3 rounded-[18px] border px-4 transition-colors duration-200 focus-within:border-[#635bff] focus-within:bg-white"
      style={{ borderColor: COLORS.line, background: COLORS.field }}
    >
      <Phone size={19} strokeWidth={1.8} style={{ color: COLORS.accent }} aria-hidden="true" />
      <span style={{ color: COLORS.ink, fontSize: 15, fontWeight: 750 }}>+244</span>
      <span style={{ width: 1, height: 25, background: COLORS.line }} aria-hidden="true" />
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
        className="min-w-0 flex-1 bg-transparent text-[16px] outline-none"
        style={{ color: COLORS.ink, caretColor: COLORS.accent }}
        autoFocus
        data-testid="input-register-phone"
      />
    </div>
  );
}

function PinDots({ value, confirmed }: { value: string; confirmed?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-3" aria-label={`${value.length} de 4 dígitos preenchidos`}>
      {[0, 1, 2, 3].map((index) => {
        const filled = index < value.length;
        return (
          <span
            key={index}
            className="transition-all duration-200"
            style={{
              width: filled ? 15 : 13,
              height: filled ? 15 : 13,
              borderRadius: "50%",
              border: `2px solid ${filled ? COLORS.accent : COLORS.muted}`,
              background: filled ? COLORS.accent : "transparent",
              boxShadow: filled ? `0 0 0 4px ${COLORS.accentSoft}` : "none",
            }}
          />
        );
      })}
    </div>
  );
}

function Keypad({ onKey, disabled }: { onKey: (key: Key) => void; disabled: boolean }) {
  return (
    <div className="grid w-full max-w-[304px] grid-cols-3 gap-2.5" aria-label="Teclado numérico">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onPointerDown={(event) => {
            event.preventDefault();
            onKey(key);
          }}
          className="flex h-[54px] items-center justify-center rounded-[17px] border text-[18px] font-bold transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 disabled:cursor-wait disabled:opacity-50"
          style={{ borderColor: key === "backspace" ? "transparent" : COLORS.line, background: key === "backspace" ? "transparent" : COLORS.field, color: key === "backspace" ? COLORS.soft : COLORS.ink }}
          aria-label={key === "backspace" ? "Apagar último dígito" : `Dígito ${key}`}
          data-testid={`button-register-pin-${key}`}
        >
          {key === "backspace" ? <Delete size={20} strokeWidth={1.8} /> : key}
        </button>
      ))}
    </div>
  );
}

function ErrorNotice({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      className="mb-5 flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-[13px] leading-5"
      style={{ borderColor: "#f4c6bc", background: COLORS.errorBg, color: COLORS.error }}
      role="alert"
      aria-live="polite"
      data-testid="status-register-error"
    >
      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS.error }} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function RecoveryCodeNotice({ code, onContinue }: { code: string; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="min-h-[100dvh] overflow-x-hidden" style={{ background: COLORS.page, color: COLORS.ink, fontFamily: "'Avenir Next', 'Trebuchet MS', system-ui, sans-serif" }}>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[620px] flex-col px-5 py-6 sm:px-10 sm:py-10">
        <BrandMark compact />
        <section className="my-auto py-12">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-[18px]" style={{ background: "#e9f8f1", color: "#07885a" }}>
            <Check size={25} />
          </div>
          <p className="mb-4 text-[13px] font-bold uppercase tracking-[0.15em]" style={{ color: COLORS.accent }}>Conta criada</p>
          <h1 className="max-w-[500px] text-[clamp(35px,8vw,54px)] font-extrabold leading-[0.98] tracking-[-0.065em]">
            Guarda este código.
          </h1>
          <p className="mt-5 max-w-[470px] text-[16px] leading-6" style={{ color: COLORS.soft }}>
            É a única forma gratuita de recuperar o acesso se te esqueceres do PIN. Não o partilhes e guarda-o fora da aplicação.
          </p>
          <div className="mt-8 rounded-[20px] border px-4 py-5 text-center" style={{ borderColor: COLORS.accentSoft, background: "#ffffff" }}>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: COLORS.muted }}>Código de recuperação</p>
            <p className="break-all font-mono text-[22px] font-bold tracking-[0.08em]" style={{ color: COLORS.ink }}>{code}</p>
          </div>
          <button
            type="button"
            onClick={() => void copyCode()}
            className="mt-3 w-full rounded-[16px] border py-3 text-[13px] font-bold"
            style={{ borderColor: COLORS.line, color: COLORS.soft, background: "#ffffff" }}
          >
            {copied ? "Código copiado" : "Copiar código"}
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="mt-5 flex min-h-[60px] w-full items-center justify-between rounded-[18px] px-5 text-left font-bold"
            style={{ background: COLORS.accent, color: "#ffffff", boxShadow: "0 12px 24px rgba(99,91,255,0.2)" }}
          >
            <span>Continuar para o meu espaço</span>
            <ArrowRight size={19} strokeWidth={2.3} />
          </button>
        </section>
      </div>
    </main>
  );
}

function getSafeNext(handle: string | null): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return handle ? `/e/${handle}/dono` : "/escolher-handle";
}

export function RegisterPage() {
  const [, nav] = useLocation();
  const { login } = useAuth();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [registeredHandle, setRegisteredHandle] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function back() {
    setError("");
    if (step === "phone") setStep("name");
    else if (step === "pin") {
      setStep("phone");
      setPin("");
    } else if (step === "confirm") {
      setStep("pin");
      setConfirmPin("");
    } else nav("/login");
  }

  function handleNameNext() {
    if (name.trim().length < 2) {
      setError("Escreve o teu nome para começarmos.");
      return;
    }
    setError("");
    setStep("phone");
  }

  function handlePhoneNext() {
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Confirma o teu número de telemóvel para continuar.");
      return;
    }
    setError("");
    setStep("pin");
  }

  async function submitRegistration() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await userRegister({ phone, name: name.trim(), pin });
      login(response.user, response.token);
      if (response.recoveryCode) {
        setRegisteredHandle(response.user.handle);
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
      setLoading(false);
    }
  }

  function handlePinKey(key: Key) {
    if (step === "pin") {
      if (key === "backspace") {
        setPin((current) => current.slice(0, -1));
        return;
      }
      const nextPin = `${pin}${key}`.slice(0, 4);
      setPin(nextPin);
      if (nextPin.length === 4) window.setTimeout(() => setStep("confirm"), 220);
      return;
    }
    if (key === "backspace") {
      setConfirmPin((current) => current.slice(0, -1));
      return;
    }
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
    step === "name" ? "Vamos dar nome ao teu espaço." : step === "phone" ? "Onde te encontramos?" : step === "pin" ? "Cria um PIN simples." : "Confirma o teu PIN.";
  const description =
    step === "name" ? "Começa pelo nome que os teus clientes reconhecem." : step === "phone" ? "Usa o número onde costumas falar com clientes." : step === "pin" ? "Quatro dígitos para manter a tua conta só contigo." : "Só para termos a certeza de que ficou bem guardado.";

  if (recoveryCode) {
    return (
      <RecoveryCodeNotice
        code={recoveryCode}
        onContinue={() => nav(getSafeNext(registeredHandle))}
      />
    );
  }

  return (
    <main
      className="min-h-[100dvh] overflow-x-hidden"
      style={{
        background: COLORS.page,
        color: COLORS.ink,
        fontFamily: "'Avenir Next', 'Trebuchet MS', system-ui, sans-serif",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="grid min-h-[100dvh] md:grid-cols-[minmax(330px,0.82fr)_minmax(480px,1.18fr)]">
        <aside className="relative hidden overflow-hidden px-10 py-10 md:flex md:flex-col lg:px-16" style={{ background: COLORS.panel }}>
          <BrandMark />
          <div className="relative z-10 mt-auto max-w-[420px] pb-8">
            <p className="mb-5 text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color: COLORS.accent }}>
              Começa pequeno. Cresce ligado.
            </p>
            <h2 className="text-[clamp(38px,4.4vw,64px)] font-extrabold leading-[0.96] tracking-[-0.06em]" style={{ color: COLORS.panelDeep }}>
              O teu negócio merece um lugar próprio.
            </h2>
            <div className="mt-8 space-y-3 text-[14px]" style={{ color: COLORS.soft }}>
              <p className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: COLORS.accent, color: "#fff" }}><Check size={14} /></span> Conversas organizadas</p>
              <p className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: COLORS.accent, color: "#fff" }}><Check size={14} /></span> Produtos sempre à mão</p>
              <p className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: COLORS.accent, color: "#fff" }}><Check size={14} /></span> Um link para partilhar</p>
            </div>
          </div>
          <div className="absolute -right-20 top-24 h-64 w-64 rounded-full border-[34px]" style={{ borderColor: "rgba(99,91,255,0.14)" }} aria-hidden="true" />
          <div className="absolute -bottom-20 -left-16 h-72 w-72 rounded-full" style={{ background: "rgba(155,140,255,0.18)" }} aria-hidden="true" />
        </aside>

        <section className="flex min-w-0 flex-col">
          <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 py-6 sm:px-10 sm:py-9 lg:px-16">
            <div className="flex items-center justify-between">
              <div className="md:hidden"><BrandMark compact /></div>
              <div className="hidden md:block"><BackButton onClick={back} /></div>
              <StepRail current={step} />
            </div>

            <div className="mt-12 flex-1 sm:mt-16">
              <div className="mb-9">
                <p className="mb-4 text-[13px] font-bold uppercase tracking-[0.15em]" style={{ color: COLORS.accent }}>
                  Criar o teu espaço
                </p>
                <h1 className="max-w-[475px] text-[clamp(35px,8vw,54px)] font-extrabold leading-[0.98] tracking-[-0.065em]" style={{ color: COLORS.ink }}>
                  {title}
                </h1>
                <p className="mt-5 max-w-[400px] text-[16px] leading-6" style={{ color: COLORS.soft }}>
                  {description}
                </p>
              </div>

              <ErrorNotice message={error} />

              {step === "name" && (
                <div className="max-w-[460px]">
                  <TextField id="register-name" label="O teu nome" placeholder="Ex.: Ana Manuel" value={name} onChange={setName} onEnter={handleNameNext} />
                  <button
                    type="button"
                    onClick={handleNameNext}
                    className="mt-4 flex min-h-[60px] w-full items-center justify-between rounded-[18px] px-5 text-left font-bold transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                    style={{ background: COLORS.accent, color: "#ffffff", boxShadow: "0 12px 24px rgba(99,91,255,0.2)" }}
                    data-testid="button-register-name-continue"
                  >
                    <span>Continuar</span><ArrowRight size={19} strokeWidth={2.3} />
                  </button>
                </div>
              )}

              {step === "phone" && (
                <div className="max-w-[460px]">
                  <PhoneField value={phone} onChange={setPhone} onEnter={handlePhoneNext} />
                  <button
                    type="button"
                    onClick={handlePhoneNext}
                    className="mt-4 flex min-h-[60px] w-full items-center justify-between rounded-[18px] px-5 text-left font-bold transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                    style={{ background: COLORS.accent, color: "#ffffff", boxShadow: "0 12px 24px rgba(99,91,255,0.2)" }}
                    data-testid="button-register-phone-continue"
                  >
                    <span>Continuar</span><ArrowRight size={19} strokeWidth={2.3} />
                  </button>
                </div>
              )}

              {pinStep && (
                <div className="max-w-[460px]">
                  <div className="mb-7 flex flex-col items-center rounded-[24px] border px-5 py-6" style={{ borderColor: COLORS.line, background: "rgba(255,255,255,0.48)" }}>
                    <div className="mb-5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: COLORS.accent }}>
                      <LockKeyhole size={15} strokeWidth={2} />
                      {step === "confirm" ? "Repetir PIN" : "PIN privado"}
                    </div>
                    <PinDots value={step === "pin" ? pin : confirmPin} confirmed={step === "confirm"} />
                    <p className="mt-4 h-5 text-[12px]" style={{ color: loading ? COLORS.accent : COLORS.muted }} aria-live="polite" data-testid="status-register-loading">
                      {loading ? "A preparar o teu espaço…" : "Quatro dígitos"}
                    </p>
                  </div>
                  <Keypad onKey={handlePinKey} disabled={loading} />
                  <div className="mt-5 flex items-start gap-2 text-[12px] leading-5" style={{ color: COLORS.muted }}>
                    <ShieldCheck size={16} strokeWidth={1.8} className="mt-0.5 shrink-0" style={{ color: COLORS.accent }} />
                    O teu PIN é privado e não fica visível para os teus clientes.
                  </div>
                </div>
              )}
            </div>

            <div className="mt-12 border-t pt-5" style={{ borderColor: COLORS.line }}>
              <p className="text-[12px] leading-5" style={{ color: COLORS.muted }}>
                Ao continuar, aceitas os nossos termos e a nossa política de privacidade. Usamos os teus dados apenas para manter o teu espaço seguro.
              </p>
              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[14px]" style={{ color: COLORS.soft }}>
                  Já tens conta?{" "}
                  <Link href={`/login${window.location.search}`} className="font-bold underline decoration-2 underline-offset-4" style={{ color: COLORS.accent }} data-testid="link-register-login">
                    Entrar
                  </Link>
                </p>
                <button
                  type="button"
                  onClick={back}
                  className="inline-flex items-center gap-2 self-start text-[13px] font-bold"
                  style={{ color: COLORS.muted }}
                  data-testid="button-register-back"
                >
                  <ArrowLeft size={15} />
                  Voltar
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}