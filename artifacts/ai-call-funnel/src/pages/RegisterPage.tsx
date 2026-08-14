/**
 * Página de registo — WhatsApp Business light theme.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userRegister } from "@/lib/api";

function PinDots({ value, confirmed }: { value: string; confirmed?: boolean }) {
  const activeColor = confirmed ? "#25D366" : "#075E54";
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
            background: i < value.length ? activeColor : "transparent",
            border: `2px solid ${i < value.length ? activeColor : "#8696A0"}`,
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

const STEPS = ["Nome", "Telemóvel", "PIN"] as const;

function Steps({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold"
              style={{
                background: i < current ? "#25D366" : i === current ? "#D9FDD3" : "#F0F2F5",
                border: `2px solid ${i <= current ? "#25D366" : "#E9EDEF"}`,
                color: i < current ? "#FFFFFF" : i === current ? "#128C7E" : "#8696A0",
              }}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span className="text-[10px] font-semibold whitespace-nowrap"
              style={{ color: i <= current ? "#128C7E" : "#8696A0" }}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className="flex-1 mb-4"
              style={{ height: 2, background: i < current ? "#25D366" : "#E9EDEF", width: 32, borderRadius: 1 }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

type Step = "name" | "phone" | "pin" | "confirm";

function getSafeNext(handle: string | null): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return handle ? `/e/${handle}/dono` : "/escolher-handle";
}

export function RegisterPage() {
  const [, nav]   = useLocation();
  const { login } = useAuth();

  const [step, setStep]          = useState<Step>("name");
  const [name, setName]          = useState("");
  const [phone, setPhone]        = useState("");
  const [pin, setPin]            = useState("");
  const [confirmPin, setConfirm] = useState("");
  const [error, setError]        = useState("");
  const [loading, setLoading]    = useState(false);

  const stepIndex = step === "name" ? 0 : step === "phone" ? 1 : 2;

  function back() {
    setError("");
    if      (step === "phone")   setStep("name");
    else if (step === "pin")     { setStep("phone"); setPin(""); }
    else if (step === "confirm") { setStep("pin"); setPin(""); setConfirm(""); }
    else                         nav("/login");
  }

  function handleNameNext() {
    if (name.trim().length < 2) { setError("Insere o teu nome completo"); return; }
    setError(""); setStep("phone");
  }

  function handlePhoneNext() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) { setError("Número inválido"); return; }
    setError(""); setStep("pin");
  }

  async function handlePinKey(k: string) {
    if (step === "pin") {
      if (k === "⌫") { setPin((p) => p.slice(0, -1)); return; }
      const next = pin + k;
      setPin(next);
      if (next.length === 4) setTimeout(() => setStep("confirm"), 200);
    } else {
      if (k === "⌫") { setConfirm((p) => p.slice(0, -1)); return; }
      const next = confirmPin + k;
      setConfirm(next);
      if (next.length < 4) return;
      if (next !== pin) {
        setError("Os PINs não coincidem. Tenta de novo.");
        setPin(""); setConfirm(""); setStep("pin"); return;
      }
      setLoading(true); setError("");
      try {
        const { user, token } = await userRegister({ phone, name: name.trim(), pin });
        login(user, token);
        nav(getSafeNext(user.handle ?? null));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao criar conta");
        setConfirm(""); setPin(""); setStep("pin");
      } finally { setLoading(false); }
    }
  }

  const isPinStep = step === "pin" || step === "confirm";

  return (
    <div
      className="flex flex-col h-full px-6 pt-10 pb-8 overflow-y-auto"
      style={{ background: "#FFFFFF", minHeight: "var(--vh, 100dvh)" }}
    >
      {/* Back */}
      <button
        onClick={back}
        className="mb-6 w-9 h-9 flex items-center justify-center rounded-full transition-colors active:bg-[#F0F2F5]"
        style={{ color: "#667781" }}
      >
        <ArrowLeft size={22} />
      </button>

      {/* Heading */}
      <div className="mb-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "#075E54" }}
        >
          <span className="text-white font-bold text-[28px]">L</span>
        </div>
        <h1 className="text-[24px] font-bold text-center" style={{ color: "#111B21" }}>Criar conta</h1>
        <p className="text-[15px] mt-1.5 text-center" style={{ color: "#667781" }}>
          {step === "name"    && "Como te chamas?"}
          {step === "phone"   && "Qual é o teu número?"}
          {step === "pin"     && "Escolhe um PIN de 4 dígitos"}
          {step === "confirm" && "Confirma o teu PIN"}
        </p>
      </div>

      <Steps current={stepIndex} />

      {/* Error */}
      {error && (
        <div
          className="mb-4 px-4 py-3 rounded-xl text-[14px]"
          style={{ background: "#FEE2E2", color: "#DC2626" }}
        >
          {error}
        </div>
      )}

      {step === "name" && (
        <>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: João Ferreira"
            autoFocus
            className="w-full h-14 px-4 rounded-xl text-[16px] outline-none mb-5"
            style={{ background: "#F0F2F5", color: "#111B21", caretColor: "#25D366" }}
            onKeyDown={(e) => e.key === "Enter" && handleNameNext()}
          />
          <button
            onClick={handleNameNext}
            className="w-full h-[54px] rounded-full font-bold text-[16px]"
            style={{ background: "#25D366", color: "#FFFFFF" }}
          >
            Continuar
          </button>
        </>
      )}

      {step === "phone" && (
        <>
          <div
            className="flex items-center gap-3 px-4 rounded-xl mb-5"
            style={{ background: "#F0F2F5", height: 56 }}
          >
            <span className="text-[18px]">🇦🇴</span>
            <span className="text-[15px] font-semibold" style={{ color: "#667781" }}>+244</span>
            <div style={{ width: 1, height: 22, background: "#E9EDEF" }} />
            <input
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

      {isPinStep && (
        <div className="flex flex-col items-center">
          <PinDots value={step === "pin" ? pin : confirmPin} confirmed={step === "confirm"} />
          {loading
            ? <p className="text-[13px] mb-5 flex items-center gap-2" style={{ color: "#25D366" }}>
                <CheckCircle size={14} /> A criar conta…
              </p>
            : <p className="text-[13px] mb-5 opacity-0">·</p>}
          <Keypad onKey={handlePinKey} />
        </div>
      )}

      <p className="mt-auto pt-8 text-center text-[15px]" style={{ color: "#667781" }}>
        Já tens conta?{" "}
        <Link href={`/login${window.location.search}`} className="font-semibold" style={{ color: "#25D366" }}>
          Entrar
        </Link>
      </p>
    </div>
  );
}
