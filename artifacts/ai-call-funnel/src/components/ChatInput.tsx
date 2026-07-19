import { useRef } from "react";
import { Send, Mic } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export function ChatInput({ value, onChange, onSend, disabled }: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const isEmpty = value.trim().length === 0;

  return (
    <div className="flex items-end gap-2 px-3 py-2 bg-[#F0F2F5]">
      {/* Text area */}
      <div className="flex-1 bg-white rounded-full flex items-center min-h-[44px] px-4 shadow-sm">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled}
          rows={1}
          placeholder="Mensagem"
          className="flex-1 bg-transparent resize-none outline-none text-[14.5px] text-[#111B21] placeholder:text-gray-400 leading-[1.5] py-2.5 max-h-[120px] overflow-y-auto"
          style={{ scrollbarWidth: "none" }}
        />
      </div>

      {/* Send / Mic button */}
      <button
        onClick={onSend}
        disabled={disabled}
        className="w-11 h-11 rounded-full flex items-center justify-center shadow-md flex-shrink-0 transition-all active:scale-95"
        style={{ backgroundColor: "#00A884" }}
      >
        {isEmpty ? (
          <Mic size={20} className="text-white" />
        ) : (
          <Send size={18} className="text-white translate-x-[1px]" />
        )}
      </button>
    </div>
  );
}
