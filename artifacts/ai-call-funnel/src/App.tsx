import { Chat } from "@/pages/Chat";

export default function App() {
  return (
    <div
      className="flex items-center justify-center w-full bg-[#040810]"
      style={{ minHeight: "100dvh" }}
    >
      {/* Center card on desktop; full screen on mobile */}
      <div
        className="relative w-full bg-[#080E18] flex flex-col overflow-hidden"
        style={{
          maxWidth: "430px",
          height: "100dvh",
          /* Push up to avoid iOS home bar */
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <Chat />
      </div>
    </div>
  );
}
