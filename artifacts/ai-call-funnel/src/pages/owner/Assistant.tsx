/**
 * Assistente Vivo — conversa WhatsApp-style entre o dono e o agente Gemini.
 * Suporta: perguntas em linguagem natural, mensagens proativas, ações com
 * confirmação e rascunhos prontos a copiar.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Zap,
  Trash2,
  BarChart2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Loader2,
  Bell,
} from "lucide-react";
import { businessApi, type AssistantMessage } from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { ChatInput } from "../../components/ChatInput";
import { OwnerNav } from "../../components/owner/OwnerNav";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-AO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Renders **bold** and line breaks from simple markdown. */
function renderContent(text: string) {
  // Split by bold markers
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold">
            {part}
          </strong>
        ) : (
          <span key={i}>
            {part.split("\n").map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </span>
        ),
      )}
    </>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1 text-xs text-[#00BFA5] hover:text-[#02D4B5] transition-colors mt-2"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copiado!" : "Copiar mensagem"}
    </button>
  );
}

// ─── Bubble ───────────────────────────────────────────────────────────────────

function AssistantBubble({
  msg,
  onConfirm,
}: {
  msg: AssistantMessage;
  onConfirm?: (messageId: string, confirmed: boolean) => void;
}) {
  const isUser = msg.role === "user";
  const isProactive = msg.role === "proactive";

  // Proactive: centre pill style
  if (isProactive) {
    return (
      <div className="flex justify-center my-3 px-4 message-enter">
        <div
          className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm"
          style={{
            background: "linear-gradient(135deg, #1A2B1F 0%, #0F1E15 100%)",
            border: "1px solid rgba(0,191,165,0.2)",
            color: "#C8F0E0",
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5 text-[#00BFA5] text-xs font-medium">
            <Bell size={11} />
            Alerta do Assistente
          </div>
          <p className="leading-relaxed">{renderContent(msg.content)}</p>
          <p className="text-[10px] mt-1.5 text-right" style={{ color: "#3E576F" }}>
            {formatTime(msg.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  const bubbleBg = isUser
    ? "linear-gradient(135deg, #1C5140 0%, #12362A 100%)"
    : "linear-gradient(135deg, #172438 0%, #10192C 100%)";
  const textColor = isUser ? "#C8F5E2" : "#C8DCF0";
  const tailColor = isUser ? "#12362A" : "#10192C";
  const borderColor = isUser
    ? "1px solid rgba(0,200,150,0.12)"
    : "1px solid rgba(100,150,220,0.08)";

  const hasDraft = !!msg.meta?.draftMessage;
  const hasAction = !!msg.meta?.pendingAction;

  return (
    <div className={`flex mb-2 message-enter ${isUser ? "justify-end" : "justify-start"} px-3`}>
      {/* Zap avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-[#1A2B3D] flex items-center justify-center mr-2 mt-auto mb-1 flex-shrink-0">
          <Zap size={13} className="text-[#00BFA5]" />
        </div>
      )}

      <div className="max-w-[78%] flex flex-col">
        <div
          className="relative px-3.5 py-2.5 shadow-lg"
          style={{
            background: bubbleBg,
            borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
            border: borderColor,
            wordBreak: "break-word",
          }}
        >
          <p className="text-[14px] leading-[1.55]" style={{ color: textColor }}>
            {renderContent(msg.content)}
          </p>

          {/* Draft message copy button */}
          {hasDraft && <CopyButton text={msg.meta.draftMessage!} />}

          {/* Pending action confirmation */}
          {hasAction && onConfirm && (
            <div className="mt-3 pt-2.5 border-t border-white/10">
              <p className="text-xs text-[#3E576F] mb-2">{msg.meta.pendingAction!.description}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => onConfirm(msg.id, true)}
                  className="flex items-center gap-1.5 text-xs bg-emerald-600/20 text-emerald-300 border border-emerald-600/30 rounded-lg px-3 py-1.5 hover:bg-emerald-600/30 transition-colors"
                >
                  <CheckCircle2 size={12} />
                  Confirmar
                </button>
                <button
                  onClick={() => onConfirm(msg.id, false)}
                  className="flex items-center gap-1.5 text-xs bg-red-600/10 text-red-400 border border-red-600/20 rounded-lg px-3 py-1.5 hover:bg-red-600/20 transition-colors"
                >
                  <XCircle size={12} />
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <p className="text-[10px] mt-1 text-right" style={{ color: "#3E576F" }}>
            {formatTime(msg.createdAt)}
          </p>

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
    </div>
  );
}

// ─── Quick action chips ───────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Resumo de hoje", text: "Dá-me o resumo de hoje" },
  { label: "Leads qualificados", text: "Quais os leads qualificados agora?" },
  { label: "Melhor lead", text: "Qual é o lead com maior pontuação?" },
  { label: "Leads parados", text: "Há leads qualificados sem follow-up?" },
  { label: "Rascunho de mensagem", text: "Preciso de ajuda para rascunhar uma mensagem para o lead mais recente" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function Assistant() {
  const slug = useBusinessSlug();
  const api = useMemo(() => (slug ? businessApi(slug) : null), [slug]);

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToZaptom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, []);

  // Load history
  useEffect(() => {
    if (!api) return;
    api
      .listAssistantMessages()
      .then(({ messages: data }) => setMessages(data))
      .catch(() => setError("Não foi possível carregar o histórico"))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    if (messages.length > 0) scrollToZaptom();
  }, [messages, scrollToZaptom]);

  // SSE for proactive messages from other tabs / server events
  useEffect(() => {
    if (!api) return;
    const es = new EventSource(api.getAssistantEventsUrl());
    eventSourceRef.current = es;

    es.addEventListener("message", (e) => {
      const msg = JSON.parse((e as MessageEvent).data) as AssistantMessage;
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    return () => es.close();
  }, [api]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !api) return;

    setInput("");
    setSending(true);
    setError(null);

    // Optimistic user message
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg: AssistantMessage = {
      id: optimisticId,
      role: "user",
      content: text,
      meta: {},
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    scrollToZaptom();

    try {
      const { message: reply } = await api.sendAssistantMessage(text);
      // Replace optimistic with real message from server (history reload)
      const { messages: fresh } = await api.listAssistantMessages();
      setMessages(fresh);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError(err instanceof Error ? err.message : "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  }, [input, sending, scrollToZaptom, api]);

  const handleConfirm = useCallback(
    async (messageId: string, confirmed: boolean) => {
      if (!api) return;
      setConfirming(messageId);
      try {
        await api.confirmAssistantAction(messageId, confirmed);
        const { messages: fresh } = await api.listAssistantMessages();
        setMessages(fresh);
      } catch {
        setError("Não foi possível executar a ação");
      } finally {
        setConfirming(null);
      }
    },
    [api],
  );

  const handleClear = useCallback(async () => {
    if (!api) return;
    if (!window.confirm("Limpar todo o histórico da conversa?")) return;
    await api.clearAssistantMessages();
    setMessages([]);
  }, [api]);

  const handleDailySummary = useCallback(async () => {
    if (!api) return;
    try {
      const { message } = await api.triggerDailySummary();
      setMessages((prev) => [...prev, message]);
      scrollToZaptom();
    } catch {
      setError("Não foi possível gerar o resumo");
    }
  }, [scrollToZaptom, api]);

  const handleStaleCheck = useCallback(async () => {
    if (!api) return;
    try {
      const { message, found } = await api.triggerStaleLeadsCheck();
      if (message) {
        setMessages((prev) => [...prev, message]);
        scrollToZaptom();
      } else if (!found) {
        setError("Nenhum lead parado encontrado 👍");
        setTimeout(() => setError(null), 3000);
      }
    } catch {
      setError("Não foi possível verificar leads parados");
    }
  }, [scrollToZaptom, api]);

  const isEmpty = messages.length === 0 && !loading;

  if (!slug) return null;

  return (
    <div className="flex flex-col h-full bg-[#080E18]">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0"
        style={{ background: "#111B27" }}
      >
        <Link href={`/e/${slug}/dono`} className="text-[#3E576F] hover:text-[#EAF0F7]">
          <ArrowLeft size={20} />
        </Link>
        <div className="w-9 h-9 rounded-full bg-[#00BFA5]/15 flex items-center justify-center flex-shrink-0">
          <Zap size={18} className="text-[#00BFA5]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#EAF0F7] text-sm">Assistente Vivo</p>
          <p className="text-xs text-[#3E576F]">Powered by Gemini · dados reais</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDailySummary}
            className="text-[#3E576F] hover:text-[#EAF0F7] transition-colors"
            title="Resumo diário"
          >
            <BarChart2 size={16} />
          </button>
          <button
            onClick={handleClear}
            className="text-[#3E576F] hover:text-[#EAF0F7] transition-colors"
            title="Limpar histórico"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex-shrink-0">
          <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-300">{error}</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3 min-h-0">
        {loading && (
          <div className="flex items-center justify-center h-20">
            <Loader2 size={18} className="text-[#3E576F] animate-spin" />
          </div>
        )}

        {/* Empty state with quick action chips */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full px-4 gap-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-[#00BFA5]/10 flex items-center justify-center mx-auto">
                <Zap size={26} className="text-[#00BFA5]" />
              </div>
              <p className="text-sm text-[#EAF0F7] font-medium">O teu assistente de negócios</p>
              <p className="text-xs text-[#3E576F] max-w-[260px] mx-auto">
                Pergunta qualquer coisa sobre os teus leads, métricas e negócio — em linguagem natural.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => {
                    setInput(a.text);
                  }}
                  className="text-xs bg-[#111B27] border border-white/10 text-[#B0C4D8] rounded-full px-3 py-1.5 hover:border-[#00BFA5]/40 hover:text-[#00BFA5] transition-colors"
                >
                  {a.label}
                </button>
              ))}
            </div>
            {/* Proactive shortcuts */}
            <div className="flex gap-2">
              <button
                onClick={handleDailySummary}
                className="text-xs bg-[#00BFA5]/10 border border-[#00BFA5]/20 text-[#00BFA5] rounded-lg px-3 py-1.5 hover:bg-[#00BFA5]/20 transition-colors"
              >
                📊 Resumo do dia
              </button>
              <button
                onClick={handleStaleCheck}
                className="text-xs bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-lg px-3 py-1.5 hover:bg-yellow-500/20 transition-colors"
              >
                ⏰ Leads parados
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <AssistantBubble
            key={msg.id}
            msg={msg}
            onConfirm={
              msg.meta?.pendingAction && !confirming
                ? handleConfirm
                : undefined
            }
          />
        ))}

        {/* Typing indicator while waiting for response */}
        {sending && (
          <div className="flex items-center gap-2 px-3 mb-2">
            <div className="w-7 h-7 rounded-full bg-[#1A2B3D] flex items-center justify-center flex-shrink-0">
              <Zap size={13} className="text-[#00BFA5]" />
            </div>
            <div
              className="px-3.5 py-2.5 rounded-lg"
              style={{
                background: "linear-gradient(135deg, #172438 0%, #10192C 100%)",
                border: "1px solid rgba(100,150,220,0.08)",
              }}
            >
              <div className="flex items-center gap-[5px] px-1 py-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="typing-dot w-2 h-2 rounded-full inline-block"
                    style={{ background: "#00C896", animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSend={() => void handleSend()}
        disabled={sending}
      />
      <OwnerNav />
    </div>
  );
}
