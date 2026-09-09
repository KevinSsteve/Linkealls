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
      className="flex items-end gap-2 flex-shrink-0 px-2 py-2"
      style={{
        background: "#F1F5F9",
        paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* Text field */}
      <div
        className="flex-1 flex items-center gap-2 rounded-full px-4"
        style={{
          background: "#FFFFFF",
          border: "none",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          minHeight: "44px",
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
          className="flex-1 bg-transparent outline-none resize-none leading-[1.4] py-[11px]"
          style={{
            color: "#0A2540",
            caretColor: "#635BFF",
            maxHeight: "120px",
            scrollbarWidth: "none",
            fontSize: "16px",
            lineHeight: "1.4",
          }}
        />
      </div>

      {/* Send / Mic */}
      <button
        onClick={onSend}
        disabled={disabled}
        className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 disabled:opacity-40"
        style={{
          background: "#635BFF",
          boxShadow: isEmpty ? "none" : "0 2px 8px rgba(99,91,255,0.30)",
          color: "#FFFFFF",
        }}
      >
        {isEmpty ? <Mic size={19} /> : <Send size={17} className="translate-x-[1px]" />}
      </button>
    </div>
  );
}
