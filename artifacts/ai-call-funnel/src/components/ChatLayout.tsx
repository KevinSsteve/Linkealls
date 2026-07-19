import { ReactNode } from "react";
import { Video, Phone, MoreVertical } from "lucide-react";
import { ArrowLeft } from "lucide-react";

interface ChatLayoutProps {
  children: ReactNode;
  statusBar?: ReactNode;
}

export function ChatLayout({ children, statusBar }: ChatLayoutProps) {
  return (
    <div className="flex flex-col h-full bg-[#EAE6DF] max-w-[430px] mx-auto relative">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 pt-3 pb-3 shadow-md z-10 flex-shrink-0"
        style={{ background: "linear-gradient(135deg, #1F2C34 0%, #182228 100%)" }}
      >
        {/* Back arrow */}
        <button className="text-gray-300 hover:text-white transition-colors p-1 -ml-1">
          <ArrowLeft size={22} />
        </button>

        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00A884] to-[#008069] flex items-center justify-center shadow-md">
            <span className="text-white text-lg font-bold">A</span>
          </div>
          {/* Online dot */}
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#00A884] rounded-full border-2 border-[#1F2C34]" />
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-[15px] leading-tight truncate">
            Assistente IA
          </p>
          <p className="text-[#8696A0] text-[12px] leading-tight">online</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 text-[#8696A0]">
          <Video size={21} className="cursor-pointer hover:text-white transition-colors" />
          <Phone size={20} className="cursor-pointer hover:text-white transition-colors" />
          <MoreVertical size={21} className="cursor-pointer hover:text-white transition-colors" />
        </div>
      </div>

      {/* Optional status bar (e.g. call timer) */}
      {statusBar}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
