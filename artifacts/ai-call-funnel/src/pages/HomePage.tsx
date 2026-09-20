/**
 * Linkealls — public landing page focused on the business link, AI service,
 * catalogue, orders and payments.
 */
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Menu, X } from "lucide-react";
import { SiFacebook, SiInstagram, SiWhatsapp, SiYoutube } from "react-icons/si";
import { Link, Redirect, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import heroImage from "@/assets/landing/hero.jpg";
import profileCustomizationImage from "@/assets/landing/profile-customization.jpg";
import socialSharingImage from "@/assets/landing/social-sharing.jpg";
import proofCreatorImage from "@/assets/landing/proof-creator.jpg";
import proofCommunityImage from "@/assets/landing/proof-community.jpg";
import proofBusinessImage from "@/assets/landing/proof-business.jpg";
import commerceOrdersImage from "@/assets/landing/commerce-orders.jpg";
import pressPartnersImage from "@/assets/landing/press-partners.jpg";
import testimonialOwnerImage from "@/assets/landing/testimonial-owner.jpg";
import { AuthBrand } from "@/components/auth/AuthBrand";
import angelaAvatar from "@/assets/testimonials/angela.webp";
import joaoAvatar from "@/assets/testimonials/joao.webp";
import heroAvif480 from "@/assets/landing/hero-480.avif";
import heroAvif1024 from "@/assets/landing/hero-1024.avif";
import heroWebp480 from "@/assets/landing/hero-480.webp";
import heroWebp1024 from "@/assets/landing/hero-1024.webp";
import profileCustomizationAvif480 from "@/assets/landing/profile-customization-480.avif";
import profileCustomizationAvif819 from "@/assets/landing/profile-customization-819.avif";
import profileCustomizationWebp480 from "@/assets/landing/profile-customization-480.webp";
import profileCustomizationWebp819 from "@/assets/landing/profile-customization-819.webp";
import socialSharingAvif480 from "@/assets/landing/social-sharing-480.avif";
import socialSharingAvif768 from "@/assets/landing/social-sharing-768.avif";
import socialSharingWebp480 from "@/assets/landing/social-sharing-480.webp";
import socialSharingWebp768 from "@/assets/landing/social-sharing-768.webp";
import proofCreatorAvif480 from "@/assets/landing/proof-creator-480.avif";
import proofCreatorAvif1024 from "@/assets/landing/proof-creator-1024.avif";
import proofCreatorWebp480 from "@/assets/landing/proof-creator-480.webp";
import proofCreatorWebp1024 from "@/assets/landing/proof-creator-1024.webp";
import proofCommunityAvif480 from "@/assets/landing/proof-community-480.avif";
import proofCommunityAvif819 from "@/assets/landing/proof-community-819.avif";
import proofCommunityWebp480 from "@/assets/landing/proof-community-480.webp";
import proofCommunityWebp819 from "@/assets/landing/proof-community-819.webp";
import proofBusinessAvif480 from "@/assets/landing/proof-business-480.avif";
import proofBusinessAvif1024 from "@/assets/landing/proof-business-1024.avif";
import proofBusinessWebp480 from "@/assets/landing/proof-business-480.webp";
import proofBusinessWebp1024 from "@/assets/landing/proof-business-1024.webp";
import commerceOrdersAvif480 from "@/assets/landing/commerce-orders-480.avif";
import commerceOrdersAvif819 from "@/assets/landing/commerce-orders-819.avif";
import commerceOrdersWebp480 from "@/assets/landing/commerce-orders-480.webp";
import commerceOrdersWebp819 from "@/assets/landing/commerce-orders-819.webp";
import pressPartnersAvif480 from "@/assets/landing/press-partners-480.avif";
import pressPartnersAvif1024 from "@/assets/landing/press-partners-1024.avif";
import pressPartnersWebp480 from "@/assets/landing/press-partners-480.webp";
import pressPartnersWebp1024 from "@/assets/landing/press-partners-1024.webp";
import testimonialOwnerAvif480 from "@/assets/landing/testimonial-owner-480.avif";
import testimonialOwnerAvif819 from "@/assets/landing/testimonial-owner-819.avif";
import testimonialOwnerWebp480 from "@/assets/landing/testimonial-owner-480.webp";
import testimonialOwnerWebp819 from "@/assets/landing/testimonial-owner-819.webp";

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

interface LandingImage {
  fallback: string;
  avif: string;
  webp: string;
}

const responsiveImage = (
  fallback: string,
  avifSmall: string,
  avifLarge: string,
  webpSmall: string,
  webpLarge: string,
  smallWidth: number,
  largeWidth: number,
): LandingImage => ({
  fallback,
  avif: `${avifSmall} ${smallWidth}w, ${avifLarge} ${largeWidth}w`,
  webp: `${webpSmall} ${smallWidth}w, ${webpLarge} ${largeWidth}w`,
});

const LANDING_IMAGES = {
  hero: responsiveImage(heroImage, heroAvif480, heroAvif1024, heroWebp480, heroWebp1024, 480, 1024),
  profileCustomization: responsiveImage(profileCustomizationImage, profileCustomizationAvif480, profileCustomizationAvif819, profileCustomizationWebp480, profileCustomizationWebp819, 480, 819),
  socialSharing: responsiveImage(socialSharingImage, socialSharingAvif480, socialSharingAvif768, socialSharingWebp480, socialSharingWebp768, 480, 768),
  proofCreator: responsiveImage(proofCreatorImage, proofCreatorAvif480, proofCreatorAvif1024, proofCreatorWebp480, proofCreatorWebp1024, 480, 1024),
  proofCommunity: responsiveImage(proofCommunityImage, proofCommunityAvif480, proofCommunityAvif819, proofCommunityWebp480, proofCommunityWebp819, 480, 819),
  proofBusiness: responsiveImage(proofBusinessImage, proofBusinessAvif480, proofBusinessAvif1024, proofBusinessWebp480, proofBusinessWebp1024, 480, 1024),
  commerceOrders: responsiveImage(commerceOrdersImage, commerceOrdersAvif480, commerceOrdersAvif819, commerceOrdersWebp480, commerceOrdersWebp819, 480, 819),
  pressPartners: responsiveImage(pressPartnersImage, pressPartnersAvif480, pressPartnersAvif1024, pressPartnersWebp480, pressPartnersWebp1024, 480, 1024),
  testimonialOwner: responsiveImage(testimonialOwnerImage, testimonialOwnerAvif480, testimonialOwnerAvif819, testimonialOwnerWebp480, testimonialOwnerWebp819, 480, 819),
} as const;

function LandingMedia({
  image,
  alt,
  className = "",
  eager = false,
  sizes = "(max-width: 640px) calc(100vw - 32px), 550px",
}: {
  image: LandingImage;
  alt: string;
  className?: string;
  eager?: boolean;
  sizes?: string;
}) {
  return (
    <figure className={`home-media-slot ${className}`}>
      <picture>
        <source type="image/avif" srcSet={image.avif} sizes={sizes} />
        <source type="image/webp" srcSet={image.webp} sizes={sizes} />
        <img
          src={image.fallback}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
        />
      </picture>
    </figure>
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
  const [urlHandle, setUrlHandle] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  useEffect(() => {
    const origin = window.location.origin;
    document.title = "Linkealls — O teu negócio, num link que conversa";
    let description = document.querySelector('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.setAttribute("name", "description");
      document.head.appendChild(description);
    }
    description.setAttribute("content", "Um link para o teu negócio: os clientes consultam o catálogo, falam com a tua IA por voz ou chat e fazem pedidos e pagamentos.");
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
          "@type": "Service", "@id": `${origin}/#service`, name: "Linkealls", serviceType: "Página de negócio, catálogo, atendimento por IA, pedidos e pagamentos",
        },
      ],
    };
    const script = document.createElement("script");
    script.id = "linkealls-jsonld";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
    return () => { document.getElementById("linkealls-jsonld")?.remove(); };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        const btn = document.getElementById("home-menu-toggle");
        if (btn) btn.focus();
      }
    }
    function handleClickOutside(e: MouseEvent) {
      if (menuOpen && !(e.target as Element).closest(".home-nav")) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  if (isLoggedIn) {
    return user?.handle ? <Redirect to={`/e/${user.handle}/dono`} /> : <Redirect to="/escolher-handle" />;
  }

  const submitHandle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocation("/registar");
  };

  return (
    <main className="linkealls-home page-scroll-container">
      <header className="home-nav" data-testid="header-home">
        <Link href="/" className="home-logo" data-testid="link-home-logo" aria-label="Linkealls, página inicial">
          <AuthBrand style={{ color: "inherit", fontSize: 20 }} />
        </Link>
        <nav className="home-nav-links" aria-label="Navegação principal">
          <a href="#para-negocios" className="home-nav-link" data-testid="link-nav-businesses">Para negócios</a>
          <a href="#como-funciona" className="home-nav-link" data-testid="link-nav-how">Como funciona</a>
        </nav>
        <Link href="/login" className="home-nav-login" data-testid="link-login-header">Entrar</Link>
        <button id="home-menu-toggle" type="button" className="home-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="home-mobile-menu" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} data-testid="button-toggle-menu">
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        {menuOpen && (
          <div id="home-mobile-menu" className="home-mobile-menu">
            <a href="#para-negocios" onClick={() => setMenuOpen(false)} data-testid="link-mobile-businesses">Para negócios</a>
            <a href="#como-funciona" onClick={() => setMenuOpen(false)} data-testid="link-mobile-how">Como funciona</a>
          </div>
        )}
      </header>

      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-inner home-reveal">
          <p className="home-eyebrow">O teu negócio disponível num único link</p>
          <h1 id="home-hero-title" className="home-hero-title">Atende e vende, <em>mesmo quando não estás.</em></h1>
          <p className="home-hero-lede">Os clientes consultam o teu catálogo, falam com a tua IA por voz ou chat e fazem pedidos num só lugar.</p>
          <form className="home-url-form" onSubmit={submitHandle} data-testid="form-create-presence">
            <span className="home-url-prefix">linkealls.com/</span>
            <input className="home-url-input" value={urlHandle} onChange={(event) => setUrlHandle(event.target.value)} placeholder="o-teu-negocio" aria-label="Escolher endereço do negócio" data-testid="input-business-handle" />
            <button type="submit" className="home-url-submit" data-testid="button-create-presence">Criar a minha página <ArrowRight size={15} /></button>
          </form>
          <p className="home-hero-trust">Grátis para começar · sem cartão · feito para o teu ritmo</p>
          <SocialRow />
          <div className="home-hero-media home-reveal home-reveal-delay-1">
            <LandingMedia
              image={LANDING_IMAGES.hero}
              alt="Empreendedora angolana rodeada por produtos de pequenos negócios"
              className="is-hero"
              eager
              sizes="(max-width: 640px) calc(100vw - 32px), 1024px"
            />
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
            <span className="home-story-number">01 / CATÁLOGO</span>
            <p className="home-story-kicker">Produtos e serviços num só lugar</p>
            <h2 id="custom-title" className="home-story-title">A tua página. O teu catálogo.</h2>
            <p>Organiza o que vendes e partilha um endereço simples onde os clientes podem consultar e escolher.</p>
            <a href="#para-negocios" className="home-story-link" data-testid="link-customize-presence">Ver como funciona <ArrowRight size={15} /></a>
          </div>
          <div className="home-story-media">
            <LandingMedia
              image={LANDING_IMAGES.profileCustomization}
              alt="Criador angolano a personalizar a presença visual do seu negócio"
              className="is-portrait is-light"
            />
          </div>
        </div>
      </section>

      <section id="partilhar" className="home-story-section is-burgundy" aria-labelledby="share-title">
        <div className="home-story-inner home-story-grid">
          <div className="home-story-media is-left">
            <LandingMedia
              image={LANDING_IMAGES.socialSharing}
              alt="Criadora angolana a partilhar o seu negócio através do telemóvel"
              className="is-tall is-light"
            />
          </div>
          <div className="home-story-copy is-right">
             <span className="home-story-number">02 / ATENDIMENTO IA</span>
             <p className="home-story-kicker">Respostas quando o cliente precisa</p>
             <h2 id="share-title" className="home-story-title">Da dúvida para a conversa.</h2>
             <p>A tua IA conhece o negócio e atende por voz ou chat, ajudando o cliente a encontrar produtos e avançar com o pedido.</p>
             <a href="#para-negocios" className="home-story-link">Preparar o meu negócio <ArrowRight size={15} /></a>
          </div>
        </div>
      </section>

      <section className="home-proof-section" aria-labelledby="proof-title">
        <p className="home-proof-kicker">Já está a acontecer</p>
        <h2 id="proof-title" className="home-proof-title">Pequenos negócios. <em>Grandes movimentos.</em></h2>
        <div className="home-proof-collage" aria-label="Criadores e negócios da comunidade Linkealls">
          <LandingMedia
            image={LANDING_IMAGES.proofCreator}
            alt="Criadora angolana de beleza com um produto da sua marca"
            className="is-square is-light"
          />
          <LandingMedia
            image={LANDING_IMAGES.proofCommunity}
            alt="Comunidade de jovens criadores e empreendedores angolanos"
            className="is-portrait is-light"
          />
          <LandingMedia
            image={LANDING_IMAGES.proofBusiness}
            alt="Dono de um pequeno café angolano a preparar uma encomenda"
            className="is-square is-light"
          />
        </div>
        <div className="home-quotes">
          <article className="home-quote is-purple">
            <span className="home-quote-mark">“</span>
            <p className="home-quote-text">Agora mando um link e a pessoa já chega a saber o que faço. A conversa começa diferente.</p>
            <div className="home-quote-by">
              <span className="home-quote-avatar"><img src={angelaAvatar} alt="" /></span>
              <span>Ângela M. · Luanda</span>
            </div>
          </article>
          <article className="home-quote home-quote-small">
            <span className="home-quote-mark">“</span>
            <p className="home-quote-text">A montra do meu negócio cabe no bolso do cliente.</p>
            <div className="home-quote-by">
              <span className="home-quote-avatar"><img src={joaoAvatar} alt="" /></span>
              <span>João C. · Benguela</span>
            </div>
          </article>
        </div>
      </section>

      <section className="home-story-section is-lime" aria-labelledby="commerce-title">
        <div className="home-story-inner home-story-grid">
          <div className="home-story-copy">
            <span className="home-story-number">03 / PEDIDOS E PAGAMENTOS</span>
            <p className="home-story-kicker">Do interesse à encomenda</p>
            <h2 id="commerce-title" className="home-story-title">Atender, receber e acompanhar.</h2>
            <p>O cliente escolhe, faz o pedido e paga. Tu acompanhas as vendas, a carteira e os saques no teu espaço.</p>
            <ul className="home-owner-list">
              <li><Check size={16} /> Catálogo fácil de actualizar</li>
              <li><Check size={16} /> Atendimento por voz e chat</li>
              <li><Check size={16} /> Pedidos e pagamentos organizados</li>
            </ul>
          </div>
          <div className="home-story-media">
            <LandingMedia
              image={LANDING_IMAGES.commerceOrders}
              alt="Dona de negócio angolana a preparar uma encomenda recebida pelo telemóvel"
              className="is-portrait is-light"
            />
          </div>
        </div>
      </section>

      <section id="para-negocios" className="home-pricing-section is-press" aria-labelledby="pricing-title">
        <div className="home-pricing-inner">
          <div>
            <p className="home-pricing-kicker">O próximo passo é teu</p>
            <h2 id="pricing-title" className="home-pricing-title">O teu próximo cliente já está online.</h2>
             <p className="home-pricing-copy">Cria um link onde os clientes encontram produtos, falam com a tua IA e fazem pedidos — mesmo quando não estás disponível.</p>
            <Link href="/registar" className="home-pricing-cta home-pricing-cta-inline" data-testid="link-register-press">Criar a minha presença <ArrowUpRight size={16} /></Link>
          </div>
          <div className="home-press-panel">
            <p className="home-press-label">Onde o teu negócio pode aparecer</p>
            <LandingMedia
              image={LANDING_IMAGES.pressPartners}
              alt="Composição editorial que representa imprensa, reconhecimento e parcerias"
              className="is-landscape is-light"
            />
            <p className="home-press-note">Área reservada para imprensa, parceiros e provas sociais.</p>
          </div>
        </div>
      </section>

      <section className="home-testimonial-section" aria-labelledby="testimonial-title">
        <div className="home-testimonial-inner">
          <div className="home-testimonial-media">
            <LandingMedia
              image={LANDING_IMAGES.testimonialOwner}
              alt="Empreendedora angolana no seu atelier de moda"
              className="is-portrait is-light"
            />
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