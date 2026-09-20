import { useEffect } from "react";
import { Router, Route, Switch, Redirect, useLocation, useParams } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { HomePage } from "@/pages/HomePage";
import { Chat } from "@/pages/Chat";
import { PublicTraffic } from "@/pages/PublicTraffic";
import { Captacao } from "@/pages/Captacao";
import { Catalogo } from "@/pages/Catalogo";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { RecoverAccessPage } from "@/pages/RecoverAccessPage";
import { BusinessOnboardingPage } from "@/pages/BusinessOnboardingPage";
import { ChooseHandle } from "@/pages/ChooseHandle";
import { LegalPage } from "@/pages/LegalPage";
import NotFound from "@/pages/not-found";
import { OwnerGate } from "@/components/owner/OwnerGate";
import { Owner } from "@/pages/Owner";
import { Leads } from "@/pages/owner/Leads";
import { Assistant } from "@/pages/owner/Assistant";
import { LaunchCampaigns } from "@/pages/owner/Campaigns";
import { LaunchCampaignDetail } from "@/pages/owner/CampaignDetail";
import { LegacyCampaigns } from "@/pages/owner/LegacyCampaigns";
import { LegacyCampaignDetail } from "@/pages/owner/LegacyCampaignDetail";
import { Conversas } from "@/pages/owner/Conversas";
import { Mercado } from "@/pages/owner/Mercado";
import { Vendas } from "@/pages/owner/Vendas";
import { Comercio } from "@/pages/owner/Comercio";
import { Carteira } from "@/pages/owner/Carteira";
import { Plano } from "@/pages/owner/Plano";
import { ADVERTISING_NEW_ACTIONS_ENABLED } from "@/lib/launchPolicy";

// Serve under the artifact base path. With BASE_PATH="/" this is "".
const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Sync --vh to the stable layout viewport height.
 *
 * On Chrome Android, visualViewport.height can briefly report the reduced
 * visual area while the address bar is settling during navigation. Using that
 * transient value for the app shell permanently clips the page and leaves a
 * large white area below it. innerHeight/clientHeight is stable for the shell;
 * the chat's own scroll area handles content and keyboard changes.
 */
function useVisualViewportHeight() {
  useEffect(() => {
    const apply = () => {
      const h = Math.max(window.innerHeight, document.documentElement.clientHeight);
      document.documentElement.style.setProperty("--vh", `${h}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
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
      <p className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>Este link mudou</p>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Agora cada negócio tem o seu próprio endereço. Procura o negócio na
        página inicial para continuar a conversa.
      </p>
      <a
        href={import.meta.env.BASE_URL}
        className="px-5 py-2.5 rounded-xl font-bold text-[14px]"
        style={{ background: "var(--green)", color: "var(--surface)" }}
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
          <Route path="/configurar-negocio" component={BusinessOnboardingPage} />
          <Route path="/escolher-handle" component={ChooseHandle} />
          <Route path="/ligar-conta">{() => <Redirect to="/login" />}</Route>
          <Route path="/termos" component={() => <LegalPage kind="terms" />} />
          <Route path="/privacidade" component={() => <LegalPage kind="privacy" />} />
          <Route path="/dono"><LegacyOwnerRedirect /></Route>
          <Route path="/conversas">
              <div className="h-[100svh] w-full flex flex-col overflow-hidden">
              <LegacyLinkNotice />
            </div>
          </Route>
          <Route path="/captacao">
              <div className="h-[100svh] w-full flex flex-col overflow-hidden">
              <LegacyLinkNotice />
            </div>
          </Route>

          {/* ── Canonical public catalog: https://dominio/<handle> ───────────── */}
          <Route path="/:handle" component={Catalogo} />

          {/* ── All other routes: full-screen dark wrapper ───────────────────── */}
          <Route>
            {() => (
              <div
                  className="h-[100svh] w-full flex flex-col overflow-hidden"
                style={{ background: "var(--bg)" }}
              >
                <Switch>
                  {/* Legacy user profile URL → canonical short catalog URL */}
                  <Route path="/u/:handle"><LegacyUserProfileRedirect /></Route>

                  {/* Legacy generic conversations — /u/:handle covers this now */}
                  {/* ── Owner panel (protected by OwnerGate) ─────────────────── */}
                  <Route path="/e/:businessSlug/dono/leads">{() => <OwnerGate><Leads /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/conversas">{() => <OwnerGate><Conversas /></OwnerGate>}</Route>
                   <Route path="/e/:businessSlug/dono/assistente">{() => <OwnerGate><Assistant /></OwnerGate>}</Route>
                   <Route path="/e/:businessSlug/dono/campanhas/historico">{() => <OwnerGate><LegacyCampaigns /></OwnerGate>}</Route>
                   <Route path="/e/:businessSlug/dono/campanhas/:id">{() => <OwnerGate>{ADVERTISING_NEW_ACTIONS_ENABLED ? <LegacyCampaignDetail /> : <LaunchCampaignDetail />}</OwnerGate>}</Route>
                   <Route path="/e/:businessSlug/dono/campanhas">{() => <OwnerGate><LaunchCampaigns /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/mercado">{() => <OwnerGate><Mercado /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/vendas">{() => <OwnerGate><Vendas /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/comercio">{() => <OwnerGate><Comercio /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/carteira">{() => <OwnerGate><Carteira /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/plano">{() => <OwnerGate><Plano /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono">{() => <OwnerGate><Owner /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/captacao" component={Captacao} />
                  <Route path="/e/:businessSlug/t/:publicSlug" component={PublicTraffic} />
                  <Route path="/e/:businessSlug" component={Chat} />

                  {/* ── Legacy single-tenant /dono/* → smart redirect ──────── */}
                  <Route path="/dono/leads"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/conversas"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/assistente"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/campanhas/historico"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/campanhas/:id"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/campanhas"><LegacyOwnerRedirect /></Route>
                  {/* Fallback */}
                  <Route component={NotFound} />
                </Switch>
              </div>
            )}
          </Route>
        </Switch>
      </Router>
    </AuthProvider>
  );
}
