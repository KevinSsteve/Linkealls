import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Delete,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userLogin } from "@/lib/api";
import { AuthBrand } from "@/components/auth/AuthBrand";

const COLORS = {
  page: "#fbfaff",
  panel: "#f1edff",
  panelDeep: "#2d176d",
  ink: "#0a2540",
  soft: "#344558", // Darkened for better contrast
  muted: "#5b6e82", // Darkened for better contrast
  line: "#e6ebf1",
  field: "#ffffff",
  accent: "#635bff",
  accentDark: "#5046e5",
  accentSoft: "#eeecff",
  error: "#b34235",
  errorBg: "#fff0eb",
};

type Key = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "0" | "backspace";
const KEYS: Key[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "backspace"];


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

function StepRail({ current }: { current: "phone" | "pin" }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Passo ${current === "phone" ? "1" : "2"} de 2`}>
      <span
        className="h-1.5 rounded-full transition-all duration-300"
        style={{ width: current === "phone" ? 42 : 18, background: COLORS.accent }}
      />
      <span
        className="h-1.5 rounded-full transition-all duration-300"
        style={{ width: current === "pin" ? 42 : 18, background: current === "pin" ? COLORS.accent : COLORS.line }}
      />
      <span style={{ marginLeft: 5, color: COLORS.muted, fontSize: 12, fontWeight: 700 }}>
        {current === "phone" ? "1 / 2" : "2 / 2"}
      </span>
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
    <div
      className="auth-input-wrap group flex min-h-[56px] items-center gap-3 rounded-[16px] border px-4 transition-colors duration-200 focus-within:border-[#635bff] focus-within:bg-white"
      style={{ borderColor: COLORS.line, background: COLORS.field }}
    >
      <span style={{ color: COLORS.ink, fontSize: 15, fontWeight: 750 }}>+244</span>
      <span style={{ width: 1, height: 25, background: COLORS.line }} aria-hidden="true" />
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
        className="min-w-0 flex-1 bg-transparent text-[16px] outline-none"
        style={{ color: COLORS.ink, caretColor: COLORS.accent }}
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
    <div className="flex items-center justify-center gap-3" aria-label={`${value.length} de 4 dígitos preenchidos`} aria-live="polite" role="status">
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

function Keypad({ value, onKey, disabled }: { value: string; onKey: (key: Key) => void; disabled: boolean }) {
  return (
    <div className="grid w-full max-w-[304px] grid-cols-3 gap-2.5" aria-label="Teclado numérico">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            onKey(key);
          }}
          className="flex h-[54px] items-center justify-center rounded-[17px] border text-[18px] font-bold transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 disabled:cursor-wait disabled:opacity-50"
          style={{
            borderColor: key === "backspace" ? "transparent" : COLORS.line,
            background: key === "backspace" ? "transparent" : COLORS.field,
            color: key === "backspace" ? COLORS.soft : COLORS.ink,
          }}
          aria-label={key === "backspace" ? "Apagar último dígito" : `Dígito ${key}`}
          data-testid={`button-pin-${key}`}
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
      id="login-error"
      className="mb-5 flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-[13px] leading-5"
      style={{ borderColor: "#f4c6bc", background: COLORS.errorBg, color: COLORS.error }}
      role="alert"
      aria-live="polite"
      data-testid="status-login-error"
    >
      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS.error }} aria-hidden="true" />
      <span>{message}</span>
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
  const { login } = useAuth();
  const [step, setStep] = useState<"phone" | "pin">("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handlePhoneNext() {
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Confirma o teu número de telemóvel para continuar.");
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

  return (
    <main
      className="auth-clean-page min-h-[100dvh] overflow-x-hidden"
      style={{
        background: COLORS.page,
        color: COLORS.ink,
        fontFamily: "'Avenir Next', 'Trebuchet MS', system-ui, sans-serif",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="grid min-h-[100dvh] lg:grid-cols-[minmax(330px,0.82fr)_minmax(480px,1.18fr)]">
        <aside
          className="relative hidden overflow-hidden px-10 py-10 lg:flex lg:flex-col lg:px-16"
          style={{ background: COLORS.panel }}
        >
          <AuthBrand />
          <div className="relative z-10 mt-auto max-w-[420px] pb-8">
            <p className="mb-5 text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color: COLORS.accent }}>
              O teu negócio, num só lugar
            </p>
            <h2
              className="text-[clamp(38px,4.4vw,64px)] font-extrabold leading-[0.96] tracking-[-0.06em]"
              style={{ color: COLORS.panelDeep }}
            >
              Conversas que viram negócio.
            </h2>
            <p className="mt-6 max-w-[340px] text-[15px] leading-6" style={{ color: COLORS.soft }}>
              Fala com clientes, mostra o que vendes e deixa o teu link trabalhar por ti.
            </p>
          </div>
          <div
            className="absolute -right-20 top-24 h-64 w-64 rounded-full border-[34px]"
            style={{ borderColor: "rgba(99,91,255,0.14)" }}
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-20 -left-16 h-72 w-72 rounded-full"
            style={{ background: "rgba(155,140,255,0.18)" }}
            aria-hidden="true"
          />
          <div
            className="absolute right-16 top-28 h-3 w-3 rounded-full"
            style={{ background: "#9b8cff" }}
            aria-hidden="true"
          />
        </aside>

        <section className="flex min-w-0 flex-col justify-center">
          <div className="mx-auto flex w-full max-w-[560px] flex-col px-5 py-6 sm:px-10 sm:py-9 lg:px-16">
            <div className="flex items-center justify-between">
              <div className="auth-mobile-brand lg:hidden">
                <AuthBrand />
              </div>
              <div className="auth-desktop-back hidden lg:block">
                <BackButton onClick={() => (step === "pin" ? (setStep("phone"), setPin("")) : nav("/"))} />
              </div>
              <StepRail current={step} />
            </div>

            <div className="auth-content mt-10 sm:mt-16">
              <div className="mb-7">
                <p className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.12em]" style={{ color: COLORS.accent }}>
                  {step === "phone" ? "Entrar na Linkealls" : "Só mais um passo"}
                </p>
                <h1 className="max-w-[460px] text-[clamp(32px,8vw,48px)] font-extrabold leading-[1.05] tracking-[-0.04em]" style={{ color: COLORS.ink }}>
                  {step === "phone" ? "Bom ter-te de volta." : "Confirma que és tu."}
                </h1>
                <p className="mt-4 max-w-[400px] text-[16px] leading-relaxed" style={{ color: COLORS.soft }}>
                  {step === "phone"
                    ? "Entra para continuares a cuidar das tuas conversas e clientes."
                    : `Introduz o PIN de 4 dígitos associado a ${phone}.`}
                </p>
              </div>

              <ErrorNotice message={error} />

              {step === "phone" ? (
                <div className="max-w-[460px]">
                  <PhoneField value={phone} onChange={setPhone} onEnter={handlePhoneNext} errorId={error ? "login-error" : undefined} />
                  <button
                    type="button"
                    onClick={handlePhoneNext}
                    className="auth-primary mt-4 flex min-h-[56px] w-full items-center justify-between rounded-[16px] px-5 text-left font-bold transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                    style={{ background: COLORS.accent, color: "#ffffff", boxShadow: "0 8px 20px rgba(99,91,255,0.15)" }}
                    data-testid="button-login-continue"
                  >
                    <span>Continuar</span>
                    <ArrowRight size={19} strokeWidth={2.3} />
                  </button>
                  <div className="mt-5 flex items-start gap-2 text-[13px] leading-relaxed" style={{ color: COLORS.muted }}>
                    <ShieldCheck size={18} strokeWidth={1.8} className="mt-0.5 shrink-0" style={{ color: COLORS.accent }} />
                    <p>O teu número e PIN ficam protegidos. Não partilhamos os teus dados.</p>
                  </div>
                   <Link
                     href="/recuperar-acesso"
                     className="mt-6 inline-flex min-h-[44px] items-center text-[14px] font-bold underline underline-offset-4 transition-colors hover:text-[#0a2540]"
                     style={{ color: COLORS.soft }}
                   >
                     Esqueci-me do PIN
                   </Link>
                </div>
              ) : (
                <div className="max-w-[460px]">
                  <div className="auth-pin-card mb-6 flex flex-col items-center rounded-[20px] border px-5 py-5" style={{ borderColor: COLORS.line, background: "rgba(255,255,255,0.7)" }}>
                    <div className="mb-4 flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.1em]" style={{ color: COLORS.accent }}>
                      <LockKeyhole size={15} strokeWidth={2} />
                      PIN de acesso
                    </div>
                    <PinDots value={pin} />
                    <p className="mt-4 h-5 text-[13px] font-medium" style={{ color: loading ? COLORS.accent : COLORS.muted }} aria-live="polite" data-testid="status-login-loading">
                      {loading ? "A abrir o teu espaço…" : "Quatro dígitos"}
                    </p>
                  </div>
                  <Keypad value={pin} onKey={handlePinKey} disabled={loading} />
                  <button
                    type="button"
                    disabled={pin.length !== 4 || loading}
                    onClick={() => void submitPin(pin)}
                    className="auth-primary mt-4 flex min-h-[56px] w-full items-center justify-between rounded-[16px] px-5 text-left font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ background: COLORS.accent, color: "#ffffff", boxShadow: pin.length === 4 ? "0 8px 20px rgba(99,91,255,0.15)" : "none" }}
                    data-testid="button-login-submit"
                  >
                    <span>{loading ? "A entrar…" : "Continuar"}</span>
                    {loading ? <Sparkles size={18} className="animate-pulse" /> : <Check size={19} strokeWidth={2.4} />}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-10 flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: COLORS.line }}>
              <p className="text-[14px]" style={{ color: COLORS.soft }}>
                Ainda não tens conta?{" "}
                <Link href={`/registar${window.location.search}`} className="font-bold underline decoration-2 underline-offset-4 transition-colors hover:text-[#0a2540]" style={{ color: COLORS.accent }} data-testid="link-login-register">
                  Criar conta
                </Link>
              </p>
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center gap-2 self-start text-[14px] font-bold transition-colors hover:text-[#0a2540]"
                style={{ color: COLORS.muted }}
                onClick={() => (step === "pin" ? (setStep("phone"), setPin(""), setError("")) : nav("/"))}
                data-testid="button-login-back"
              >
                <ArrowLeft size={16} />
                {step === "pin" ? "Trocar número" : "Voltar ao início"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}