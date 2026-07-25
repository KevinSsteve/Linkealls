/**
 * Wraps all owner pages with a PIN lock.
 * Stores unlock state in sessionStorage — cleared when tab closes.
 */
import { useState, useEffect, useCallback } from "react";
import { Lock, KeyRound, Eye, EyeOff, ShieldCheck, Loader2 } from "lucide-react";

const SESSION_KEY = "owner_unlocked";
const API_BASE = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}api`
  : "/api";

type Mode = "checking" | "locked" | "setup" | "open";

async function fetchPinStatus(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/pin/status`);
  const { hasPin } = await res.json() as { hasPin: boolean };
  return hasPin;
}

async function verifyPin(pin: string): Promise<{ ok: boolean; noPin?: boolean }> {
  const res = await fetch(`${API_BASE}/auth/pin/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  return res.json() as Promise<{ ok: boolean; noPin?: boolean }>;
}

async function setupPin(pin: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/auth/pin/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  return res.json() as Promise<{ ok: boolean; error?: string }>;
}

// ─── PIN Input ─────────────────────────────────────────────────────────────

function PinInput({
  value,
  onChange,
  show,
  placeholder = "PIN",
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  placeholder?: string;
}) {
  return (
    <input
      type={show ? "text" : "password"}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={8}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      placeholder={placeholder}
      className="w-full rounded-2xl px-4 py-3.5 text-center text-xl font-bold tracking-[0.3em] outline-none transition-all"
      style={{
        background: "#0D1826",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "#EAF0F7",
        caretColor: "#00A884",
        letterSpacing: value ? "0.5em" : "0.1em",
      }}
    />
  );
}

// ─── Lock Screen ───────────────────────────────────────────────────────────

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (pin.length < 4) { setError("PIN deve ter pelo menos 4 dígitos"); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await verifyPin(pin);
      if (result.ok) {
        sessionStorage.setItem(SESSION_KEY, "1");
        onUnlock();
      } else {
        setError("PIN incorreto. Tenta de novo.");
        setPin("");
      }
    } catch {
      setError("Erro de ligação. Tenta de novo.");
    } finally {
      setLoading(false);
    }
  }, [pin, onUnlock]);

  return (
    <div
      className="flex flex-col items-center justify-center h-full px-8 gap-6"
      style={{ background: "linear-gradient(180deg, #060C14 0%, #071A11 60%, #060C14 100%)" }}
    >
      {/* Icon */}
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #00A88420 0%, #00A88408 100%)", border: "1px solid #00A88430" }}
      >
        <Lock size={32} className="text-[#00A884]" />
      </div>

      <div className="text-center space-y-1">
        <p className="text-lg font-bold text-[#EAF0F7]">Área protegida</p>
        <p className="text-sm text-[#3E576F]">Introduz o teu PIN para continuar</p>
      </div>

      <div className="w-full space-y-3">
        <div className="relative">
          <PinInput value={pin} onChange={setPin} show={show} placeholder="••••" />
          <button
            onClick={() => setShow(!show)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3E576F]"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && (
          <p className="text-center text-xs text-red-400">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || pin.length < 4}
          className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: "#00A884", color: "#050D14" }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
          {loading ? "A verificar…" : "Entrar"}
        </button>
      </div>
    </div>
  );
}

// ─── Setup Screen ──────────────────────────────────────────────────────────

function SetupScreen({ onSetup }: { onSetup: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetup = useCallback(async () => {
    if (pin.length < 4) { setError("PIN deve ter pelo menos 4 dígitos"); return; }
    if (pin !== confirm) { setError("Os PINs não coincidem"); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await setupPin(pin);
      if (result.ok) {
        sessionStorage.setItem(SESSION_KEY, "1");
        onSetup();
      } else {
        setError(result.error ?? "Erro ao guardar PIN");
      }
    } catch {
      setError("Erro de ligação. Tenta de novo.");
    } finally {
      setLoading(false);
    }
  }, [pin, confirm, onSetup]);

  return (
    <div
      className="flex flex-col items-center justify-center h-full px-8 gap-6"
      style={{ background: "linear-gradient(180deg, #060C14 0%, #071A11 60%, #060C14 100%)" }}
    >
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #00A88420 0%, #00A88408 100%)", border: "1px solid #00A88430" }}
      >
        <ShieldCheck size={32} className="text-[#00A884]" />
      </div>

      <div className="text-center space-y-1">
        <p className="text-lg font-bold text-[#EAF0F7]">Cria o teu PIN</p>
        <p className="text-sm text-[#3E576F]">Protege o acesso à tua área de gestão</p>
      </div>

      <div className="w-full space-y-3">
        <div className="relative">
          <PinInput value={pin} onChange={setPin} show={show} placeholder="Novo PIN (mín. 4 dígitos)" />
          <button
            onClick={() => setShow(!show)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3E576F]"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <PinInput value={confirm} onChange={setConfirm} show={show} placeholder="Confirmar PIN" />

        {error && <p className="text-center text-xs text-red-400">{error}</p>}

        <button
          onClick={handleSetup}
          disabled={loading || pin.length < 4 || confirm.length < 4}
          className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: "#00A884", color: "#050D14" }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {loading ? "A guardar…" : "Activar PIN"}
        </button>

        <button
          onClick={() => {
            sessionStorage.setItem(SESSION_KEY, "1");
            onSetup();
          }}
          className="w-full py-2 text-xs text-[#3E576F] hover:text-[#7B96B2] transition-colors"
        >
          Ignorar por agora
        </button>
      </div>
    </div>
  );
}

// ─── Gate ──────────────────────────────────────────────────────────────────

export function OwnerGate({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("checking");

  useEffect(() => {
    // Already unlocked this session?
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      setMode("open");
      return;
    }
    fetchPinStatus()
      .then((hasPin) => setMode(hasPin ? "locked" : "setup"))
      .catch(() => setMode("open")); // On error, allow access
  }, []);

  if (mode === "checking") {
    return (
      <div className="flex items-center justify-center h-full bg-[#080E18]">
        <Loader2 size={20} className="animate-spin text-[#3E576F]" />
      </div>
    );
  }

  if (mode === "locked") {
    return <LockScreen onUnlock={() => setMode("open")} />;
  }

  if (mode === "setup") {
    return <SetupScreen onSetup={() => setMode("open")} />;
  }

  return <>{children}</>;
}
