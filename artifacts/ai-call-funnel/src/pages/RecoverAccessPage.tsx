import { useState } from "react";
import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole, Phone, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { recoverUserAccess } from "@/lib/api";
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

function BrandMark() {
  return (
    <div className="flex items-center gap-3" style={{ color: COLORS.ink }}>
      <img
        src={brandLogo}
        alt="Linkealls"
        className="auth-brand-logo h-10 w-10 rounded-[13px] object-cover"
        style={{ boxShadow: "none" }}
      />
      <span className="text-[18px] font-extrabold tracking-[-0.04em]">linkealls</span>
    </div>
  );
}

function Field({
  id,
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  inputMode,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "text" | "numeric";
}) {
  return (
    <label
      htmlFor={id}
      className="auth-input-wrap block rounded-[18px] border px-4 py-3 focus-within:border-[#635bff]"
      style={{ borderColor: COLORS.line, background: COLORS.field }}
    >
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.13em]" style={{ color: COLORS.muted }}>
        {label}
      </span>
      <input
        id={id}
        value={value}
        type={type}
        inputMode={inputMode}
        autoComplete={id === "recover-phone" ? "tel" : id.includes("pin") ? "new-password" : "off"}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-transparent text-[16px] outline-none"
        style={{ color: COLORS.ink, caretColor: COLORS.accent }}
      />
    </label>
  );
}

export function RecoverAccessPage() {
  const [, nav] = useLocation();
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Confirma o teu número de telemóvel.");
      return;
    }
    if (recoveryCode.replace(/[^a-z0-9]/gi, "").length < 8) {
      setError("Indica o código de recuperação completo.");
      return;
    }
    if (!/^\d{4}$/.test(pin) || pin !== confirmPin) {
      setError("Os dois PINs devem ter os mesmos 4 dígitos.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await recoverUserAccess({
        phone,
        recoveryCode,
        pin,
      });
      login(response.user, response.token);
      nav(response.user.handle ? `/e/${response.user.handle}/dono` : "/escolher-handle");
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível recuperar a conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="auth-clean-page min-h-[100dvh] overflow-x-hidden"
      style={{
        background: COLORS.page,
        color: COLORS.ink,
        fontFamily: "'Avenir Next', 'Trebuchet MS', system-ui, sans-serif",
      }}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[620px] flex-col px-5 py-6 sm:px-10 sm:py-10">
        <div className="flex items-center justify-between">
          <Link href="/login" className="inline-flex h-11 w-11 items-center justify-center rounded-full" style={{ color: COLORS.ink, background: COLORS.accentSoft }} aria-label="Voltar">
            <ArrowLeft size={18} />
          </Link>
          <BrandMark />
        </div>

        <section className="my-auto py-12">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-[18px]" style={{ background: COLORS.accentSoft, color: COLORS.accent }}>
            <KeyRound size={25} />
          </div>
          <p className="mb-4 text-[13px] font-bold uppercase tracking-[0.15em]" style={{ color: COLORS.accent }}>
            Recuperar acesso
          </p>
          <h1 className="max-w-[500px] text-[clamp(35px,8vw,54px)] font-extrabold leading-[0.98] tracking-[-0.065em]">
            Cria um PIN novo.
          </h1>
          <p className="mt-5 max-w-[470px] text-[16px] leading-6" style={{ color: COLORS.soft }}>
            Usa o código de recuperação que guardaste quando criaste a conta. Este código funciona uma única vez.
          </p>

          {error && (
            <div className="mt-6 rounded-2xl border px-3.5 py-3 text-[13px] leading-5" style={{ borderColor: "#f4c6bc", background: COLORS.errorBg, color: COLORS.error }} role="alert">
              {error}
            </div>
          )}

          <form
            className="mt-7"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="grid gap-3">
              <Field id="recover-phone" label="Número de telemóvel" placeholder="9XX XXX XXX" value={phone} onChange={(value) => setPhone(value.replace(/[^\d\s]/g, ""))} type="tel" inputMode="numeric" />
              <Field id="recovery-code" label="Código de recuperação" placeholder="Ex.: A1B2-C3D4-E5F6" value={recoveryCode} onChange={(value) => setRecoveryCode(value.toUpperCase())} />
              <Field id="new-pin" label="Novo PIN" placeholder="4 dígitos" value={pin} onChange={(value) => setPin(value.replace(/\D/g, "").slice(0, 4))} type="password" inputMode="numeric" />
              <Field id="confirm-new-pin" label="Confirmar novo PIN" placeholder="Repete o PIN" value={confirmPin} onChange={(value) => setConfirmPin(value.replace(/\D/g, "").slice(0, 4))} type="password" inputMode="numeric" />
            </div>

            <button
            type="submit"
            disabled={loading}
             className="auth-primary mt-5 flex min-h-[60px] w-full items-center justify-between rounded-[18px] px-5 text-left font-bold transition-transform hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-60"
            style={{ background: COLORS.accent, color: "#ffffff", boxShadow: "0 12px 24px rgba(99,91,255,0.2)" }}
          >
            <span>{loading ? "A recuperar acesso…" : "Definir novo PIN"}</span>
            <ArrowRight size={19} strokeWidth={2.3} />
            </button>
          </form>

          <div className="mt-6 flex items-start gap-2 text-[12px] leading-5" style={{ color: COLORS.muted }}>
            <ShieldCheck size={16} className="mt-0.5 shrink-0" style={{ color: COLORS.accent }} />
            O código é apagado depois de ser usado e nunca revela o PIN anterior.
          </div>
        </section>

        <p className="border-t pt-5 text-[14px]" style={{ borderColor: COLORS.line, color: COLORS.soft }}>
          Lembraste-te do PIN?{" "}
          <Link href="/login" className="font-bold underline" style={{ color: COLORS.accent }}>
            Voltar ao login
          </Link>
        </p>
      </div>
    </main>
  );
}