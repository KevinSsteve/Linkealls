export type BubbleRole = "user" | "bot" | "system";

interface ChatBubbleProps {
  role: BubbleRole;
  text: string;
  isTyping?: boolean;
}

export function ChatBubble({ role, text, isTyping }: ChatBubbleProps) {
  if (role === "system") {
    return (
      <div className="flex justify-center my-2 message-enter">
        <span className="bg-[#FFF3CD] text-[#856404] text-xs px-3 py-1 rounded-full shadow-sm">
          {text}
        </span>
      </div>
    );
  }

  const isUser = role === "user";

  return (
    <div className={`flex message-enter ${isUser ? "justify-end" : "justify-start"} mb-1`}>
      <div
        className={`relative max-w-[78%] px-3 py-2 shadow-sm ${
          isUser
            ? "bg-[#DCF8C6] rounded-[16px_4px_16px_16px]"
            : "bg-white rounded-[4px_16px_16px_16px]"
        }`}
        style={{ wordBreak: "break-word" }}
      >
        {isTyping ? (
          <div className="flex items-center gap-1 px-1 py-0.5 h-5">
            <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
            <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
            <span className="typing-dot w-2 h-2 rounded-full bg-gray-400 inline-block" />
          </div>
        ) : (
          <p className="text-[14.5px] text-[#111B21] leading-[1.45]">{text}</p>
        )}
        {/* Tail pointer */}
        {isUser ? (
          <svg
            className="absolute -right-[6px] bottom-0"
            width="8" height="13" viewBox="0 0 8 13"
            fill="none" xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M7 0C7 0 0 6 0 13C3 13 7 10 7 10L7 0Z" fill="#DCF8C6" />
          </svg>
        ) : (
          <svg
            className="absolute -left-[6px] bottom-0"
            width="8" height="13" viewBox="0 0 8 13"
            fill="none" xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M1 0C1 0 8 6 8 13C5 13 1 10 1 10L1 0Z" fill="white" />
          </svg>
        )}
      </div>
    </div>
  );
}
