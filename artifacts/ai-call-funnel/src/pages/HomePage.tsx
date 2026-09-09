/**
 * Linkealls — visitor landing page and Angola-first business discovery.
 * The directory below is intentionally powered by the public businesses API:
 * the homepage never invents listings for visitors.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Bot, Building2, Check, ChevronRight, MapPin, MessageCircle, RefreshCw, Search, Sparkles, Store } from "lucide-react";
import { Link, Redirect } from "wouter";
import { useAuth } from "@/context/AuthContext";

interface Business {
  id: number;
  slug: string;
  name: string;
  sector: string;
  description: string;
}

const API_BASE = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}api`
  : "/api";

const PALETTES = [
  { bg: "#EEECFF", text: "#5046E5" },
  { bg: "#E2F2F1", text: "#176B55" },
  { bg: "#FFF0D8", text: "#A85D14" },
  { bg: "#E7EEF8", text: "#28517B" },
  { bg: "#F8E4EA", text: "#9A3657" },
];

function palette(name: string) {
  let hash = 0;
  for (const character of name) hash = hash * 31 + character.charCodeAt(0);
  return PALETTES[Math.abs(hash) % PALETTES.length]!;
}

function BusinessCard({ business }: { business: Business }) {
  const colors = palette(business.name);
  const description = business.description || "Descobre o que este negócio tem para ti.";

  return (
    <Link
      href={`/${business.slug}`}
      className="home-business-card"
      data-testid={`link-business-${business.id}`}
      aria-label={`Abrir o perfil de ${business.name}`}
    >
      <div className="home-business-top">
        <span
          className="home-business-avatar"
          style={{ backgroundColor: colors.bg, color: colors.text }}
          data-testid={`avatar-business-${business.id}`}
        >
          {business.name.charAt(0).toUpperCase()}
        </span>
        <span className="home-ai-pill">
          <Bot size={12} aria-hidden="true" />
          Assistente IA
        </span>
      </div>
      <h3 className="home-business-name" data-testid={`text-business-name-${business.id}`}>
        {business.name}
      </h3>
      <p className="home-business-description" data-testid={`text-business-description-${business.id}`}>
        {business.sector}{description ? ` · ${description}` : ""}
      </p>
      <div className="home-business-footer">
        <span>Ver negócio e catálogo</span>
        <ArrowUpRight size={16} aria-hidden="true" />
      </div>
    </Link>
  );
}

function BusinessSkeleton() {
  return (
    <div className="home-skeleton-card" aria-hidden="true">
      <div className="home-skeleton-block home-skeleton-avatar" />
      <div className="home-skeleton-block home-skeleton-title" />
      <div className="home-skeleton-block home-skeleton-line" />
      <div className="home-skeleton-block home-skeleton-line home-skeleton-line-short" />
    </div>
  );
}

export function HomePage() {
  const { user, isLoggedIn } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  const fetchBusinesses = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(`${API_BASE}/businesses`)
      .then((response) => {
        if (!response.ok) throw new Error("Não foi possível carregar os negócios.");
        return response.json() as Promise<{ businesses?: Business[] }>;
      })
      .then(({ businesses: nextBusinesses }) => setBusinesses(nextBusinesses ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchBusinesses();
  }, [fetchBusinesses]);

  useEffect(() => {
    const origin = window.location.origin;
    document.title = "Linkealls — Descobre negócios. Fala com quem resolve.";
    let description = document.querySelector('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.setAttribute("name", "description");
      document.head.appendChild(description);
    }
    description.setAttribute(
      "content",
      "Descobre negócios em Angola, consulta catálogos e fala com o assistente IA de cada negócio no Linkealls.",
    );

    const ld = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": `${origin}/#website`, url: `${origin}/`, name: "Linkealls", inLanguage: "pt-AO" },
        {
          "@type": "ItemList", "@id": `${origin}/#businesses`,
          name: "Negócios no Linkealls", numberOfItems: businesses.length,
          itemListElement: businesses.map((business, index) => ({
            "@type": "ListItem", position: index + 1, url: `${origin}/${business.slug}`, name: business.name,
          })),
        },
      ],
    };
    const script = document.createElement("script");
    script.id = "linkealls-jsonld";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
    return () => { document.getElementById("linkealls-jsonld")?.remove(); };
  }, [businesses]);

  const filteredBusinesses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return businesses;
    return businesses.filter((business) =>
      [business.name, business.sector, business.description].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [businesses, search]);

  if (isLoggedIn) {
    return user?.handle ? <Redirect to={`/e/${user.handle}/dono`} /> : <Redirect to="/escolher-handle" />;
  }

  const scrollToDiscovery = () => {
    document.getElementById("descobrir")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.getElementById("business-search")?.focus(), 450);
  };

  return (
    <main className="linkealls-home">
      <header className="home-nav" data-testid="header-home">
        <Link href="/" className="home-logo" data-testid="link-home-logo" aria-label="Linkealls, página inicial">
          <span className="home-logo-mark" aria-hidden="true"><ArrowUpRight size={18} strokeWidth={2.5} /></span>
          <span>Linkealls</span>
        </Link>
        <nav className="home-nav-links" aria-label="Navegação principal">
          <a href="#descobrir" className="home-nav-link" data-testid="link-nav-discover">Descobrir negócios</a>
          <a href="#para-negocios" className="home-nav-link" data-testid="link-nav-businesses">Para negócios</a>
        </nav>
        <Link href="/login" className="home-nav-login" data-testid="link-login-header">Entrar</Link>
      </header>

      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-copy home-reveal">
          <p className="home-eyebrow">Feito em Angola, para Angola</p>
          <h1 id="home-hero-title" className="home-hero-title">
            O teu próximo negócio está <em>aqui.</em>
          </h1>
          <p className="home-hero-lede">
            Encontra serviços perto de ti, vê o catálogo e fala directamente com quem pode ajudar. Sem perder tempo em mensagens soltas.
          </p>
          <div className="home-hero-actions">
            <button
              type="button"
              className="home-primary-cta"
              onClick={scrollToDiscovery}
              data-testid="button-discover-businesses"
            >
              Explorar negócios
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <Link href="/registar" className="home-secondary-cta" data-testid="link-register-hero">
              Criar presença grátis
            </Link>
          </div>
          <p className="home-hero-note">
            <Sparkles size={14} aria-hidden="true" />
            Catálogos claros. Conversas que avançam.
          </p>
        </div>

        <div className="home-hero-art home-reveal home-reveal-delay-1" aria-label="Exemplo de conversa com um assistente de negócio">
          <div className="home-orb" aria-hidden="true" />
          <div className="home-chat-card">
            <div className="home-chat-header">
              <span className="home-chat-avatar" aria-hidden="true"><MessageCircle size={19} /></span>
              <div>
                <div className="home-chat-name">Assistente Linkealls</div>
                <div className="home-chat-status">Disponível agora</div>
              </div>
            </div>
            <div className="home-chat-body">
              <p className="home-chat-kicker">Uma conversa simples</p>
              <div className="home-chat-bubble">Olá. Procuro uma solução para esta semana.</div>
              <div className="home-chat-bubble is-user">Posso ver as opções?</div>
              <div className="home-chat-options">
                <div className="home-chat-option"><span>Ver catálogo</span><ChevronRight size={14} aria-hidden="true" /></div>
                <div className="home-chat-option"><span>Falar com o negócio</span><ChevronRight size={14} aria-hidden="true" /></div>
              </div>
            </div>
          </div>
          <div className="home-floating-card">
            <div className="home-floating-label"><MapPin size={12} aria-hidden="true" /> Descoberta local</div>
            <div className="home-floating-title">Perto de ti</div>
            <div className="home-floating-meta">Negócios prontos para conversar</div>
          </div>
        </div>
      </section>

      <section className="home-steps-bar" aria-label="Como funciona">
        <div className="home-steps-inner">
          <div className="home-step">
            <span className="home-step-number">01</span>
            <div><div className="home-step-title">Encontra</div><div className="home-step-copy">Negócios locais</div></div>
          </div>
          <div className="home-step">
            <span className="home-step-number">02</span>
            <div><div className="home-step-title">Escolhe</div><div className="home-step-copy">Vê produtos e serviços</div></div>
          </div>
          <div className="home-step">
            <span className="home-step-number">03</span>
            <div><div className="home-step-title">Conversa</div><div className="home-step-copy">Tira dúvidas na hora</div></div>
          </div>
        </div>
      </section>

      <section id="descobrir" className="home-discovery" aria-labelledby="discovery-title">
        <div className="home-section-heading">
          <div>
            <p className="home-section-kicker">Descobrir</p>
            <h2 id="discovery-title" className="home-section-title">Procura. Encontra. Resolve.</h2>
          </div>
          <p className="home-section-intro">
            Pesquisa nos negócios que já estão no Linkealls e abre o perfil para ver tudo num só lugar.
          </p>
        </div>

        <div className="home-search-shell">
          <Search size={19} aria-hidden="true" />
          <input
            id="business-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="O que procuras hoje?"
            className="home-search-input"
            aria-label="Pesquisar negócios por nome ou categoria"
            data-testid="input-business-search"
          />
          {search && (
            <button
              type="button"
              className="home-search-clear"
              onClick={() => setSearch("")}
              data-testid="button-clear-search"
              aria-label="Limpar pesquisa"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="home-results-meta">
          <span className="home-results-count" data-testid="text-business-count">
            {loading ? "A carregar negócios..." : `${filteredBusinesses.length} ${filteredBusinesses.length === 1 ? "negócio encontrado" : "negócios encontrados"}`}
          </span>
          {!loading && search && <span data-testid="text-search-summary">Para “{search}”</span>}
        </div>

        {loading ? (
          <div className="home-business-grid" aria-label="A carregar negócios">
            <BusinessSkeleton /><BusinessSkeleton /><BusinessSkeleton />
          </div>
        ) : error ? (
          <div className="home-feedback" role="alert" data-testid="status-business-error">
            <div className="home-feedback-icon"><Building2 size={20} aria-hidden="true" /></div>
            <h3 className="home-feedback-title">Não conseguimos carregar os negócios</h3>
            <p className="home-feedback-copy">Verifica a ligação e tenta novamente. A tua pesquisa fica aqui.</p>
            <button type="button" className="home-retry" onClick={fetchBusinesses} data-testid="button-retry-businesses">
              <RefreshCw size={14} aria-hidden="true" /> Tentar de novo
            </button>
          </div>
        ) : filteredBusinesses.length === 0 ? (
          <div className="home-feedback" data-testid="status-business-empty">
            <div className="home-feedback-icon"><Search size={20} aria-hidden="true" /></div>
            <h3 className="home-feedback-title">{search ? "Ainda não encontrámos esse negócio" : "Ainda não há negócios publicados"}</h3>
            <p className="home-feedback-copy">
              {search ? "Experimenta outro nome ou categoria. Há sempre mais negócios a chegar." : "Sê dos primeiros a criar uma presença digital feita para conversar."}
            </p>
            {search ? (
              <button type="button" className="home-retry" onClick={() => setSearch("")} data-testid="button-reset-empty-search">
                Limpar pesquisa
              </button>
            ) : (
              <Link href="/registar" className="home-retry" data-testid="link-register-empty">
                Criar negócio
              </Link>
            )}
          </div>
        ) : (
          <div className="home-business-grid" data-testid="list-businesses">
            {filteredBusinesses.map((business) => <BusinessCard key={business.id} business={business} />)}
          </div>
        )}
      </section>

      <section id="para-negocios" className="home-owner-section" aria-labelledby="owner-title">
        <div className="home-owner-inner">
          <div>
            <p className="home-section-kicker home-owner-kicker">Para quem faz acontecer</p>
            <h2 id="owner-title" className="home-owner-title">O teu negócio merece mais do que um número de telefone.</h2>
            <p className="home-owner-copy">
              Cria o teu espaço no Linkealls, mostra o que vendes e deixa um assistente responder às perguntas enquanto tu tratas do resto.
            </p>
            <div className="home-hero-actions">
              <Link href="/registar" className="home-primary-cta" data-testid="link-register-owner">
                Criar a minha presença
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
              <Link href="/login" className="home-secondary-cta" style={{ color: "#fff" }} data-testid="link-login-owner">
                Já tenho conta
              </Link>
            </div>
          </div>
          <div className="home-owner-card">
            <div className="home-owner-card-label">O teu espaço, à tua maneira</div>
            <div className="home-owner-card-row">
              <span className="home-owner-card-icon"><Store size={20} aria-hidden="true" /></span>
              <div><div className="home-owner-card-title">Uma presença que trabalha</div><div className="home-owner-card-subtitle">Mesmo quando estás ocupado.</div></div>
            </div>
            <ul className="home-owner-list">
              <li><Check size={16} aria-hidden="true" /> Perfil e catálogo num único link</li>
              <li><Check size={16} aria-hidden="true" /> Respostas para as perguntas frequentes</li>
              <li><Check size={16} aria-hidden="true" /> Mais clareza para cada cliente</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <span className="home-footer-copy">© {new Date().getFullYear()} Linkealls · Negócios de Angola, mais perto.</span>
        <div className="home-footer-links">
          <Link href="/registar" className="home-footer-link" data-testid="link-register-footer">Criar presença</Link>
          <Link href="/login" className="home-footer-link" data-testid="link-login-footer">Entrar</Link>
          <Link href="/termos" className="home-footer-link" data-testid="link-terms-footer">Termos</Link>
          <Link href="/privacidade" className="home-footer-link" data-testid="link-privacy-footer">Privacidade</Link>
        </div>
      </footer>
    </main>
  );
}