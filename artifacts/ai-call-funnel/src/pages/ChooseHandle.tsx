/**
 * ChooseHandle — onboarding step. WhatsApp Business light theme.
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

  if (!isLoggedIn) return <Redirect to="/login?next=/escolher-handle" />;
  if (user?.handle)  return <Redirect to={`/u/${user.handle}`} />;

  const handle = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

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

  const borderColor =
    checkState === "available" ? "#25D366" :
    checkState === "taken"     ? "#EF4444" :
    checkState === "invalid"   ? "#F59E0B" : "#E9EDEF";

  const statusColor =
    checkState === "available" ? "#128C7E" :
    checkState === "taken"     ? "#EF4444" :
    checkState === "invalid"   ? "#F59E0B" : "#8696A0";

  const statusLabel =
    checkState === "available" ? "✓ Disponível" :
    checkState === "taken"     ? "Já está a ser usado" :
    checkState === "invalid"   ? "3-30 letras, números ou hífens" :
    checkState === "checking"  ? "A verificar…" : "";

  return (
    <div
      className="flex flex-col h-full px-6 pt-12 pb-8 overflow-y-auto"
      style={{ background: "#FFFFFF", minHeight: "var(--vh, 100dvh)" }}
    >
      {/* Icon + heading */}
      <div className="mb-10 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "#D9FDD3" }}
        >
          <AtSign size={28} style={{ color: "#128C7E" }} strokeWidth={2.5} />
        </div>
        <h1 className="text-[24px] font-bold" style={{ color: "#111B21" }}>Escolhe o teu link</h1>
        <p className="text-[15px] mt-2 leading-relaxed" style={{ color: "#667781" }}>
          O teu espaço pessoal no Linkealls. Podes alterar a qualquer momento.
        </p>
      </div>

      {/* Preview */}
      <div
        className="rounded-xl px-4 py-3 mb-6 text-[14px]"
        style={{ background: "#F0F2F5" }}
      >
        <span style={{ color: "#8696A0" }}>linkealls.com/u/</span>
        <span className="font-bold" style={{ color: handle ? "#128C7E" : "#8696A0" }}>
          {handle || "o-teu-nome"}
        </span>
      </div>

      {/* Input */}
      <div
        className="flex items-center gap-2 rounded-xl px-4 mb-2"
        style={{
          background: "#F0F2F5",
          border: `2px solid ${borderColor}`,
          height: 56,
          transition: "border-color 0.2s",
        }}
      >
        <span className="text-[16px] font-semibold shrink-0" style={{ color: "#8696A0" }}>@</span>
        <input
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="o-teu-nome"
          autoFocus
          maxLength={30}
          className="flex-1 bg-transparent outline-none text-[16px]"
          style={{ color: "#111B21", caretColor: "#25D366" }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        {checkState === "checking"  && <Loader2 size={18} className="shrink-0 animate-spin" style={{ color: "#8696A0" }} />}
        {checkState === "available" && <CheckCircle2 size={18} className="shrink-0" style={{ color: "#25D366" }} />}
        {(checkState === "taken" || checkState === "invalid") && <XCircle size={18} className="shrink-0" style={{ color: "#EF4444" }} />}
      </div>

      {/* Status / error */}
      {(statusLabel || error) && (
        <p className="text-[13px] mb-4 px-1" style={{ color: statusColor }}>
          {statusLabel || error}
        </p>
      )}

      {/* CTA */}
      <button
        onClick={handleSubmit}
        disabled={checkState !== "available" || saving}
        className="w-full h-[54px] rounded-full font-bold text-[16px] mt-4 transition-opacity"
        style={{
          background: "#25D366",
          color: "#FFFFFF",
          opacity: checkState === "available" && !saving ? 1 : 0.4,
          cursor: checkState === "available" && !saving ? "pointer" : "not-allowed",
        }}
      >
        {saving ? "A guardar…" : "Continuar"}
      </button>
    </div>
  );
}
