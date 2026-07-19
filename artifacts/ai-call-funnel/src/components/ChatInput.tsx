import { useRef, useEffect } from "react";
import { Send, Mic } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export function ChatInput({ value, onChange, onSend, disabled }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Auto-resize textarea */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const isEmpty = value.trim().length === 0;

  return (
    <div
      className="flex items-end gap-2.5 flex-shrink-0"
      style={{
        background: "linear-gradient(180deg, #080F1C 0%, #060C14 100%)",
        borderTop: "1px solid #111E30",
        padding: "10px 14px",
      }}
    >
      {/* Text field */}
      <div
        className="flex-1 flex items-end gap-2 rounded-2xl px-4 py-2.5 min-h-[44px]"
        style={{
          background: "#10192A",
          border: "1px solid #1C2E45",
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled}
          placeholder="Mensagem"
          className="flex-1 bg-transparent outline-none resize-none text-[14.5px] leading-[1.5] py-0.5"
          style={{
            color: "#EAF0F7",
            caretColor: "#00C896",
            maxHeight: "120px",
            scrollbarWidth: "none",
          }}
        />
      </div>

      {/* Send / Mic */}
      <button
        onClick={onSend}
        disabled={disabled}
        className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 disabled:opacity-40"
        style={{
          background: isEmpty
            ? "linear-gradient(135deg, #1C2E45 0%, #141E2C 100%)"
            : "linear-gradient(135deg, #00C896 0%, #007A5C 100%)",
          boxShadow: isEmpty ? "none" : "0 4px 16px rgba(0,200,150,0.3)",
          color: isEmpty ? "#7B96B2" : "#fff",
        }}
      >
        {isEmpty ? <Mic size={19} /> : <Send size={17} className="translate-x-[1px]" />}
      </button>
    </div>
  );
}
