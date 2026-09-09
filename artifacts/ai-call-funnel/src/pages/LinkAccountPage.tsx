import { useState } from "react";
import { ArrowLeft, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Link, Redirect, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { linkReplitAccount, provisionReplitAccount } from "@/lib/api";

function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/escolher-handle";
}

export function LinkAccountPage() {
  const [, nav] = useLocation();
  const { isLoading, isLoggedIn, replitUser, login } = useAuth();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<"link" | "provision" | null>(null);
  const [error, setError] = useState("");
  const next = safeNext();

  if (!isLoading && !replitUser && !isLoggedIn) {
    return <Redirect to={`/login?next=${encodeURIComponent(next)}`} />;
  }
  if (!isLoading && isLoggedIn) {
    return <Redirect to={next} />;
  }

  async function linkExisting() {
    if (phone.replace(/\D/g, "").length < 7 || !/^\d{4}$/.test(pin)) {
      setError("Indica o telefone e o PIN de quatro dígitos da conta antiga.");
      return;
    }
    setBusy("link");
    setError("");
    try {
      const response = await linkReplitAccount({ phone, pin });
      login(response.user, response.token);
      nav(next);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível ligar a conta.");
    } finally {
      setBusy(null);
    }
  }

  async function createNewSpace() {
    setBusy("provision");
    setError("");
    try {
      const response = await provisionReplitAccount();
      login(response.user, response.token);
      nav("/escolher-handle");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível criar o espaço.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#FBFAFF] px-5 py-8 text-[#0A2540] sm:px-10">
      <div className="mx-auto max-w-[520px]">
        <Link href="/login" className="inline-flex items-center gap-2 text-[13px] font-bold text-[#425466]">
          <ArrowLeft size={16} /> Voltar
        </Link>
        <div className="mt-14 flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#EEECFF] text-[#635BFF]">
          <KeyRound size={25} />
        </div>
        <p className="mt-7 text-[12px] font-bold uppercase tracking-[0.16em] text-[#635BFF]">Migração segura</p>
        <h1 className="mt-4 text-[clamp(38px,8vw,56px)] font-extrabold leading-[0.96] tracking-[-0.065em]">
          Liga o teu espaço antigo.
        </h1>
        <p className="mt-5 text-[16px] leading-6 text-[#425466]">
          Usa uma última vez o telefone e PIN do Linkealls. Depois, a tua identidade Replit passa a proteger o acesso.
        </p>

        {error && <p role="alert" className="mt-7 rounded-2xl border border-[#F4C6BC] bg-[#FFF0EB] px-4 py-3 text-[13px] leading-5 text-[#B34235]">{error}</p>}

        <div className="mt-8 rounded-[24px] border border-[#E6EBF1] bg-white p-5 shadow-[0_12px_35px_rgba(10,37,64,0.06)] sm:p-6">
          <label className="block text-[11px] font-bold uppercase tracking-[0.13em] text-[#8898AA]" htmlFor="link-phone">Telefone da conta antiga</label>
          <div className="mt-2 flex items-center gap-2 rounded-[15px] border border-[#E6EBF1] bg-[#F6F9FC] px-4 py-3">
            <span className="text-[14px] font-bold text-[#0A2540]">+244</span>
            <input id="link-phone" value={phone} onChange={(event) => setPhone(event.target.value.replace(/[^\d\s]/g, ""))} type="tel" inputMode="numeric" autoComplete="tel" placeholder="9XX XXX XXX" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
          </div>
          <label className="mt-5 block text-[11px] font-bold uppercase tracking-[0.13em] text-[#8898AA]" htmlFor="link-pin">PIN actual</label>
          <input id="link-pin" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} type="password" inputMode="numeric" autoComplete="current-password" placeholder="••••" className="mt-2 w-full rounded-[15px] border border-[#E6EBF1] bg-[#F6F9FC] px-4 py-3 text-[18px] tracking-[0.4em] outline-none focus:border-[#635BFF]" />
          <button type="button" onClick={() => void linkExisting()} disabled={busy !== null} className="mt-6 flex min-h-12 w-full items-center justify-between rounded-[15px] bg-[#635BFF] px-4 font-bold text-white disabled:opacity-50">
            <span>{busy === "link" ? "A ligar…" : "Ligar conta existente"}</span>
            {busy === "link" ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
          </button>
        </div>

        <div className="my-7 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8898AA]">
          <span className="h-px flex-1 bg-[#E6EBF1]" /> ou <span className="h-px flex-1 bg-[#E6EBF1]" />
        </div>
        <button type="button" onClick={() => void createNewSpace()} disabled={busy !== null} className="flex min-h-12 w-full items-center justify-center rounded-[15px] border border-[#D9D4FF] bg-white px-4 font-bold text-[#635BFF] disabled:opacity-50">
          {busy === "provision" ? <Loader2 size={17} className="mr-2 animate-spin" /> : null}
          Criar um espaço novo
        </button>
        <p className="mt-4 text-center text-[12px] leading-5 text-[#8898AA]">
          Escolhe esta opção apenas se ainda não tens dados de negócio no Linkealls.
        </p>
      </div>
    </main>
  );
}