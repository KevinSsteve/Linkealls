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

  // All hooks precede authentication redirects. The result belongs to one exact
  // input, so an older request cannot enable Continue for a different handle.
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
          reason: err instanceof Error ? err.message : "Não foi possível verificar o link.",
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
        setError("A tua sessão expirou. Entra novamente para guardar este link.");
      } else if (err instanceof AuthApiError && (err.status === 409 || err.status === 400)) {
        setCheck({ handle: target, state: "taken", reason: err.message });
        setError(err.message);
      } else {
        // A lost response does not prove the write failed. Recover a completed
        // claim before offering a retry; never automatically repeat the PUT.
        try {
          const result = await getCurrentUser();
          if (result.user.handle === target) { finish(result.user); return; }
        } catch { /* Keep the original actionable error. */ }
        setError(err instanceof Error ? err.message : "Não foi possível guardar. Tenta novamente.");
      }
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  if (isLoading) return (
    <main className="auth-clean-page flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-[#FBFAFF] px-6">
      <AuthBrand />
      <p role="status" className="flex items-center gap-3 text-[#344558]"><Loader2 className="animate-spin" size={22} /> A abrir o teu espaço…</p>
    </main>
  );
  if (!isLoggedIn) return <Redirect to={`/login?next=${encodeURIComponent(`/escolher-handle${handle ? `?nome=${handle}` : ""}`)}`} />;
  if (user?.handle) return <Redirect to={ownerPath(user.handle)} />;

  const unavailable = checkState === "taken" || checkState === "invalid";
  const status = checkState === "available" ? "Este link está disponível."
    : checkState === "checking" ? "A verificar disponibilidade…"
    : checkState === "invalid" ? "Usa entre 3 e 30 letras, números ou hífens."
    : checkState === "taken" ? check.reason || "Este link já está ocupado. Experimenta outro nome."
    : checkState === "error" ? check.reason || "Não foi possível verificar o link." : "";

  return (
    <main className="auth-clean-page flex min-h-[100dvh] flex-col items-center bg-[#FBFAFF] text-[#0A2540]" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="auth-onboarding-shell flex w-full max-w-[560px] flex-1 flex-col px-5 py-6 sm:px-10 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <AuthBrand />
          <span className="shrink-0 text-xs font-bold tracking-[0.12em] text-[#635BFF]">2 DE 2</span>
        </header>
        <Link href="/configurar-negocio" aria-disabled={saving} onClick={(event) => { if (saving) event.preventDefault(); }} className="mt-8 inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-[#5B6E82]">
          <ArrowLeft size={17} /> Voltar
        </Link>
        <section className="pb-8 pt-5 sm:pt-8">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.13em] text-[#635BFF]">O teu endereço</p>
          <h1 className="text-[clamp(30px,7vw,40px)] font-extrabold leading-[1.12] tracking-[-0.045em]">Um link só teu.</h1>
          <p className="mt-4 text-base leading-relaxed text-[#344558]">Escolhe um nome curto para os clientes encontrarem o teu negócio.</p>
          <form className="mt-7" aria-busy={saving} onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
            <label htmlFor="business-handle" className="mb-2 block text-sm font-semibold">Nome do teu link</label>
            <div className={`auth-input-wrap flex min-h-14 items-center gap-2 rounded-2xl border bg-white px-4 focus-within:ring-2 focus-within:ring-[#635BFF]/20 ${unavailable ? "border-[#C44235]" : "border-[#DDE2EC]"}`}>
              <span aria-hidden="true" className="text-lg text-[#5B6E82]">@</span>
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
                className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none"
                aria-invalid={unavailable}
                aria-describedby="handle-help handle-status"
              />
              {checkState === "checking" && <Loader2 size={19} aria-hidden="true" className="shrink-0 animate-spin text-[#635BFF]" />}
              {checkState === "available" && <CheckCircle2 size={19} aria-hidden="true" className="shrink-0 text-[#07885A]" />}
            </div>
            <p id="handle-help" className="mt-2 text-xs leading-5 text-[#5B6E82]">Sem espaços. Podes usar letras, números e hífens.</p>
            <p id="handle-status" role="status" className={`mt-3 min-h-6 text-sm ${unavailable || checkState === "error" ? "text-[#B34235]" : "text-[#07885A]"}`}>{error ? "" : status}</p>
            {checkState === "error" && <button type="button" onClick={() => setRetry((value) => value + 1)} className="mb-3 min-h-11 rounded-xl border border-[#DDE2EC] px-4 text-sm font-semibold">Verificar novamente</button>}
            <div className="mt-3 rounded-2xl border border-[#E6E2FA] bg-[#F0EDFC] px-4 py-4">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#5B6E82]">Assim vais partilhar o teu negócio</p>
              <p className="break-all text-sm leading-6"><span className="text-[#5B6E82]">linkealls.com/</span><span className="font-bold text-[#635BFF]">{handle || "nome-do-negocio"}</span></p>
            </div>
            {error && <div role="alert" data-testid="handle-error" className="mt-4 flex items-start gap-2 rounded-xl border border-[#F4C6BC] bg-[#FFF0EB] p-4 text-sm leading-5 text-[#B34235]"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}
            {expired ? (
              <Link href={`/login?next=${encodeURIComponent(`/escolher-handle?nome=${handle}`)}`} className="mt-5 flex min-h-14 items-center justify-center rounded-2xl bg-[#635BFF] px-5 font-bold text-white">Entrar novamente</Link>
            ) : (
              <button data-testid="button-handle-continue" type="submit" disabled={checkState !== "available" || saving} className="mt-6 flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-[#635BFF] px-5 font-bold text-white transition-colors hover:bg-[#554BEA] disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <><span role="status">A guardar o teu link…</span><Loader2 size={21} className="animate-spin" /></> : <><span>Continuar</span><ArrowRight size={20} /></>}
              </button>
            )}
            <p className="mt-4 text-center text-xs leading-5 text-[#5B6E82]">O nome da loja e os restantes detalhes são editáveis no teu perfil.</p>
          </form>
        </section>
      </div>
    </main>
  );
}