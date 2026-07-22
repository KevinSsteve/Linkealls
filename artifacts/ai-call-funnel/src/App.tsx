import { Router, Route, Switch } from "wouter";
import { Chat } from "@/pages/Chat";
import { Owner } from "@/pages/Owner";

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
          <Route path="/dono" component={Owner} />
          <Route component={Chat} />
        </Switch>
      </Router>
    </div>
  );
}
