import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";

function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function ReplitEntryPage({ mode }: { mode: "login" | "register" }) {
  const [, nav] = useLocation();
  const { isLoading, isLoggedIn, needsLink, loginWithReplit } = useAuth();
  const next = safeNext();

  useEffect(() => {
    if (!isLoading && needsLink) nav(`/ligar-conta?next=${encodeURIComponent(next)}`);
    else if (!isLoading && isLoggedIn) nav(next);
  }, [isLoading, needsLink, isLoggedIn, nav, next]);

  return (
    <main className="min-h-[100dvh] bg-[#FBFAFF] px-5 py-6 text-[#0A2540] sm:px-10 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100dvh-48px)] w-full max-w-[1060px] flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_24px_80px_rgba(45,23,109,0.12)] md:grid md:grid-cols-[0.86fr_1.14fr]">
        <aside className="relative hidden overflow-hidden bg-[#F1EDFF] p-10 md:flex md:flex-col lg:p-14">
          <div className="flex items-center gap-3 text-[20px] font-extrabold tracking-[-0.05em]">
            <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#635BFF] text-white">↗</span>
            linkealls
          </div>
          <div className="relative z-10 mt-auto max-w-[390px]">
            <p className="mb-5 text-[12px] font-bold uppercase tracking-[0.17em] text-[#635BFF]">A tua presença, ligada</p>
            <h1 className="text-[clamp(42px,4.8vw,66px)] font-extrabold leading-[0.95] tracking-[-0.065em] text-[#2D176D]">
              Conversas que viram negócio.
            </h1>
            <p className="mt-6 text-[15px] leading-6 text-[#425466]">
              Usa uma só identidade segura para cuidar do teu espaço, clientes e catálogo.
            </p>
          </div>
          <div className="absolute -right-20 top-24 h-64 w-64 rounded-full border-[34px] border-[#635BFF]/[0.14]" />
          <div className="absolute -bottom-24 -left-14 h-72 w-72 rounded-full bg-[#9B8CFF]/[0.18]" />
        </aside>

        <section className="flex flex-col justify-center px-6 py-12 sm:px-14 lg:px-20">
          <div className="mb-12 md:hidden">
            <div className="flex items-center gap-3 text-[20px] font-extrabold tracking-[-0.05em]">
              <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#635BFF] text-white">↗</span>
              linkealls
            </div>
          </div>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#635BFF]">
            {mode === "login" ? "Entrar no Linkealls" : "Criar o teu espaço"}
          </p>
          <h2 className="mt-4 max-w-[520px] text-[clamp(38px,6vw,60px)] font-extrabold leading-[0.96] tracking-[-0.065em]">
            {mode === "login" ? "Bom ter-te de volta." : "O teu negócio merece um lugar próprio."}
          </h2>
          <p className="mt-5 max-w-[450px] text-[16px] leading-6 text-[#425466]">
            {mode === "login"
              ? "Entra com a tua identidade Replit para continuares a cuidar das tuas conversas e clientes."
              : "Cria uma identidade segura e começa a organizar o teu negócio num só link."}
          </p>

          <button
            type="button"
            onClick={() => loginWithReplit(next)}
            className="mt-9 flex min-h-[62px] w-full max-w-[460px] items-center justify-between rounded-[18px] bg-[#635BFF] px-5 font-bold text-white shadow-[0_12px_24px_rgba(99,91,255,0.22)] transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
          >
            <span>{mode === "login" ? "Entrar com Replit" : "Começar com Replit"}</span>
            <ArrowRight size={19} strokeWidth={2.3} />
          </button>

          <div className="mt-5 flex max-w-[460px] items-start gap-2 text-[12px] leading-5 text-[#8898AA]">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#635BFF]" />
            A autenticação e a recuperação de acesso são tratadas pela identidade Replit.
          </div>

          <Link
            href={`/ligar-conta?next=${encodeURIComponent(next)}`}
            className="mt-9 inline-flex max-w-fit items-center gap-2 text-[13px] font-bold text-[#425466] underline decoration-[#C7C3FF] decoration-2 underline-offset-4"
          >
            <KeyRound size={15} />
            Já tenho uma conta Linkealls com PIN
          </Link>
          <p className="mt-10 border-t border-[#E6EBF1] pt-5 text-[14px] text-[#425466]">
            {mode === "login" ? "Ainda não tens espaço? " : "Já tens uma conta? "}
            <Link href={mode === "login" ? "/registar" : "/login"} className="font-bold text-[#635BFF]">
              {mode === "login" ? "Criar presença" : "Entrar"}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}