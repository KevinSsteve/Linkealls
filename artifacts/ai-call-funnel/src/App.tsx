import { useEffect } from "react";
import { Router, Route, Switch } from "wouter";
import { AuthProvider } from "@/context/AuthContext";
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
import { OwnerGate } from "@/components/owner/OwnerGate";

// Serve under the artifact base path (e.g. /ai-call-funnel) in dev and prod.
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
          {/* ── Public catalog: light theme, no dark wrapper ── */}
          <Route path="/catalogo" component={Catalogo} />
          <Route path="/c/:slug" component={Catalogo} />

          {/* ── All other routes: dark wrapper ── */}
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

                  {/* Owner (PIN-protected) */}
                  <Route path="/dono/leads">{() => <OwnerGate><Leads /></OwnerGate>}</Route>
                  <Route path="/dono/conversas">{() => <OwnerGate><Conversas /></OwnerGate>}</Route>
                  <Route path="/dono/assistente">{() => <OwnerGate><Assistant /></OwnerGate>}</Route>
                  <Route path="/dono/campanhas/:id">{() => <OwnerGate><CampaignDetail /></OwnerGate>}</Route>
                  <Route path="/dono/campanhas">{() => <OwnerGate><Campaigns /></OwnerGate>}</Route>
                  <Route path="/dono">{() => <OwnerGate><Owner /></OwnerGate>}</Route>

                  {/* Lead capture */}
                  <Route path="/captacao" component={Captacao} />

                  {/* Default chat */}
                  <Route component={Chat} />
                </Switch>
              </div>
            )}
          </Route>
        </Switch>
      </Router>
    </AuthProvider>
  );
}
