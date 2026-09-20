import { ArrowLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { useEffect } from "react";

type LegalKind = "terms" | "privacy";

const content = {
  terms: {
    eyebrow: "Informação legal",
    title: "Termos de utilização",
    intro: "As regras simples para usar o Linkealls com confiança, seja para descobrir um negócio ou criar a tua presença digital.",
    sections: [
      ["1. O Linkealls", "O Linkealls ajuda pessoas a descobrir negócios em Angola, consultar catálogos, conversar com assistentes e, quando disponível, iniciar compras. Para negócios, disponibiliza um perfil público, catálogo, conversas e ferramentas de gestão."],
      ["2. Contas e segurança", "Para criar uma conta precisas de indicar um nome, um número de telemóvel e um PIN de quatro dígitos. Mantém estes dados seguros e não partilhes o PIN. És responsável pela actividade feita através da tua sessão."],
      ["3. Conteúdo do negócio", "O negócio é responsável pela exactidão dos seus dados, preços, produtos, disponibilidade, prazos e respostas. Não publiques conteúdo ilegal, enganador, ofensivo ou que viole direitos de terceiros."],
      ["4. Conversas, compras e pagamentos", "As conversas devem ser usadas de forma respeitosa. Quando uma compra estiver disponível, o preço e as condições apresentados no catálogo devem ser confirmados pelo negócio. O processamento de pagamentos pode envolver parceiros externos e fica sujeito às regras desses parceiros."],
      ["5. Uso aceitável", "Não tentes obter acesso a contas de terceiros, interferir com o serviço, enviar spam, explorar vulnerabilidades ou usar o Linkealls para actividades fraudulentas."],
      ["6. Disponibilidade", "Trabalhamos para manter o serviço disponível, mas podem existir interrupções para manutenção, actualizações ou por falhas de fornecedores. As funcionalidades podem evoluir ao longo do tempo."],
      ["7. Encerramento da conta", "Podes eliminar a tua conta na área do negócio. A eliminação é definitiva e remove o perfil, catálogo e dados associados, excepto registos que tenham de ser mantidos por razões legais, de segurança ou de reconciliação financeira."],
      ["8. Contacto", "Se encontrares um problema ou precisares de esclarecer estes termos, usa os canais de contacto indicados no próprio negócio ou no Linkealls."],
    ],
  },
  privacy: {
    eyebrow: "Informação legal",
    title: "Política de privacidade",
    intro: "Explicamos que dados usamos, para que servem e como podes controlar a tua relação com o Linkealls.",
    sections: [
      ["1. Dados que recolhemos", "Podemos recolher o nome, número de telemóvel, PIN protegido, dados do perfil do negócio, catálogo, conversas, leads, pedidos, comprovativos enviados e informação técnica necessária para manter o serviço seguro."],
      ["2. Como usamos os dados", "Usamos os dados para autenticar a tua conta, mostrar o perfil público, responder a clientes, processar pedidos, prestar suporte, melhorar o serviço e detectar fraude ou abuso."],
      ["3. Assistentes de IA", "Quando activas funcionalidades de IA, o conteúdo necessário da conversa ou do perfil pode ser processado por fornecedores de tecnologia para gerar respostas, resumos e sugestões. O Linkealls não deve ser usado para enviar dados sensíveis desnecessários."],
      ["4. Pagamentos e parceiros", "Os pagamentos são encaminhados através dos parceiros de pagamento configurados. Guardamos os dados necessários para confirmar o estado da operação e manter a reconciliação. Não guardamos o PIN do teu cartão ou do teu serviço de pagamentos."],
      ["5. Partilha de dados", "Podemos partilhar apenas os dados necessários com fornecedores que suportam autenticação, armazenamento, IA, pagamentos, notificações e segurança. Não vendemos os teus dados pessoais."],
      ["6. Dados públicos", "O nome, handle, descrição, catálogo e outros campos que escolhas publicar no perfil do negócio podem ficar visíveis para visitantes. Evita colocar informação pessoal que não queiras tornar pública."],
      ["7. Retenção e eliminação", "Guardamos os dados enquanto forem necessários para prestar o serviço. Podes eliminar a conta na área do negócio; a eliminação remove os dados operacionais associados, sem prejuízo de registos que precisem de ser conservados por obrigação legal, segurança ou reconciliação."],
      ["8. Os teus direitos", "Podes pedir esclarecimentos sobre os teus dados, corrigir informação do perfil ou eliminar a conta através das funcionalidades disponíveis no Linkealls. Para pedidos adicionais, contacta-nos pelos canais oficiais."],
    ],
  },
} satisfies Record<LegalKind, { eyebrow: string; title: string; intro: string; sections: string[][] }>;

export function LegalPage({ kind }: { kind: LegalKind }) {
  const page = content[kind];
  useEffect(() => {
    document.title = `${page.title} — Linkealls`;
    const description = document.querySelector('meta[name="description"]') ?? document.createElement("meta");
    description.setAttribute("name", "description");
    description.setAttribute("content", page.intro);
    document.head.appendChild(description);
    return () => { document.title = "Linkealls"; };
  }, [page]);

  return (
    <main className="page-scroll-container min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.04em]">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--green)] text-white">
            <ArrowUpRight size={17} strokeWidth={2.5} />
          </span>
          Linkealls
        </Link>
        <Link href="/" className="inline-flex items-center gap-2 text-[13px] font-bold text-[var(--ink-soft)]">
          <ArrowLeft size={15} /> Página inicial
        </Link>
      </header>
      <div className="mx-auto max-w-3xl px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--green)]">{page.eyebrow}</p>
        <h1 className="mt-4 text-[clamp(38px,7vw,64px)] font-extrabold leading-[0.98] tracking-[-0.065em]">{page.title}</h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-7 text-[var(--ink-soft)]">{page.intro}</p>
        <p className="mt-4 text-[12px] text-[var(--ink-faint)]">Última actualização: 9 de Setembro de 2026</p>
        <div className="mt-12 space-y-4">
          {page.sections.map(([heading, body]) => (
            <section key={heading} className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[0_12px_30px_rgba(23, 19, 31,0.04)] sm:p-7">
              <h2 className="flex items-start gap-2 text-[17px] font-bold">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--green)]" />
                {heading}
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[var(--ink-soft)]">{body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}