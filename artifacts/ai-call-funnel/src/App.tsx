import { useEffect } from "react";
import { Router, Route, Switch } from "wouter";
import { Chat } from "@/pages/Chat";
import { Captacao } from "@/pages/Captacao";
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
    <div
      className="w-full bg-[#080E18] flex flex-col overflow-hidden"
      style={{ height: "var(--vh, 100dvh)" }}
    >
      <Router base={routerBase}>
        <Switch>
          <Route path="/dono/leads">{() => <OwnerGate><Leads /></OwnerGate>}</Route>
          <Route path="/dono/conversas">{() => <OwnerGate><Conversas /></OwnerGate>}</Route>
          <Route path="/dono/assistente">{() => <OwnerGate><Assistant /></OwnerGate>}</Route>
          <Route path="/dono/campanhas/:id">{() => <OwnerGate><CampaignDetail /></OwnerGate>}</Route>
          <Route path="/dono/campanhas">{() => <OwnerGate><Campaigns /></OwnerGate>}</Route>
          <Route path="/dono">{() => <OwnerGate><Owner /></OwnerGate>}</Route>
          <Route path="/captacao" component={Captacao} />
          <Route component={Chat} />
        </Switch>
      </Router>
    </div>
  );
}
