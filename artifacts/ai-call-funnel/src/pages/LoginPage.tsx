/**
 * Página de login — design premium, safe-area-aware.
 */
import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userLogin } from "@/lib/api";

const G = "#16A34A";      // brand green
const BG = "#FFFFFF";
const SUBTLE = "#F3F4F6";
const INK = "#111111";
const SOFT = "#6B7280";
const FAINT = "#9CA3AF";
const BORDER = "#E5E7EB";

function PinDots({ value }: { value: string }) {
  return (
    <div className="flex justify-center gap-5" style={{ margin: "24px 0" }}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="transition-all duration-150"
          style={{
            width: i < value.length ? 14 : 12,
            height: i < value.length ? 14 : 12,
            borderRadius: "50%",
            background: i < value.length ? G : "transparent",
            border: `2px solid ${i < value.length ? G : FAINT}`,
            transform: i < value.length ? "scale(1.1)" : "scale(1)",
          }}
        />
      ))}
    </div>
  );
}

const KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"] as const;

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-[280px] mx-auto">
      {KEYS.map((k, i) =>
        k === "" ? <div key={i} /> : (
          <button
            key={i}
            onPointerDown={(e) => { e.preventDefault(); onKey(k); }}
            className="h-[60px] rounded-2xl text-xl font-semibold flex items-center justify-center active:scale-90 transition-transform select-none"
            style={{
              background: k === "⌫" ? "transparent" : SUBTLE,
              color: k === "⌫" ? SOFT : INK,
              fontSize: k === "⌫" ? 22 : undefined,
            }}
          >
            {k}
          </button>
        )
      )}
    </div>
  );
}

function getSafeNext(handle: string | null): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return handle ? `/e/${handle}/dono` : "/escolher-handle";
}

export function LoginPage() {
  const [, nav]   = useLocation();
  const { login } = useAuth();

  const [step, setStep]       = useState<"phone" | "pin">("phone");
  const [phone, setPhone]     = useState("");
  const [pin, setPin]         = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const phoneRef              = useRef<HTMLInputElement>(null);

  function handlePhoneNext() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) { setError("Insere um número válido"); return; }
    setError(""); setStep("pin");
  }

  async function handlePinKey(k: string) {
    if (k === "⌫") { setPin((p) => p.slice(0, -1)); return; }
    const next = pin + k;
    setPin(next);
    if (next.length < 4) return;
    setLoading(true); setError("");
    try {
      const { user, token } = await userLogin({ phone, pin: next });
      login(user, token);
      nav(getSafeNext(user.handle ?? null));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Número ou PIN incorretos");
      setPin("");
    } finally { setLoading(false); }
  }

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{
        background: BG,
        minHeight: "100dvh",
        // Safe area: top padding respects notch
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Inner container with consistent horizontal padding */}
      <div className="flex flex-col flex-1" style={{ padding: "0 20px" }}>

        {/* Back button */}
        <button
          onClick={() => step === "pin" ? (setStep("phone"), setPin("")) : nav("/")}
          className="flex items-center justify-center rounded-full transition-opacity active:opacity-60 self-start"
          style={{
            width: 40, height: 40,
            background: SUBTLE,
            color: SOFT,
            marginTop: 12,
            marginBottom: 32,
          }}
          aria-label="Voltar"
        >
          <ArrowLeft size={20} strokeWidth={1.75} />
        </button>

        {/* Logo + heading */}
        <div className="text-center mb-8">
          <div
            className="flex items-center justify-center mx-auto mb-5 font-bold text-white"
            style={{
              width: 64, height: 64,
              borderRadius: 18,
              background: G,
              fontSize: 26,
            }}
          >
            L
          </div>
          <h1 style={{ color: INK, fontSize: 24, fontWeight: 700, letterSpacing: "-0.3px" }}>
            {step === "phone" ? "Entrar" : "PIN de acesso"}
          </h1>
          <p style={{ color: SOFT, fontSize: 15, marginTop: 6 }}>
            {step === "phone"
              ? "Insere o teu número de telemóvel"
              : `Código de acesso para ${phone}`}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="rounded-xl mb-4"
            style={{
              background: "#FEF2F2",
              border: `1px solid #FECACA`,
              color: "#DC2626",
              padding: "12px 14px",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {step === "phone" && (
          <>
            {/* Phone field */}
            <div
              className="flex items-center gap-3 rounded-xl mb-4"
              style={{
                background: SUBTLE,
                border: `1px solid ${BORDER}`,
                height: 52,
                paddingLeft: 14,
                paddingRight: 14,
              }}
            >
              <span style={{ fontSize: 18 }}>🇦🇴</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: SOFT }}>+244</span>
              <div style={{ width: 1, height: 20, background: BORDER }} />
              <input
                ref={phoneRef}
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ""))}
                placeholder="9XX XXX XXX"
                autoFocus
                className="flex-1 bg-transparent outline-none"
                style={{ color: INK, fontSize: 16, caretColor: G }}
                onKeyDown={(e) => e.key === "Enter" && handlePhoneNext()}
              />
            </div>

            <button
              onClick={handlePhoneNext}
              className="w-full font-bold transition-opacity active:opacity-80"
              style={{ background: G, color: "#fff", borderRadius: 14, height: 52, fontSize: 16 }}
            >
              Continuar
            </button>
          </>
        )}

        {step === "pin" && (
          <div className="flex flex-col items-center">
            <PinDots value={pin} />
            <p style={{ color: loading ? G : "transparent", fontSize: 13, marginBottom: 20 }}>
              A entrar…
            </p>
            <Keypad onKey={handlePinKey} />
          </div>
        )}

        <p className="mt-auto text-center" style={{ color: SOFT, fontSize: 15, paddingTop: 32, paddingBottom: 16 }}>
          Ainda não tens conta?{" "}
          <Link href={`/registar${window.location.search}`}>
            <span className="font-semibold" style={{ color: G }}>Criar conta</span>
          </Link>
        </p>
      </div>
    </div>
  );
}
