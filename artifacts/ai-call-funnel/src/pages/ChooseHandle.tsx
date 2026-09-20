import { useState, useEffect, useRef } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AuthApiError, checkHandleAvailability, getCurrentUser, setUserHandle } from "@/lib/api";
import { readBusinessOnboarding } from "@/lib/businessOnboarding";
import { AuthBrand } from "@/components/auth/AuthBrand";

const HANDLE_RE = /^[a-z0-9-]{3,30}$/;
type CheckState = "idle" | "checking" | "available" | "taken" | "invalid" | "error";
type Availability = { handle: string; state: CheckState; reason?: string };

export function ChooseHandle() {
  const [, nav] = useLocation();
  const { user, login, isLoggedIn, isLoading } = useAuth();
  const [raw, setRaw] = useState(() => new URLSearchParams(window.location.search).get("nome") ?? "");
  const [check, setCheck] = useState<Availability>({ handle: "", state: "idle" });
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const submitting = useRef(false);

  const handle = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  const checkState: CheckState = check.handle === handle ? check.state : handle ? "checking" : "idle";
  const ownerPath = (slug: string) => `/e/${slug}/dono${readBusinessOnboarding(user?.id) ? "?onboarding=1" : ""}`;

  useEffect(() => {
    if (!isLoggedIn || user?.handle) return;
    let current = true;
    setError("");
    if (!handle) { setCheck({ handle, state: "idle" }); return; }
    if (!HANDLE_RE.test(handle)) { setCheck({ handle, state: "invalid" }); return; }
    setCheck({ handle, state: "checking" });
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkHandleAvailability(handle);
        if (current) setCheck({ handle, state: result.available ? "available" : "taken", reason: result.reason });
      } catch (err) {
        if (current) setCheck({
          handle, state: "error",
          reason: err instanceof Error ? err.message : "Erro ao verificar.",
        });
      }
    }, 400);
    return () => { current = false; window.clearTimeout(timer); };
  }, [handle, retry, isLoggedIn, user?.handle]);

  async function handleSubmit() {
    if (submitting.current || expired || checkState !== "available" || !HANDLE_RE.test(handle)) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    const target = handle;
    function finish(updated: NonNullable<typeof user>) {
      const destination = ownerPath(updated.handle ?? target);
      login(updated);
      nav(destination, { replace: true });
    }
    try {
      const { user: updated } = await setUserHandle(target);
      finish(updated);
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 401) {
        setExpired(true);
        setError("Sessão expirada. Entra novamente.");
      } else if (err instanceof AuthApiError && (err.status === 409 || err.status === 400)) {
        setCheck({ handle: target, state: "taken", reason: err.message });
        setError(err.message);
      } else {
        try {
          const result = await getCurrentUser();
          if (result.user.handle === target) { finish(result.user); return; }
        } catch {}
        setError(err instanceof Error ? err.message : "Erro ao guardar.");
      }
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  if (isLoading) return (
    <main className="page-scroll-container min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-[var(--bg)] text-[var(--ink)] font-sans">
      <AuthBrand />
      <p role="status" className="flex items-center gap-3 text-[var(--ink-soft)] font-medium text-[16px]">
        <Loader2 className="animate-spin" size={22} /> A abrir o teu espaço…
      </p>
    </main>
  );

  if (!isLoggedIn) return <Redirect to={`/login?next=${encodeURIComponent(`/escolher-handle${handle ? `?nome=${handle}` : ""}`)}`} />;
  if (user?.handle) return <Redirect to={ownerPath(user.handle)} />;

  const unavailable = checkState === "taken" || checkState === "invalid";
  const status = checkState === "available" ? "Disponível!"
    : checkState === "checking" ? "A verificar..."
    : checkState === "invalid" ? "Usa 3-30 letras, números ou hífens."
    : checkState === "taken" ? check.reason || "Já ocupado. Tenta outro."
    : checkState === "error" ? check.reason || "Erro ao verificar." : "";

  return (
    <main className="page-scroll-container min-h-[100dvh] bg-[var(--bg)] text-[var(--ink)] flex flex-col items-center p-6 sm:p-12 font-sans" style={{ paddingTop: "max(32px, env(safe-area-inset-top, 32px))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="w-full max-w-[500px] flex flex-col">
        <header className="mb-10 flex items-center justify-between">
          <AuthBrand />
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#635BFF]">
            2 de 2
          </span>
        </header>

        <Link href="/configurar-negocio" aria-disabled={saving} onClick={(event) => { if (saving) event.preventDefault(); }} className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--border-soft)] text-[var(--ink)] transition-transform hover:scale-105">
          <ArrowLeft size={20} strokeWidth={2.5} />
        </Link>

        <div className="pb-12">
          <h1 className="text-[clamp(40px,9vw,48px)] font-bold leading-[1.05] tracking-tight mb-4" style={{ fontFamily: "var(--font-display)" }}>
            O teu link.
          </h1>
          <p className="text-[17px] text-[var(--ink-soft)] font-medium leading-relaxed mb-10">
            Escolhe como queres ser encontrado pelos teus clientes.
          </p>

          <form aria-busy={saving} onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
            <div className={`flex min-h-[72px] items-center gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--surface)] px-6 shadow-sm transition-colors focus-within:border-[#635bff] focus-within:ring-2 focus-within:ring-[#635bff]/20 ${unavailable ? "!border-[#b34235]" : ""}`}>
              <span aria-hidden="true" className="text-[20px] font-bold text-[var(--ink-faint)]">@</span>
              <input
                id="business-handle"
                data-testid="input-business-handle"
                type="text"
                value={raw}
                onChange={(event) => { setRaw(event.target.value); setError(""); }}
                placeholder="nome-do-negocio"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                maxLength={30}
                disabled={saving || expired}
                className="min-w-0 flex-1 bg-transparent py-4 text-[20px] font-bold text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] placeholder:font-medium"
                aria-invalid={unavailable}
                aria-describedby="handle-help handle-status"
              />
              {checkState === "checking" && <Loader2 size={24} className="shrink-0 animate-spin text-[#635BFF]" />}
              {checkState === "available" && <CheckCircle2 size={24} className="shrink-0 text-[#246a59]" />}
            </div>

            <p id="handle-help" className="sr-only">Sem espaços. Podes usar letras, números e hífens.</p>
            <p id="handle-status" role="status" className={`mt-4 min-h-[24px] text-[15px] font-bold ${unavailable || checkState === "error" ? "text-[#b34235]" : "text-[#246a59]"}`}>
              {error ? "" : status}
            </p>

            {checkState === "error" && (
              <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 text-[15px] font-bold text-[#635bff] underline underline-offset-4 hover:text-[#5046e5]">
                Tentar novamente
              </button>
            )}

            <div className="mt-10 rounded-[24px] border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-sm">
              <p className="mb-3 text-[13px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">Assim partilhas o teu negócio</p>
              <p className="break-all text-[17px] font-medium"><span className="text-[var(--ink-soft)]">linkealls.com/</span><span className="font-bold text-[#635BFF]">{handle || "nome"}</span></p>
            </div>

            {error && (
              <div role="alert" data-testid="handle-error" className="mt-8 flex items-start gap-3 rounded-2xl bg-[#fff0eb] border border-[#f4c6bc] p-5 text-[15px] font-medium leading-snug text-[#b34235]">
                <AlertCircle size={20} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {expired ? (
              <Link href={`/login?next=${encodeURIComponent(`/escolher-handle?nome=${handle}`)}`} className="mt-10 flex h-[64px] items-center justify-center rounded-2xl bg-[#635bff] text-white text-[17px] font-bold shadow-[0_8px_20px_rgba(99,91,255,0.18)]">
                Entrar novamente
              </Link>
            ) : (
              <button data-testid="button-handle-continue" type="submit" disabled={checkState !== "available" || saving} className="mt-10 flex h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-[#635bff] text-white text-[17px] font-bold transition-transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_20px_rgba(99,91,255,0.18)]">
                {saving ? (
                  <>
                    <span>A guardar...</span>
                    <Loader2 size={22} className="animate-spin" />
                  </>
                ) : (
                  <>
                    <span>Concluir Configuração</span>
                    <ArrowRight size={20} strokeWidth={2.5} />
                  </>
                )}
              </button>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
