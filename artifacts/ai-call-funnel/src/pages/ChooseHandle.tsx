/**
 * ChooseHandle — onboarding step to pick a personal URL handle.
 * Shown after register/login when the user has no handle yet.
 * Accessible only while authenticated.
 */
import { useState, useEffect, useRef } from "react";
import { useLocation, Redirect } from "wouter";
import { AtSign, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { checkHandleAvailability, setUserHandle } from "@/lib/api";

const HANDLE_RE = /^[a-z0-9-]{3,30}$/;

type CheckState = "idle" | "checking" | "available" | "taken" | "invalid";

export function ChooseHandle() {
  const [, nav]                = useLocation();
  const { user, token, setHandle, isLoggedIn } = useAuth();

  const [raw, setRaw]          = useState("");
  const [checkState, setCheck] = useState<CheckState>("idle");
  const [saving, setSaving]    = useState(false);
  const [error, setError]      = useState("");
  const debounceRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If not logged in → login; if already has handle → profile
  if (!isLoggedIn) return <Redirect to="/login?next=/escolher-handle" />;
  if (user?.handle)  return <Redirect to={`/u/${user.handle}`} />;

  const handle = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

  // Debounced availability check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!handle) { setCheck("idle"); return; }
    if (!HANDLE_RE.test(handle)) { setCheck("invalid"); return; }

    setCheck("checking");
    debounceRef.current = setTimeout(async () => {
      try {
        const { available, reason } = await checkHandleAvailability(handle);
        setCheck(available ? "available" : "taken");
        if (reason) setError(reason);
        else setError("");
      } catch {
        setCheck("idle");
      }
    }, 400);
  }, [handle]);

  async function handleSubmit() {
    if (checkState !== "available" || !token) return;
    setSaving(true); setError("");
    try {
      const { user: updated } = await setUserHandle(handle, token);
      setHandle(updated.handle ?? handle);
      nav(`/u/${handle}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  }

  const statusColor =
    checkState === "available" ? "#4ADE80" :
    checkState === "taken"     ? "#F87171" :
    checkState === "invalid"   ? "#FBBF24" : "#4A6B80";

  const statusLabel =
    checkState === "available" ? "Disponível ✓" :
    checkState === "taken"     ? "Já está a ser usado" :
    checkState === "invalid"   ? "3-30 letras, números ou hífens" :
    checkState === "checking"  ? "A verificar…" : "";

  return (
    <div
      className="flex flex-col h-full bg-[#080E18] px-6 pt-12 pb-8 overflow-y-auto"
      style={{ minHeight: "var(--vh, 100dvh)" }}
    >
      {/* Icon + heading */}
      <div className="mb-10">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "rgba(0,168,132,0.12)", border: "1px solid rgba(0,168,132,0.25)" }}
        >
          <AtSign size={26} style={{ color: "#00A884" }} />
        </div>
        <h1 className="text-[22px] font-bold text-[#EAF0F7]">Escolhe o teu link</h1>
        <p className="text-[14px] mt-1.5 leading-relaxed" style={{ color: "#4A6B80" }}>
          O teu espaço pessoal no Linkealls. Podes alterar a qualquer momento.
        </p>
      </div>

      {/* Preview */}
      <div
        className="rounded-xl px-4 py-3 mb-6 text-[13px]"
        style={{ background: "rgba(0,168,132,0.07)", border: "1px solid rgba(0,168,132,0.15)" }}
      >
        <span style={{ color: "#4A6B80" }}>app.linkealls.com/u/</span>
        <span className="font-semibold" style={{ color: handle ? "#00A884" : "#3E576F" }}>
          {handle || "o-teu-nome"}
        </span>
      </div>

      {/* Input */}
      <div
        className="flex items-center gap-2 rounded-2xl px-4 mb-2"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: `1.5px solid ${checkState === "available" ? "#4ADE8040" : checkState === "taken" ? "#F8717140" : "rgba(255,255,255,0.10)"}`,
          height: 56,
          transition: "border-color 0.2s",
        }}
      >
        <span className="text-[15px] font-semibold shrink-0" style={{ color: "#4A6B80" }}>@</span>
        <input
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="o-teu-nome"
          autoFocus
          maxLength={30}
          className="flex-1 bg-transparent outline-none text-[16px]"
          style={{ color: "#EAF0F7", caretColor: "#00A884" }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        {checkState === "checking" && <Loader2 size={16} className="shrink-0 animate-spin" style={{ color: "#4A6B80" }} />}
        {checkState === "available" && <CheckCircle2 size={16} className="shrink-0" style={{ color: "#4ADE80" }} />}
        {(checkState === "taken" || checkState === "invalid") && <XCircle size={16} className="shrink-0" style={{ color: "#F87171" }} />}
      </div>

      {/* Status / error */}
      {statusLabel && (
        <p className="text-[12px] mb-4 px-1" style={{ color: statusColor }}>{statusLabel}</p>
      )}
      {error && !statusLabel && (
        <p className="text-[12px] mb-4 px-1" style={{ color: "#F87171" }}>{error}</p>
      )}

      {/* CTA */}
      <button
        onClick={handleSubmit}
        disabled={checkState !== "available" || saving}
        className="w-full h-14 rounded-2xl font-bold text-[15px] mt-4 transition-opacity"
        style={{
          background: "#00A884",
          color: "#050D14",
          opacity: checkState === "available" && !saving ? 1 : 0.4,
          cursor: checkState === "available" && !saving ? "pointer" : "not-allowed",
        }}
      >
        {saving ? "A guardar…" : "Continuar"}
      </button>

      {/* Skip */}
      <button
        onClick={() => nav("/conversas")}
        className="mt-4 text-center text-[13px] py-2"
        style={{ color: "#3E576F" }}
      >
        Fazer mais tarde
      </button>
    </div>
  );
}
