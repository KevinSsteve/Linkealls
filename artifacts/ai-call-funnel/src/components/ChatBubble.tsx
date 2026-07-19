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
          className="text-[11px] px-3 py-1 rounded-full"
          style={{
            background: "rgba(255,200,80,0.1)",
            color: "#A07C30",
            border: "1px solid rgba(255,200,80,0.15)",
          }}
        >
          {text}
        </span>
      </div>
    );
  }

  const isUser = role === "user";

  const bubbleBg = isUser
    ? "linear-gradient(135deg, #1C5140 0%, #12362A 100%)"
    : "linear-gradient(135deg, #172438 0%, #10192C 100%)";

  const textColor = isUser ? "#C8F5E2" : "#C8DCF0";
  const tailColor = isUser ? "#12362A" : "#10192C";

  return (
    <div className={`flex message-enter mb-1 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="relative max-w-[78%] px-3.5 py-2.5 shadow-lg"
        style={{
          background: bubbleBg,
          borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
          border: isUser
            ? "1px solid rgba(0,200,150,0.12)"
            : "1px solid rgba(100,150,220,0.08)",
          wordBreak: "break-word",
        }}
      >
        {isTyping ? (
          <div className="flex items-center gap-[5px] px-1 py-1">
            <span
              className="typing-dot w-2 h-2 rounded-full inline-block"
              style={{ background: "#00C896" }}
            />
            <span
              className="typing-dot w-2 h-2 rounded-full inline-block"
              style={{ background: "#00C896" }}
            />
            <span
              className="typing-dot w-2 h-2 rounded-full inline-block"
              style={{ background: "#00C896" }}
            />
          </div>
        ) : (
          <p
            className="text-[14.5px] leading-[1.5]"
            style={{ color: textColor }}
          >
            {text}
          </p>
        )}

        {/* Tail */}
        {isUser ? (
          <svg
            className="absolute -right-[6px] bottom-0"
            width="8" height="12" viewBox="0 0 8 12" fill="none"
          >
            <path d="M7 0C7 0 0 5 0 12C3 12 7 9.5 7 9.5L7 0Z" fill={tailColor} />
          </svg>
        ) : (
          <svg
            className="absolute -left-[6px] bottom-0"
            width="8" height="12" viewBox="0 0 8 12" fill="none"
          >
            <path d="M1 0C1 0 8 5 8 12C5 12 1 9.5 1 9.5L1 0Z" fill={tailColor} />
          </svg>
        )}
      </div>
    </div>
  );
}
