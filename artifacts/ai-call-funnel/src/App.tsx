import { useEffect } from "react";
import { Router, Route, Switch, Redirect } from "wouter";
import { AuthProvider } from "@/context/AuthContext";
import { HomePage } from "@/pages/HomePage";
import { Chat } from "@/pages/Chat";
import { Captacao } from "@/pages/Captacao";
import { Catalogo } from "@/pages/Catalogo";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { Owner } from "@/pages/Owner";
import { Leads } from "@/pages/owner/Leads";
import { Assistant } from "@/pages/owner/Assistant";
import { Campaigns } from "@/pages/owner/Campaigns";
import { CampaignDetail } from "@/pages/owner/CampaignDetail";
import { Conversas } from "@/pages/owner/Conversas";
import { UserConversas } from "@/pages/UserConversas";

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

                  {/* User conversations */}
                  <Route path="/conversas" component={UserConversas} />

                  {/* ── Multi-tenant routes (/e/:businessSlug/...) ─────────── */}
                  <Route path="/e/:businessSlug/dono/leads" component={Leads} />
                  <Route path="/e/:businessSlug/dono/conversas" component={Conversas} />
                  <Route path="/e/:businessSlug/dono/assistente" component={Assistant} />
                  <Route path="/e/:businessSlug/dono/campanhas/:id" component={CampaignDetail} />
                  <Route path="/e/:businessSlug/dono/campanhas" component={Campaigns} />
                  <Route path="/e/:businessSlug/dono" component={Owner} />
                  <Route path="/e/:businessSlug/captacao" component={Captacao} />
                  <Route path="/e/:businessSlug" component={Chat} />

                  {/* ── Legacy single-tenant routes → redirect to home ──────── */}
                  <Route path="/dono/leads"><Redirect to="/" /></Route>
                  <Route path="/dono/conversas"><Redirect to="/" /></Route>
                  <Route path="/dono/assistente"><Redirect to="/" /></Route>
                  <Route path="/dono/campanhas/:id"><Redirect to="/" /></Route>
                  <Route path="/dono/campanhas"><Redirect to="/" /></Route>
                  <Route path="/dono"><Redirect to="/" /></Route>

                  {/* Lead capture legacy */}
                  <Route path="/captacao"><Redirect to="/" /></Route>

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
