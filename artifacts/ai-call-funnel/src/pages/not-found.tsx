import { Link } from "wouter";
import { ArrowRight, Search, Store } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-[#F6F9FC] px-6 text-center text-[#0A2540]">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[24px] border bg-white shadow-sm" style={{ borderColor: "#E6EBF1" }}>
        <Search size={32} className="text-[#635BFF]" />
      </div>
      <h1 className="mb-3 text-[32px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
        Página não encontrada
      </h1>
      <p className="mb-8 max-w-[420px] text-[16px] leading-relaxed text-[#425466]">
        Não conseguimos encontrar a página que procuras. Se procuravas o catálogo de um negócio, verifica se o link está correto.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#635BFF] px-8 text-[15px] font-bold text-white transition-transform hover:-translate-y-0.5 active:scale-95"
          style={{ boxShadow: "0 8px 16px rgba(99,91,255,0.2)" }}
        >
          Ir para a página inicial <ArrowRight size={17} strokeWidth={2.3} />
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border bg-white px-8 text-[15px] font-bold text-[#0A2540] transition-colors hover:bg-[#F1F5F9] active:scale-95"
          style={{ borderColor: "#E6EBF1" }}
        >
          <Store size={17} strokeWidth={2} className="text-[#425466]" /> Entrar no meu negócio
        </Link>
      </div>
    </div>
  );
}
