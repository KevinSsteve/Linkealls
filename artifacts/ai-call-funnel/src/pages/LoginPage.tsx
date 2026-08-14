/**
 * Página de login — WhatsApp Business light theme.
 */
import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userLogin } from "@/lib/api";

function PinDots({ value }: { value: string }) {
  return (
    <div className="flex justify-center gap-5 my-6">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="transition-all duration-150"
          style={{
            width: i < value.length ? 14 : 12,
            height: i < value.length ? 14 : 12,
            borderRadius: "50%",
            background: i < value.length ? "#25D366" : "transparent",
            border: `2px solid ${i < value.length ? "#25D366" : "#8696A0"}`,
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
    <div className="grid grid-cols-3 gap-3 w-full max-w-xs mx-auto">
      {KEYS.map((k, i) =>
        k === "" ? <div key={i} /> : (
          <button
            key={i}
            onPointerDown={(e) => { e.preventDefault(); onKey(k); }}
            className="h-[60px] rounded-full text-xl font-semibold flex items-center justify-center active:scale-90 transition-transform select-none"
            style={{
              background: k === "⌫" ? "transparent" : "#F0F2F5",
              color: k === "⌫" ? "#667781" : "#111B21",
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
      className="flex flex-col h-full px-6 pt-10 pb-8 overflow-y-auto"
      style={{ background: "#FFFFFF", minHeight: "var(--vh, 100dvh)" }}
    >
      {/* Back */}
      <button
        onClick={() => step === "pin" ? (setStep("phone"), setPin("")) : nav("/")}
        className="mb-8 w-9 h-9 flex items-center justify-center rounded-full transition-colors active:bg-[#F0F2F5]"
        style={{ color: "#667781" }}
      >
        <ArrowLeft size={22} />
      </button>

      {/* Logo / heading */}
      <div className="mb-8 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "#25D366" }}
        >
          <span className="text-white font-bold text-[28px]">L</span>
        </div>
        <h1 className="text-[24px] font-bold" style={{ color: "#111B21" }}>
          {step === "phone" ? "Entrar" : "PIN de acesso"}
        </h1>
        <p className="text-[15px] mt-1.5" style={{ color: "#667781" }}>
          {step === "phone"
            ? "Insere o teu número de telemóvel"
            : `Código de acesso para ${phone}`}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-4 px-4 py-3 rounded-xl text-[14px]"
          style={{ background: "#FEE2E2", color: "#DC2626" }}
        >
          {error}
        </div>
      )}

      {step === "phone" && (
        <>
          {/* Phone input */}
          <div
            className="flex items-center gap-3 px-4 rounded-xl mb-5"
            style={{ background: "#F0F2F5", height: 56 }}
          >
            <span className="text-[18px]">🇦🇴</span>
            <span className="text-[15px] font-semibold" style={{ color: "#667781" }}>+244</span>
            <div style={{ width: 1, height: 22, background: "#E9EDEF" }} />
            <input
              ref={phoneRef}
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ""))}
              placeholder="9XX XXX XXX"
              autoFocus
              className="flex-1 bg-transparent outline-none text-[16px]"
              style={{ color: "#111B21", caretColor: "#25D366" }}
              onKeyDown={(e) => e.key === "Enter" && handlePhoneNext()}
            />
          </div>

          <button
            onClick={handlePhoneNext}
            className="w-full h-[54px] rounded-full font-bold text-[16px]"
            style={{ background: "#25D366", color: "#FFFFFF" }}
          >
            Continuar
          </button>
        </>
      )}

      {step === "pin" && (
        <div className="flex flex-col items-center">
          <PinDots value={pin} />
          {loading
            ? <p className="text-[13px] mb-5" style={{ color: "#25D366" }}>A entrar…</p>
            : <p className="text-[13px] mb-5 opacity-0">·</p>}
          <Keypad onKey={handlePinKey} />
        </div>
      )}

      <p className="mt-auto pt-8 text-center text-[15px]" style={{ color: "#667781" }}>
        Ainda não tens conta?{" "}
        <Link href={`/registar${window.location.search}`} className="font-semibold" style={{ color: "#25D366" }}>
          Criar conta
        </Link>
      </p>
    </div>
  );
}
