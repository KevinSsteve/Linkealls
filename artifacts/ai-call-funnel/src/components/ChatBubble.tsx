export type BubbleRole = "user" | "bot" | "system";

interface ChatBubbleProps {
  role: BubbleRole;
  text: string;
  isTyping?: boolean;
}

export function ChatBubble({ role, text, isTyping }: ChatBubbleProps) {
  /* ── System (centre pill) ── */
  if (role === "system") {
    return (
      <div className="flex justify-center my-3 message-enter">
        <span
          className="text-[11px] px-3 py-1.5 rounded-full shadow-sm"
          style={{
            background: "rgba(255,255,255,0.85)",
            color: "#8696A0",
            backdropFilter: "blur(4px)",
          }}
        >
          {text}
        </span>
      </div>
    );
  }

  const isUser = role === "user";

  /* WA Business exact colors */
  const bubbleBg    = isUser ? "#D9FDD3" : "#FFFFFF";
  const textColor   = "#111B21";
  const tailColor   = isUser ? "#D9FDD3" : "#FFFFFF";

  return (
    <div className={`flex message-enter mb-1 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="relative max-w-[78%] px-3.5 py-2.5"
        style={{
          background: bubbleBg,
          borderRadius: isUser ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.13)",
          wordBreak: "break-word",
        }}
      >
        {isTyping ? (
          <div className="flex items-center gap-[5px] px-1 py-1">
            <span className="typing-dot w-2 h-2 rounded-full inline-block" style={{ background: "#8696A0" }} />
            <span className="typing-dot w-2 h-2 rounded-full inline-block" style={{ background: "#8696A0" }} />
            <span className="typing-dot w-2 h-2 rounded-full inline-block" style={{ background: "#8696A0" }} />
          </div>
        ) : (
          <p className="text-[14.5px] leading-[1.5]" style={{ color: textColor }}>
            {text}
          </p>
        )}

        {/* Tail */}
        {isUser ? (
          <svg className="absolute -right-[6px] bottom-0" width="8" height="12" viewBox="0 0 8 12" fill="none">
            <path d="M7 0C7 0 0 5 0 12C3 12 7 9.5 7 9.5L7 0Z" fill={tailColor} />
          </svg>
        ) : (
          <svg className="absolute -left-[6px] bottom-0" width="8" height="12" viewBox="0 0 8 12" fill="none">
            <path d="M1 0C1 0 8 5 8 12C5 12 1 9.5 1 9.5L1 0Z" fill={tailColor} />
          </svg>
        )}
      </div>
    </div>
  );
}
