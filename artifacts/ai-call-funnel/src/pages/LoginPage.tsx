/**
 * Página de login — telemóvel + PIN de 4 dígitos, sem SMS.
 */
import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Phone, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userLogin } from "@/lib/api";

// ─── PIN keypad ──────────────────────────────────────────────────────────────

function PinDots({ value }: { value: string }) {
  return (
    <div className="flex justify-center gap-4 my-5">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="w-4 h-4 rounded-full transition-all duration-150"
          style={{
            background: i < value.length ? "#00BFA5" : "rgba(255,255,255,0.12)",
            boxShadow: i < value.length ? "0 0 8px rgba(0,191,165,0.5)" : "none",
            transform: i < value.length ? "scale(1.15)" : "scale(1)",
          }}
        />
      ))}
    </div>
  );
}

const KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"] as const;

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-xs mx-auto">
      {KEYS.map((k, i) =>
        k === "" ? (
          <div key={i} />
        ) : (
          <button
            key={i}
            onPointerDown={(e) => { e.preventDefault(); onKey(k); }}
            className="h-14 rounded-2xl text-xl font-semibold flex items-center justify-center active:scale-90 transition-transform select-none"
            style={{
              background: k === "⌫" ? "rgba(255,80,80,0.1)" : "rgba(255,255,255,0.06)",
              border:     "1px solid rgba(255,255,255,0.08)",
              color:      k === "⌫" ? "#F87171" : "#EAF0F7",
            }}
          >
            {k}
          </button>
        )
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function LoginPage() {
  const [, nav]   = useLocation();
  const { login } = useAuth();

  const [step, setStep]       = useState<"phone" | "pin">("phone");
  const [phone, setPhone]     = useState("");
  const [pin, setPin]         = useState("");
  const [showPhone, setShow]  = useState(false);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const phoneRef              = useRef<HTMLInputElement>(null);

  function handlePhoneNext() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) { setError("Insere um número válido"); return; }
    setError("");
    setStep("pin");
  }

  async function handlePinKey(k: string) {
    if (k === "⌫") { setPin((p) => p.slice(0, -1)); return; }
    const next = pin + k;
    setPin(next);
    if (next.length < 4) return;

    // auto-submit when 4 digits
    setLoading(true);
    setError("");
    try {
      const { user, token } = await userLogin({ phone, pin: next });
      login(user, token);
      nav("/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Número ou PIN incorretos");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex flex-col h-full bg-[#080E18] px-6 pt-12 pb-8 overflow-y-auto"
      style={{ minHeight: "var(--vh, 100dvh)" }}
    >
      {/* Back */}
      <button
        onClick={() => step === "pin" ? (setStep("phone"), setPin("")) : nav("/")}
        className="mb-8 w-9 h-9 flex items-center justify-center rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <ArrowLeft size={18} style={{ color: "#7B96B2" }} />
      </button>

      {/* Header */}
      <div className="mb-8">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "rgba(0,191,165,0.12)", border: "1px solid rgba(0,191,165,0.25)" }}
        >
          <Phone size={24} style={{ color: "#00BFA5" }} />
        </div>
        <h1 className="text-[22px] font-bold text-[#EAF0F7]">
          {step === "phone" ? "Entrar" : "O teu PIN"}
        </h1>
        <p className="text-[14px] mt-1" style={{ color: "#4A6B80" }}>
          {step === "phone"
            ? "Insere o teu número de telemóvel"
            : `Código de acesso para ${phone}`}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-4 px-4 py-3 rounded-xl text-[13px]"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#FCA5A5" }}
        >
          {error}
        </div>
      )}

      {/* ── Step: phone ── */}
      {step === "phone" && (
        <>
          <div
            className="flex items-center gap-3 px-4 rounded-2xl mb-4"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              height: 56,
            }}
          >
            <span className="text-[15px]">🇦🇴</span>
            <span className="text-[15px] font-semibold" style={{ color: "#7B96B2" }}>+244</span>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />
            <input
              ref={phoneRef}
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ""))}
              placeholder="9XX XXX XXX"
              autoFocus
              className="flex-1 bg-transparent outline-none text-[16px]"
              style={{ color: "#EAF0F7", caretColor: "#00BFA5" }}
              onKeyDown={(e) => e.key === "Enter" && handlePhoneNext()}
            />
            <button onClick={() => setShow((s) => !s)} className="opacity-50">
              {showPhone ? <EyeOff size={16} style={{ color: "#7B96B2" }} /> : <Eye size={16} style={{ color: "#7B96B2" }} />}
            </button>
          </div>

          <button
            onClick={handlePhoneNext}
            className="w-full h-14 rounded-2xl font-bold text-[15px] transition-opacity"
            style={{ background: "#00BFA5", color: "#050D14" }}
          >
            Continuar
          </button>
        </>
      )}

      {/* ── Step: PIN keypad ── */}
      {step === "pin" && (
        <div className="flex flex-col items-center">
          <PinDots value={pin} />
          {loading
            ? <p className="text-[13px] mb-6" style={{ color: "#00BFA5" }}>A entrar…</p>
            : <p className="text-[13px] mb-6 opacity-0">·</p>
          }
          <Keypad onKey={handlePinKey} />
        </div>
      )}

      {/* Register link */}
      <p className="mt-auto pt-8 text-center text-[14px]" style={{ color: "#4A6B80" }}>
        Ainda não tens conta?{" "}
        <Link href="/registar" className="font-semibold" style={{ color: "#00BFA5" }}>
          Criar conta
        </Link>
      </p>
    </div>
  );
}
