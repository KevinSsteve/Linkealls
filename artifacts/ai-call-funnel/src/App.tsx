import { Router, Route, Switch } from "wouter";
import { Chat } from "@/pages/Chat";
import { Captacao } from "@/pages/Captacao";
import { Owner } from "@/pages/Owner";
import { Leads } from "@/pages/owner/Leads";
import { Assistant } from "@/pages/owner/Assistant";
import { Campaigns } from "@/pages/owner/Campaigns";
import { CampaignDetail } from "@/pages/owner/CampaignDetail";
import { Conversas } from "@/pages/owner/Conversas";

// Serve under the artifact base path (e.g. /ai-call-funnel) in dev and prod.
const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function App() {
  return (
    // Full-bleed on every screen size — no centering card, no maxWidth
    <div
      className="w-full bg-[#080E18] flex flex-col overflow-hidden"
      style={{
        height: "100dvh",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <Router base={routerBase}>
        <Switch>
          <Route path="/dono/leads" component={Leads} />
          <Route path="/dono/conversas" component={Conversas} />
          <Route path="/dono/assistente" component={Assistant} />
          <Route path="/dono/campanhas/:id" component={CampaignDetail} />
          <Route path="/dono/campanhas" component={Campaigns} />
          <Route path="/dono" component={Owner} />
          <Route path="/captacao" component={Captacao} />
          <Route component={Chat} />
        </Switch>
      </Router>
    </div>
  );
}
