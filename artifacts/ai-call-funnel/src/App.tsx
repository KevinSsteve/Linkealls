import { Chat } from "@/pages/Chat";

export default function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-900 flex items-center justify-center">
      <div className="w-full h-full max-w-[430px]">
        <Chat />
      </div>
    </div>
  );
}
