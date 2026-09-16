/**
 * ChooseHandle — onboarding step. Premium, safe-area-aware.
 */
import { useState, useEffect, useRef } from "react";
import { useLocation, Redirect } from "wouter";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { checkHandleAvailability, setUserHandle } from "@/lib/api";
import { readBusinessOnboarding } from "@/lib/businessOnboarding";
import { AuthBrand } from "@/components/auth/AuthBrand";

const G = "#635BFF";
const INK = "#0A2540";
const SOFT = "#425466";
const FAINT = "#8898AA";
const SUBTLE = "#F1F5F9";
const BORDER = "#E6EBF1";

const HANDLE_RE = /^[a-z0-9-]{3,30}$/;
type CheckState = "idle" | "checking" | "available" | "taken" | "invalid";

export function ChooseHandle() {
  const [, nav] = useLocation();
  const { user, token, setHandle, isLoggedIn } = useAuth();

  const [raw, setRaw]          = useState("");
  const [checkState, setCheck] = useState<CheckState>("idle");
  const [saving, setSaving]    = useState(false);
  const [error, setError]      = useState("");
  const debounceRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!isLoggedIn) return <Redirect to="/login?next=/escolher-handle" />;
  if (user?.handle)  return <Redirect to={`/e/${user.handle}/dono`} />;

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
        if (reason) setError(reason); else setError("");
      } catch { setCheck("idle"); }
    }, 400);
  }, [handle]);

  async function handleSubmit() {
    if (checkState !== "available" || !token) return;
    setSaving(true); setError("");
    try {
      const hasPendingOnboarding = !!readBusinessOnboarding();
      const { user: updated } = await setUserHandle(handle, token);
      setHandle(updated.handle ?? handle);
      nav(hasPendingOnboarding ? `/e/${handle}/dono?onboarding=1` : `/e/${handle}/dono`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao guardar");
    } finally { setSaving(false); }
  }

  const borderColor =
    checkState === "available" ? G :
    checkState === "taken"     ? "#EF4444" :
    checkState === "invalid"   ? "#F59E0B" : BORDER;

  const statusColor =
    checkState === "available" ? G :
    checkState === "taken"     ? "#EF4444" :
    checkState === "invalid"   ? "#F59E0B" : FAINT;

  const statusLabel =
    checkState === "available" ? "✓ Disponível" :
    checkState === "taken"     ? "Já está a ser usado" :
    checkState === "invalid"   ? "3–30 letras, números ou hífens" :
    checkState === "checking"  ? "A verificar…" : "";

  return (
    <div
      className="auth-clean-page flex flex-col h-full overflow-y-auto"
      style={{
        background: "#FFFFFF",
        minHeight: "100dvh",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="auth-onboarding-shell flex flex-col flex-1" style={{ padding: "24px 20px 20px" }}>
        <AuthBrand />

        {/* Icon + heading */}
        <div className="auth-content text-center mb-10">
          <h1 style={{ color: INK, fontSize: 24, fontWeight: 700, letterSpacing: "-0.3px" }}>
            Escolhe o teu link
          </h1>
          <p style={{ color: SOFT, fontSize: 15, marginTop: 8, lineHeight: 1.55 }}>
            O teu espaço pessoal no Linkealls. Podes alterar a qualquer momento.
          </p>
        </div>

        {/* Preview URL */}
        <div
          className="auth-handle-preview rounded-xl mb-5"
          style={{ background: SUBTLE, border: `1px solid ${BORDER}`, padding: "12px 14px" }}
        >
            <span style={{ color: FAINT, fontSize: 14 }}>linkealls.com/</span>
          <span style={{ fontWeight: 700, color: handle ? G : FAINT, fontSize: 14 }}>
            {handle || "o-teu-nome"}
          </span>
        </div>

        {/* Input */}
        <div
          className="auth-input-wrap flex items-center gap-2 rounded-xl mb-2"
          style={{
            background: SUBTLE,
            border: `2px solid ${borderColor}`,
            height: 52,
            paddingLeft: 14,
            paddingRight: 14,
            transition: "border-color 0.2s",
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 600, color: FAINT }}>@</span>
          <input
            type="text"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="o-teu-nome"
            autoFocus
            maxLength={30}
            className="flex-1 bg-transparent outline-none"
            style={{ color: INK, fontSize: 16, caretColor: G }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          {checkState === "checking"  && <Loader2 size={17} className="shrink-0 animate-spin" style={{ color: FAINT }} />}
          {checkState === "available" && <CheckCircle2 size={17} className="shrink-0" style={{ color: G }} />}
          {(checkState === "taken" || checkState === "invalid") && <XCircle size={17} className="shrink-0" style={{ color: "#EF4444" }} />}
        </div>

        {/* Status */}
        {(statusLabel || error) && (
          <p style={{ color: statusColor, fontSize: 13, marginBottom: 16, paddingLeft: 2 }}>
            {statusLabel || error}
          </p>
        )}

        {/* CTA */}
          <button
           className="auth-primary w-full font-bold transition-opacity disabled:opacity-40"
          onClick={handleSubmit}
          disabled={checkState !== "available" || saving}
          style={{
             background: G, color: "#fff",
            borderRadius: 14, height: 52, fontSize: 16,
            marginTop: 8,
          }}
        >
          {saving ? "A guardar…" : "Continuar"}
        </button>
      </div>
    </div>
  );
}
