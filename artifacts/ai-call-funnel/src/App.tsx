import { useEffect } from "react";
import { Router, Route, Switch, Redirect, useLocation } from "wouter";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { HomePage } from "@/pages/HomePage";
import { Chat } from "@/pages/Chat";
import { Captacao } from "@/pages/Captacao";
import { Catalogo } from "@/pages/Catalogo";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ChooseHandle } from "@/pages/ChooseHandle";
import { UserProfile } from "@/pages/UserProfile";
import { OwnerGate } from "@/components/owner/OwnerGate";
import { Owner } from "@/pages/Owner";
import { Leads } from "@/pages/owner/Leads";
import { Assistant } from "@/pages/owner/Assistant";
import { Campaigns } from "@/pages/owner/Campaigns";
import { CampaignDetail } from "@/pages/owner/CampaignDetail";
import { Conversas } from "@/pages/owner/Conversas";

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
  const { isLoggedIn, user } = useAuth();
  const [location] = useLocation();
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
  if (isLoggedIn && user?.handle) return <Redirect to={`/u/${user.handle}`} />;
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

export default function App() {
  useVisualViewportHeight();

  return (
    <AuthProvider>
      <Router base={routerBase}>
        <Switch>
          {/* ── Linkealls home — standalone light-on-dark layout ────────────── */}
          <Route path="/" component={HomePage} />

          {/* ── Public catalog (no dark full-screen wrapper) ─────────────────── */}
          <Route path="/e/:businessSlug/catalogo" component={Catalogo} />
          <Route path="/catalogo" component={Catalogo} />
          <Route path="/c/:slug" component={Catalogo} />

          {/* ── All other routes: full-screen dark wrapper ───────────────────── */}
          <Route>
            {() => (
              <div
                className="w-full bg-[#080E18] flex flex-col overflow-hidden"
                style={{ height: "var(--vh, 100dvh)" }}
              >
                <Switch>
                  {/* Auth */}
                  <Route path="/login"   component={LoginPage} />
                  <Route path="/registar" component={RegisterPage} />

                  {/* User profile & onboarding */}
                  <Route path="/escolher-handle" component={ChooseHandle} />
                  <Route path="/u/:handle" component={UserProfile} />

                  {/* Legacy generic conversations — /u/:handle covers this now */}
                  <Route path="/conversas"><LegacyLinkNotice /></Route>

                  {/* ── Owner panel (protected by OwnerGate) ─────────────────── */}
                  <Route path="/e/:businessSlug/dono/leads">{() => <OwnerGate><Leads /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/conversas">{() => <OwnerGate><Conversas /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/assistente">{() => <OwnerGate><Assistant /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/campanhas/:id">{() => <OwnerGate><CampaignDetail /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono/campanhas">{() => <OwnerGate><Campaigns /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/dono">{() => <OwnerGate><Owner /></OwnerGate>}</Route>
                  <Route path="/e/:businessSlug/captacao" component={Captacao} />
                  <Route path="/e/:businessSlug" component={Chat} />

                  {/* ── Legacy single-tenant /dono/* → smart redirect ──────── */}
                  <Route path="/dono/leads"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/conversas"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/assistente"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/campanhas/:id"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono/campanhas"><LegacyOwnerRedirect /></Route>
                  <Route path="/dono"><LegacyOwnerRedirect /></Route>

                  {/* Lead capture legacy — explain instead of failing silently */}
                  <Route path="/captacao"><LegacyLinkNotice /></Route>

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
