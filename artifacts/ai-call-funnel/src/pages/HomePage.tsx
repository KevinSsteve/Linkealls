/**
 * Linkealls — public landing page and Angola-first business discovery.
 * The directory below remains powered by the public businesses API:
 * the homepage never invents listings for visitors.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Check, Globe2, Menu, Search, Sparkles, X } from "lucide-react";
import { SiFacebook, SiInstagram, SiWhatsapp, SiYoutube } from "react-icons/si";
import { Link, Redirect, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";

interface Business {
  id: number;
  slug: string;
  name: string;
  sector: string;
  description: string;
}

const API_BASE = import.meta.env.DEV ? `${import.meta.env.BASE_URL}api` : "/api";

const PALETTES = [
  { bg: "#E8DFFF", text: "#5735A1" },
  { bg: "#D8F1E9", text: "#1C6855" },
  { bg: "#FBE7B3", text: "#9B6410" },
  { bg: "#E6E2FA", text: "#513C95" },
  { bg: "#F9D8E5", text: "#9A3657" },
];

const TESTIMONIALS = [
  {
    quote: "Agora mando um link e a pessoa já chega a saber o que faço. A conversa começa diferente.",
    person: "Ângela M.",
    place: "Luanda",
    initials: "AM",
  },
  {
    quote: "A minha montra cabe no bolso do cliente — e eu consigo actualizar tudo sem pedir ajuda.",
    person: "João C.",
    place: "Benguela",
    initials: "JC",
  },
  {
    quote: "O Linkealls deu nome e lugar às coisas que eu já estava a construir todos os dias.",
    person: "Marta K.",
    place: "Lubango",
    initials: "MK",
  },
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
    <Link href={`/${business.slug}`} className="home-business-card" data-testid={`link-business-${business.id}`} aria-label={`Abrir o perfil de ${business.name}`}>
      <div className="home-business-top">
        <span className="home-business-avatar" style={{ backgroundColor: colors.bg, color: colors.text }} data-testid={`avatar-business-${business.id}`}>
          {business.name.charAt(0).toUpperCase()}
        </span>
        <span className="home-ai-pill"><Sparkles size={12} aria-hidden="true" /> Assistente IA</span>
      </div>
      <h3 className="home-business-name" data-testid={`text-business-name-${business.id}`}>{business.name}</h3>
      <p className="home-business-description" data-testid={`text-business-description-${business.id}`}>
        {business.sector}{description ? ` · ${description}` : ""}
      </p>
      <div className="home-business-footer"><span>Ver negócio e catálogo</span><ArrowUpRight size={16} aria-hidden="true" /></div>
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

function MediaSlot({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`home-media-slot ${className}`} role="img" aria-label={`Espaço para imagem: ${label}`}>
      <span>{label}</span>
    </div>
  );
}

function SocialRow() {
  return (
    <div className="home-social-row" aria-label="Canais suportados">
      <a href="#partilhar" aria-label="Instagram"><SiInstagram /></a>
      <a href="#partilhar" aria-label="Facebook"><SiFacebook /></a>
      <a href="#partilhar" aria-label="YouTube"><SiYoutube /></a>
      <a href="#partilhar" aria-label="WhatsApp"><SiWhatsapp /></a>
    </div>
  );
}

export function HomePage() {
  const { user, isLoggedIn } = useAuth();
  const [, setLocation] = useLocation();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [urlHandle, setUrlHandle] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTestimonial, setActiveTestimonial] = useState(0);

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
    document.title = "Linkealls — O teu negócio, num link que conversa";
    let description = document.querySelector('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.setAttribute("name", "description");
      document.head.appendChild(description);
    }
    description.setAttribute("content", "Cria a tua presença digital em Angola: publica produtos, liga as tuas redes e transforma visitas em conversas e vendas com o Linkealls.");
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement("meta");
      ogTitle.setAttribute("property", "og:title");
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute("content", "Linkealls — O teu negócio, num link que conversa");
    const ld = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": `${origin}/#website`, url: `${origin}/`, name: "Linkealls", inLanguage: "pt-AO" },
        {
          "@type": "ItemList", "@id": `${origin}/#businesses`, name: "Negócios no Linkealls", numberOfItems: businesses.length,
          itemListElement: businesses.map((business, index) => ({ "@type": "ListItem", position: index + 1, url: `${origin}/${business.slug}`, name: business.name })),
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
    return businesses.filter((business) => [business.name, business.sector, business.description].some((value) => value.toLowerCase().includes(query)));
  }, [businesses, search]);

  if (isLoggedIn) {
    return user?.handle ? <Redirect to={`/e/${user.handle}/dono`} /> : <Redirect to="/escolher-handle" />;
  }

  const scrollToDiscovery = () => {
    document.getElementById("descobrir")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.getElementById("business-search")?.focus(), 450);
  };

  const submitHandle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocation("/registar");
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
          <a href="#como-funciona" className="home-nav-link" data-testid="link-nav-how">Como funciona</a>
        </nav>
        <Link href="/login" className="home-nav-login" data-testid="link-login-header">Entrar</Link>
        <button type="button" className="home-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} data-testid="button-toggle-menu">
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        {menuOpen && (
          <div className="home-mobile-menu">
            <a href="#descobrir" onClick={() => setMenuOpen(false)} data-testid="link-mobile-discover">Descobrir negócios</a>
            <a href="#para-negocios" onClick={() => setMenuOpen(false)} data-testid="link-mobile-businesses">Para negócios</a>
            <a href="#como-funciona" onClick={() => setMenuOpen(false)} data-testid="link-mobile-how">Como funciona</a>
          </div>
        )}
      </header>

      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-inner home-reveal">
          <p className="home-eyebrow">A casa digital dos negócios em Angola</p>
          <h1 id="home-hero-title" className="home-hero-title">O teu negócio merece <em>mais.</em></h1>
          <p className="home-hero-lede">Um único link para mostrar o que vendes, juntar as tuas redes e começar conversas que acabam em vendas.</p>
          <form className="home-url-form" onSubmit={submitHandle} data-testid="form-create-presence">
            <span className="home-url-prefix">linkealls.com/</span>
            <input className="home-url-input" value={urlHandle} onChange={(event) => setUrlHandle(event.target.value)} placeholder="o-teu-negocio" aria-label="Escolher endereço do negócio" data-testid="input-business-handle" />
            <button type="submit" className="home-url-submit" data-testid="button-create-presence">Criar a minha página <ArrowRight size={15} /></button>
          </form>
          <p className="home-hero-trust">Grátis para começar · sem cartão · feito para o teu ritmo</p>
          <SocialRow />
          <div className="home-hero-media home-reveal home-reveal-delay-1">
            <MediaSlot label="slot · imagem hero · 16:5" className="is-hero" />
          </div>
        </div>
      </section>

      <div className="home-marquee" aria-hidden="true">
        <div className="home-marquee-track">
          <span className="home-marquee-item">Uma presença. Todos os teus lugares</span>
          <span className="home-marquee-item">Conversa que começa no primeiro clique</span>
          <span className="home-marquee-item">Angola está a criar</span>
          <span className="home-marquee-item">Uma presença. Todos os teus lugares</span>
        </div>
      </div>

      <section id="como-funciona" className="home-story-section is-blue" aria-labelledby="custom-title">
        <div className="home-story-inner home-story-grid">
          <div className="home-story-copy">
            <span className="home-story-number">01 / PRESENÇA</span>
            <p className="home-story-kicker">Tudo o que és, num só lugar</p>
            <h2 id="custom-title" className="home-story-title">A tua página. A tua voz.</h2>
            <p>Escolhe como apareces, organiza os teus links e dá às pessoas um lugar simples para te conhecerem — antes de te escreverem.</p>
            <a href="#para-negocios" className="home-story-link" data-testid="link-customize-presence">Ver como funciona <ArrowRight size={15} /></a>
          </div>
          <div className="home-story-media">
            <MediaSlot label="slot · página de perfil · 4:5" className="is-portrait is-light" />
          </div>
        </div>
      </section>

      <section id="partilhar" className="home-story-section is-burgundy" aria-labelledby="share-title">
        <div className="home-story-inner home-story-grid">
          <div className="home-story-media is-left">
            <MediaSlot label="slot · partilha social · 3:4" className="is-tall is-light" />
          </div>
          <div className="home-story-copy is-right">
            <span className="home-story-number">02 / ALCANCE</span>
            <p className="home-story-kicker">Leva o teu link para todo o lado</p>
            <h2 id="share-title" className="home-story-title">Da bio para a conversa.</h2>
            <p>Instagram, WhatsApp, TikTok, cartões, montras. Um endereço memorável que acompanha o teu negócio onde as pessoas já estão.</p>
            <a href="#descobrir" className="home-story-link" data-testid="link-discover-directory">Descobrir o Linkealls <ArrowRight size={15} /></a>
          </div>
        </div>
      </section>

      <section className="home-story-section is-cream" aria-labelledby="insights-title">
        <div className="home-story-inner home-story-grid">
          <div className="home-story-copy">
            <span className="home-story-number">03 / CLAREZA</span>
            <p className="home-story-kicker">Percebe o que está a resultar</p>
            <h2 id="insights-title" className="home-story-title">Menos adivinhação. Mais decisão.</h2>
            <p>Vê de onde chegam as pessoas, o que procuram e quando estão prontas para falar. Os sinais certos, sem folhas de cálculo intermináveis.</p>
            <div className="home-story-link"><BarChart3 size={15} /> Métricas feitas para pessoas</div>
          </div>
          <div className="home-story-media">
            <MediaSlot label="slot · insights · 4:5" className="is-portrait is-light" />
          </div>
        </div>
      </section>

      <section className="home-proof-section" aria-labelledby="proof-title">
        <p className="home-proof-kicker">Já está a acontecer</p>
        <h2 id="proof-title" className="home-proof-title">Pequenos negócios. <em>Grandes movimentos.</em></h2>
        <div className="home-proof-collage" aria-label="Espaços reservados para imagens de criadores">
          <MediaSlot label="slot · criador · 1:1" className="is-square is-light" />
          <MediaSlot label="slot · comunidade · 4:5" className="is-portrait is-light" />
          <MediaSlot label="slot · negócio · 1:1" className="is-square is-light" />
        </div>
        <div className="home-quotes">
          <article className="home-quote is-purple">
            <span className="home-quote-mark">“</span>
            <p className="home-quote-text">Agora mando um link e a pessoa já chega a saber o que faço. A conversa começa diferente.</p>
            <div className="home-quote-by"><span className="home-quote-avatar">AM</span><span>Ângela M. · Luanda</span></div>
          </article>
          <article className="home-quote home-quote-small">
            <span className="home-quote-mark">“</span>
            <p className="home-quote-text">A montra do meu negócio cabe no bolso do cliente.</p>
            <div className="home-quote-by"><span className="home-quote-avatar">JC</span><span>João C. · Benguela</span></div>
          </article>
        </div>
      </section>

      <section className="home-story-section is-lilac" aria-labelledby="content-title">
        <div className="home-story-inner home-story-grid">
          <div className="home-story-media is-left">
            <MediaSlot label="slot · conteúdo · 3:4" className="is-tall is-light" />
          </div>
          <div className="home-story-copy is-right">
            <span className="home-story-number">04 / CONTEÚDO</span>
            <p className="home-story-kicker">O teu conteúdo, com direcção</p>
            <h2 id="content-title" className="home-story-title">Publica sem te perder.</h2>
            <p>Reúne vídeos, links, serviços e novidades num lugar que continua a trabalhar depois do post desaparecer do feed.</p>
            <a href="#para-negocios" className="home-story-link" data-testid="link-content-tools">Dar forma ao meu conteúdo <ArrowRight size={15} /></a>
          </div>
        </div>
      </section>

      <section className="home-story-section is-lime" aria-labelledby="commerce-title">
        <div className="home-story-inner home-story-grid">
          <div className="home-story-copy">
            <span className="home-story-number">05 / COMÉRCIO</span>
            <p className="home-story-kicker">Do interesse à encomenda</p>
            <h2 id="commerce-title" className="home-story-title">A atenção também vende.</h2>
            <p>Mostra o que tens, responde às dúvidas e facilita o próximo passo. A tua presença digital deixa de ser montra e passa a ser movimento.</p>
            <ul className="home-owner-list">
              <li><Check size={16} /> Catálogo fácil de actualizar</li>
              <li><Check size={16} /> Conversas com contexto</li>
              <li><Check size={16} /> Um próximo passo sempre claro</li>
            </ul>
          </div>
          <div className="home-story-media">
            <MediaSlot label="slot · comércio · 4:5" className="is-portrait is-light" />
          </div>
        </div>
      </section>

      <section id="para-negocios" className="home-pricing-section is-press" aria-labelledby="pricing-title">
        <div className="home-pricing-inner">
          <div>
            <p className="home-pricing-kicker">O próximo passo é teu</p>
            <h2 id="pricing-title" className="home-pricing-title">O teu próximo cliente já está online.</h2>
            <p className="home-pricing-copy">Cria uma presença que trabalha enquanto tu trabalhas. Sem complicação, sem promessas vazias — só um link melhor para o teu negócio.</p>
            <Link href="/registar" className="home-pricing-cta home-pricing-cta-inline" data-testid="link-register-press">Criar a minha presença <ArrowUpRight size={16} /></Link>
          </div>
          <div className="home-press-panel">
            <p className="home-press-label">Onde o teu negócio pode aparecer</p>
            <MediaSlot label="slot · imprensa e logos · 3:2" className="is-landscape is-light" />
            <p className="home-press-note">Área reservada para imprensa, parceiros e provas sociais.</p>
          </div>
        </div>
      </section>

      <section className="home-testimonial-section" aria-labelledby="testimonial-title">
        <div className="home-testimonial-inner">
          <div className="home-testimonial-media">
            <MediaSlot label="slot · retrato de cliente · 4:5" className="is-portrait is-light" />
          </div>
          <div className="home-testimonial-copy">
            <p className="home-proof-kicker">Palavra de quem faz</p>
            <h2 id="testimonial-title" className="home-testimonial-title">Quando o negócio encontra o seu lugar.</h2>
            <blockquote>“{TESTIMONIALS[activeTestimonial].quote}”</blockquote>
            <p className="home-testimonial-by">{TESTIMONIALS[activeTestimonial].person} · {TESTIMONIALS[activeTestimonial].place}</p>
            <div className="home-testimonial-controls" aria-label="Navegação de testemunhos">
              <button type="button" onClick={() => setActiveTestimonial((active) => (active - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)} aria-label="Testemunho anterior" data-testid="button-testimonial-previous"><ArrowLeft size={17} /></button>
              <span>{String(activeTestimonial + 1).padStart(2, "0")} / {String(TESTIMONIALS.length).padStart(2, "0")}</span>
              <button type="button" onClick={() => setActiveTestimonial((active) => (active + 1) % TESTIMONIALS.length)} aria-label="Próximo testemunho" data-testid="button-testimonial-next"><ArrowRight size={17} /></button>
            </div>
          </div>
        </div>
      </section>

      <section id="descobrir" className="home-discovery" aria-labelledby="discovery-title">
        <div className="home-section-heading">
          <div>
            <p className="home-section-kicker">Descobrir</p>
            <h2 id="discovery-title" className="home-section-title">Procura. Encontra. Resolve.</h2>
          </div>
          <p className="home-section-intro">Pesquisa nos negócios que já estão no Linkealls e abre o perfil para ver tudo num só lugar.</p>
        </div>
        <div className="home-search-shell">
          <Search size={19} aria-hidden="true" />
          <input id="business-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="O que procuras hoje?" className="home-search-input" aria-label="Pesquisar negócios por nome ou categoria" data-testid="input-business-search" />
          {search && <button type="button" className="home-search-clear" onClick={() => setSearch("")} data-testid="button-clear-search" aria-label="Limpar pesquisa">Limpar</button>}
        </div>
        <div className="home-results-meta"><span className="home-results-count" data-testid="text-business-count">{loading ? "A carregar negócios..." : `${filteredBusinesses.length} ${filteredBusinesses.length === 1 ? "negócio encontrado" : "negócios encontrados"}`}</span>{!loading && search && <span data-testid="text-search-summary">Para “{search}”</span>}</div>
        {loading ? (
          <div className="home-business-grid" aria-label="A carregar negócios"><BusinessSkeleton /><BusinessSkeleton /><BusinessSkeleton /></div>
        ) : error ? (
          <div className="home-feedback" role="alert" data-testid="status-business-error">
            <div className="home-feedback-icon"><Globe2 size={20} aria-hidden="true" /></div>
            <h3 className="home-feedback-title">Não conseguimos carregar os negócios</h3>
            <p className="home-feedback-copy">Verifica a ligação e tenta novamente. A tua pesquisa fica aqui.</p>
            <button type="button" className="home-retry" onClick={fetchBusinesses} data-testid="button-retry-businesses"><ArrowRight size={14} /> Tentar de novo</button>
          </div>
        ) : filteredBusinesses.length === 0 ? (
          <div className="home-feedback" data-testid="status-business-empty">
            <div className="home-feedback-icon"><Search size={20} aria-hidden="true" /></div>
            <h3 className="home-feedback-title">{search ? "Ainda não encontrámos esse negócio" : "Ainda não há negócios publicados"}</h3>
            <p className="home-feedback-copy">{search ? "Experimenta outro nome ou categoria. Há sempre mais negócios a chegar." : "Sê dos primeiros a criar uma presença digital feita para conversar."}</p>
            {search ? <button type="button" className="home-retry" onClick={() => setSearch("")} data-testid="button-reset-empty-search">Limpar pesquisa</button> : <Link href="/registar" className="home-retry" data-testid="link-register-empty">Criar negócio</Link>}
          </div>
        ) : (
          <div className="home-business-grid" data-testid="list-businesses">{filteredBusinesses.map((business) => <BusinessCard key={business.id} business={business} />)}</div>
        )}
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