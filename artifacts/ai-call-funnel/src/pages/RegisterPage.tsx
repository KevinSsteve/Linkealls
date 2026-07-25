/**
 * Página de registo — nome → telemóvel → criar PIN (sem SMS).
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { UserPlus, ArrowLeft, CheckCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userRegister } from "@/lib/api";

function PinDots({ value, confirmed }: { value: string; confirmed?: boolean }) {
  return (
    <div className="flex justify-center gap-4 my-5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="w-4 h-4 rounded-full transition-all duration-150"
          style={{
            background: i < value.length ? (confirmed ? "#00BFA5" : "#60A5FA") : "rgba(255,255,255,0.12)",
            boxShadow: i < value.length ? `0 0 8px ${confirmed ? "rgba(0,191,165,0.5)" : "rgba(96,165,250,0.5)"}` : "none",
            transform: i < value.length ? "scale(1.15)" : "scale(1)",
          }} />
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
          <button key={i} onPointerDown={(e) => { e.preventDefault(); onKey(k); }}
            className="h-14 rounded-2xl text-xl font-semibold flex items-center justify-center active:scale-90 transition-transform select-none"
            style={{
              background: k === "⌫" ? "rgba(255,80,80,0.1)" : "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: k === "⌫" ? "#F87171" : "#EAF0F7",
            }}>{k}</button>
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
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold"
              style={{
                background: i < current ? "#00BFA5" : i === current ? "rgba(0,191,165,0.2)" : "rgba(255,255,255,0.06)",
                border: `1.5px solid ${i <= current ? "#00BFA5" : "rgba(255,255,255,0.1)"}`,
                color: i < current ? "#050D14" : i === current ? "#00BFA5" : "#4A6B80",
              }}>{i < current ? "✓" : i + 1}</div>
            <span className="text-[10px] font-medium whitespace-nowrap"
              style={{ color: i <= current ? "#00BFA5" : "#4A6B80" }}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="flex-1 h-px mb-4"
              style={{ background: i < current ? "#00BFA5" : "rgba(255,255,255,0.08)", width: 32 }} />
          )}
        </div>
      ))}
    </div>
  );
}

type Step = "name" | "phone" | "pin" | "confirm";

function getSafeNext(): string {
  const next = new URLSearchParams(window.location.search).get("next") ?? "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
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
        nav(getSafeNext());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao criar conta");
        setConfirm(""); setPin(""); setStep("pin");
      } finally { setLoading(false); }
    }
  }

  const isPinStep = step === "pin" || step === "confirm";

  return (
    <div className="flex flex-col h-full bg-[#080E18] px-6 pt-12 pb-8 overflow-y-auto"
      style={{ minHeight: "var(--vh, 100dvh)" }}>
      <button onClick={back} className="mb-6 w-9 h-9 flex items-center justify-center rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}>
        <ArrowLeft size={18} style={{ color: "#7B96B2" }} />
      </button>

      <div className="mb-6">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)" }}>
          <UserPlus size={24} style={{ color: "#60A5FA" }} />
        </div>
        <h1 className="text-[22px] font-bold text-[#EAF0F7]">Criar conta</h1>
        <p className="text-[14px] mt-1" style={{ color: "#4A6B80" }}>
          {step === "name" && "Como te chamas?"}
          {step === "phone" && "Qual é o teu número?"}
          {step === "pin" && "Escolhe um PIN de 4 dígitos"}
          {step === "confirm" && "Confirma o teu PIN"}
        </p>
      </div>

      <Steps current={stepIndex} />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-[13px]"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#FCA5A5" }}>
          {error}
        </div>
      )}

      {step === "name" && (
        <>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ex: João Ferreira" autoFocus
            className="w-full h-14 px-4 rounded-2xl text-[16px] bg-transparent outline-none mb-4"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "#EAF0F7", caretColor: "#60A5FA" }}
            onKeyDown={(e) => e.key === "Enter" && handleNameNext()} />
          <button onClick={handleNameNext} className="w-full h-14 rounded-2xl font-bold text-[15px]"
            style={{ background: "#60A5FA", color: "#050D14" }}>Continuar</button>
        </>
      )}

      {step === "phone" && (
        <>
          <div className="flex items-center gap-3 px-4 rounded-2xl mb-4"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", height: 56 }}>
            <span className="text-[15px]">🇦🇴</span>
            <span className="text-[15px] font-semibold" style={{ color: "#7B96B2" }}>+244</span>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />
            <input type="tel" inputMode="numeric" value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ""))}
              placeholder="9XX XXX XXX" autoFocus
              className="flex-1 bg-transparent outline-none text-[16px]"
              style={{ color: "#EAF0F7", caretColor: "#60A5FA" }}
              onKeyDown={(e) => e.key === "Enter" && handlePhoneNext()} />
          </div>
          <button onClick={handlePhoneNext} className="w-full h-14 rounded-2xl font-bold text-[15px]"
            style={{ background: "#60A5FA", color: "#050D14" }}>Continuar</button>
        </>
      )}

      {isPinStep && (
        <div className="flex flex-col items-center">
          <PinDots value={step === "pin" ? pin : confirmPin} confirmed={step === "confirm"} />
          {loading
            ? <p className="text-[13px] mb-6 flex items-center gap-2" style={{ color: "#00BFA5" }}><CheckCircle size={14} /> A criar conta…</p>
            : <p className="text-[13px] mb-6 opacity-0">·</p>}
          <Keypad onKey={handlePinKey} />
        </div>
      )}

      <p className="mt-auto pt-8 text-center text-[14px]" style={{ color: "#4A6B80" }}>
        Já tens conta?{" "}
        <Link href={`/login${window.location.search}`} className="font-semibold" style={{ color: "#00BFA5" }}>
          Entrar
        </Link>
      </p>
    </div>
  );
}
