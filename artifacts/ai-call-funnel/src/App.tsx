import { Chat } from "@/pages/Chat";

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
      <Chat />
    </div>
  );
}
