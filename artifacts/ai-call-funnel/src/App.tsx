import { useEffect } from "react";
import { Router, Route, Switch, Redirect, useLocation, useParams } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { HomePage } from "@/pages/HomePage";
import { Chat } from "@/pages/Chat";
import { Captacao } from "@/pages/Captacao";
import { Catalogo } from "@/pages/Catalogo";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { RecoverAccessPage } from "@/pages/RecoverAccessPage";
import { ChooseHandle } from "@/pages/ChooseHandle";
import { LegalPage } from "@/pages/LegalPage";
import { OwnerGate } from "@/components/owner/OwnerGate";
import { Owner } from "@/pages/Owner";
import { Leads } from "@/pages/owner/Leads";
import { Assistant } from "@/pages/owner/Assistant";
import { Campaigns } from "@/pages/owner/Campaigns";
import { CampaignDetail } from "@/pages/owner/CampaignDetail";
import { Conversas } from "@/pages/owner/Conversas";
import { Mercado } from "@/pages/owner/Mercado";
import { Vendas } from "@/pages/owner/Vendas";
import { Comercio } from "@/pages/owner/Comercio";
import { Carteira } from "@/pages/owner/Carteira";
import { Plano } from "@/pages/owner/Plano";

// Serve under the artifact base path. With BASE_PATH="/" this is "".
const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Sync --vh to the visual viewport height so the layout always fits the
 * visible area — even when the virtual keyboard is open on iOS/Android.
 */
function useVisualViewportHeight() {
  useEffect(() => {
    const apply = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--vh", `${h}px`);
    };
    apply();
    window.visualViewport?.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    return () => {
      window.visualViewport?.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);
}

/**
 * Smart redirect for legacy /dono/* routes.
 * Preserves the sub-path: /dono/conversas → /e/:handle/dono/conversas.
 * If logged in without handle → onboarding; not logged in → login (with next).
 */
function LegacyOwnerRedirect() {
  const { isLoading, isLoggedIn, user } = useAuth();
  const [location] = useLocation();
  if (isLoading) return null;
  if (!isLoggedIn) return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  if (!user?.handle) return <Redirect to="/escolher-handle" />;
  const sub = location.replace(/^\/dono/, "");
  return <Redirect to={`/e/${user.handle}/dono${sub}`} />;
}

/**
 * Legacy /captacao and /conversas links — explain instead of failing silently.
 */
function LegacyLinkNotice() {
  const { isLoggedIn, user } = useAuth();
  if (isLoggedIn && user?.handle) return <Redirect to={`/e/${user.handle}/dono`} />;
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-4">
      <p className="text-[15px] font-semibold text-[#EAF0F7]">Este link mudou</p>
      <p className="text-[13px] leading-relaxed" style={{ color: "#4A6B80" }}>
        Agora cada negócio tem o seu próprio endereço. Procura o negócio na
        página inicial para continuar a conversa.
      </p>
      <a
        href={import.meta.env.BASE_URL}
        className="px-5 py-2.5 rounded-xl font-bold text-[14px]"
        style={{ background: "#00A884", color: "#050D14" }}
      >
        Ir para a página inicial
      </a>
    </div>
  );
}

/** Keep old /u/:handle links working while making /:handle canonical. */
function LegacyUserProfileRedirect() {
  const { handle } = useParams<{ handle?: string }>();
  return <Redirect to={handle ? `/${handle}` : "/"} />;
}

export default function App() {
  useVisualViewportHeight();

  return (
    <AuthProvider>
      <Toaster />
      <Router base={routerBase}>
        <Switch>
          {/* ── Linkealls home — standalone light-on-dark layout ────────────── */}
          <Route path="/" component={HomePage} />

          {/* ── Public catalog (no dark full-screen wrapper) ─────────────────── */}
          <Route path="/e/:businessSlug/catalogo" component={Catalogo} />
          <Route path="/catalogo" component={Catalogo} />
          <Route path="/c/:slug" component={Catalogo} />

          {/* ── One-segment public/reserved routes must precede /:handle ─────── */}
          <Route path="/login" component={LoginPage} />
          <Route path="/registar" component={RegisterPage} />
          <Route path="/recuperar-acesso" component={RecoverAccessPage} />
          <Route path="/escolher-handle" component={ChooseHandle} />
          <Route path="/ligar-conta">{() => <Redirect to="/login" />}</Route>
          <Route path="/termos" component={() => <LegalPage kind="terms" />} />
          <Route path="/privacidade" component={() => <LegalPage kind="privacy" />} />
          <Route path="/dono"><LegacyOwnerRedirect /></Route>
          <Route path="/conversas">
            <div className="w-full flex flex-col overflow-hidden" style={{ height: "var(--vh, 100dvh)" }}>
              <LegacyLinkNotice />
            </div>
          </Route>
          <Route path="/captacao">
            <div className="w-full flex flex-col overflow-hidden" style={{ height: "var(--vh, 100dvh)" }}>
              <LegacyLinkNotice />
            </div>
          </Route>

          {/* ── Canonical public catalog: https://dominio/<handle> ───────────── */}
          <Route path="/:handle" component={Catalogo} />

          {/* ── All other routes: full-screen dark wrapper ───────────────────── */}
          <Route>
            {() => (
              <div
                  className="w-full bg-[#F6F9FC] flex flex-col overflow-hidden"
                style={{ height: "var(--vh, 100dvh)" }}
              >
                <Switch>
                  {/* Legacy user profile URL → canonical short catalog URL */}
                  <Route path="/u/:handle"><LegacyUserProfileRedirect /></Route>

                  {/* Legacy generic conversations — /u/:handle covers this now */}
                  {/* ── Owner panel (protected by OwnerGate) ─────────────────── */}
                  <Route path="/e/:businessSlug/dono/leads">{() => <OwnerGate><Leads /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/conversas">{() => <OwnerGate><Conversas /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/assistente">{() => <OwnerGate><Assistant /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/campanhas/:id">{() => <OwnerGate><CampaignDetail /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/campanhas">{() => <OwnerGate><Campaigns /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/mercado">{() => <OwnerGate><Mercado /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/vendas">{() => <OwnerGate><Vendas /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/comercio">{() => <OwnerGate><Comercio /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/carteira">{() => <OwnerGate><Carteira /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/plano">{() => <OwnerGate><Plano /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono">{() => <OwnerGate><Owner /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/captacao" component={Captacao} />
                  <Route path="/e/:businessSlug" component={Chat} />

                  {/* ── Legacy single-tenant /dono/* → smart redirect ──────── */}
                  <Route path="/dono/leads"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/conversas"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/assistente"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/campanhas/:id"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/campanhas"><LegacyOwnerRedirect /></Route>
                  {/* Fallback */}
                  <Route><Redirect to="/" /></Route>
                </Switch>
              </div>
            )}
          </Route>
        </Switch>
      </Router>
    </AuthProvider>
  );
}
