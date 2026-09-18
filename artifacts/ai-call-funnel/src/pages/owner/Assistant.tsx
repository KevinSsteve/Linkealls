/**
 * Assistente Vivo — tema claro estilo WhatsApp Business.
 * Área de mensagens com fundo de papel #E5DDD5, bolhas verdes (dono) e
 * brancas (IA), campo de texto limpo em branco.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Zap, Trash2, BarChart2, AlertCircle,
  CheckCircle2, XCircle, Copy, Check, Loader2, Bell, Send,
} from "lucide-react";
import { businessApi, confirmSensitiveAction, type AssistantMessage } from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { C } from "../../theme";
import { AppHeader, AppIconButton } from "../../components/app/AppHeader";
import { NONESSENTIAL_SUMMARIES_ENABLED } from "../../lib/launchPolicy";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" });
}

function renderContent(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold">{part}</strong>
        ) : (
          <span key={i}>
            {part.split("\n").map((line, j, arr) => (
              <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
            ))}
          </span>
        )
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
      className="flex items-center gap-1 text-[12px] mt-2 font-medium transition-colors"
      style={{ color: copied ? "#2E7D32" : C.green }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copiado!" : "Copiar mensagem"}
    </button>
  );
}

// ─── Bubble ───────────────────────────────────────────────────────────────────
function AssistantBubble({ msg, onConfirm }: {
  msg: AssistantMessage;
  onConfirm?: (id: string, confirmed: boolean) => void;
}) {
  const isUser = msg.role === "user";
  const isProactive = msg.role === "proactive";

  if (isProactive) {
    return (
      <div className="flex justify-center my-3 px-4">
        <div
          className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px]"
          style={{ background: "#E8F5E9", border: "1px solid #C8E6C9", color: "#1B5E20" }}
        >
          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold"
            style={{ color: "#2E7D32" }}>
            <Bell size={11} /> Alerta do Assistente
          </div>
          <p className="leading-relaxed">{renderContent(msg.content)}</p>
          <p className="text-[10px] mt-1.5 text-right" style={{ color: C.text3 }}>
            {formatTime(msg.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  const hasDraft = !!msg.meta?.draftMessage;
  const hasAllowedAction = msg.meta?.pendingAction?.type === "update_lead_state";

  return (
    <div className={`flex mb-1.5 ${isUser ? "justify-end" : "justify-start"} px-3`}>
      {/* AI avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full flex items-center justify-center mr-2 mt-auto mb-1 shrink-0"
          style={{ background: "#E8F5E9" }}>
          <Zap size={13} style={{ color: C.green }} />
        </div>
      )}

      <div className="max-w-[78%] flex flex-col">
        <div
          className="relative px-3.5 py-2.5"
          style={{
            background: isUser ? C.bubOut : C.bubIn,
            borderRadius: isUser ? "8px 2px 8px 8px" : "2px 8px 8px 8px",
            color: C.text,
            boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            wordBreak: "break-word",
          }}
        >
          <p className="text-[14px] leading-[1.55]">{renderContent(msg.content)}</p>

          {hasDraft && <CopyButton text={msg.meta.draftMessage!} />}
          {hasAllowedAction && onConfirm && (
            <div className="mt-3 border-t pt-2.5" style={{ borderColor: C.border }}>
              <p className="mb-2 text-[12px]" style={{ color: C.text3 }}>{msg.meta!.pendingAction!.description}</p>
              <div className="flex gap-2">
                <button onClick={() => onConfirm(msg.id, true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium" style={{ background: "#E8F5E9", color: "#1B5E20", border: "1px solid #A5D6A7" }}>
                  <CheckCircle2 size={12} /> Confirmar
                </button>
                <button onClick={() => onConfirm(msg.id, false)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium" style={{ background: "#FFEBEE", color: "#C62828", border: "1px solid #FFCDD2" }}>
                  <XCircle size={12} /> Cancelar
                </button>
              </div>
            </div>
          )}

          <p className="text-[10px] mt-1 text-right" style={{ color: C.text3 }}>
            {formatTime(msg.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Quick actions ────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "Leads qualificados",   text: "Quais os leads qualificados agora?" },
  { label: "Melhor lead",          text: "Qual é o lead com maior pontuação?" },
  { label: "Rascunho de mensagem", text: "Preciso de ajuda para rascunhar uma mensagem para o lead mais recente" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, []);

  useEffect(() => {
    if (!api) return;
    api.listAssistantMessages()
      .then(({ messages: data }) => setMessages(data))
      .catch(() => setError("Não foi possível carregar o histórico"))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => { if (messages.length > 0) scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!api) return;
    const es = new EventSource(api.getAssistantEventsUrl());
    es.addEventListener("message", (e) => {
      const msg = JSON.parse((e as MessageEvent).data) as AssistantMessage;
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
    });
    return () => es.close();
  }, [api]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !api) return;
    setInput(""); setSending(true); setError(null);

    const optimisticId = `opt-${Date.now()}`;
    const optimistic: AssistantMessage = {
      id: optimisticId, role: "user", content: text, meta: {},
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    scrollToBottom();

    try {
      await api.sendAssistantMessage(text);
      const { messages: fresh } = await api.listAssistantMessages();
      setMessages(fresh);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, sending, scrollToBottom, api]);

  const handleConfirm = useCallback(async (messageId: string, confirmed: boolean) => {
    if (!api) return;
    if (confirmed && !(await confirmSensitiveAction())) return;
    setConfirming(messageId);
    try {
      await api.confirmAssistantAction(messageId, confirmed);
      const { messages: fresh } = await api.listAssistantMessages();
      setMessages(fresh);
    } catch {
      setError("Não foi possível actualizar o contacto");
    } finally {
      setConfirming(null);
    }
  }, [api]);

  const handleClear = useCallback(async () => {
    if (!api || !window.confirm("Limpar todo o histórico da conversa?")) return;
    await api.clearAssistantMessages();
    setMessages([]);
  }, [api]);

  const handleDailySummary = useCallback(async () => {
    if (!api || !NONESSENTIAL_SUMMARIES_ENABLED) return;
    try {
      const { message } = await api.triggerDailySummary();
      setMessages((prev) => [...prev, message]);
      scrollToBottom();
    } catch {
      setError("Não foi possível gerar o resumo");
    }
  }, [api, scrollToBottom]);

  const handleStaleCheck = useCallback(async () => {
    if (!api || !NONESSENTIAL_SUMMARIES_ENABLED) return;
    try {
      const { message, found } = await api.triggerStaleLeadsCheck();
      if (message) {
        setMessages((prev) => [...prev, message]);
        scrollToBottom();
      } else if (!found) {
        setError("Nenhum contacto parado encontrado");
      }
    } catch {
      setError("Não foi possível verificar contactos parados");
    }
  }, [api, scrollToBottom]);

  const isEmpty = messages.length === 0 && !loading;

  if (!slug) return null;

  return (
    <div className="owner-view-root wa-page" style={{ background: C.bg }}>
      <AppHeader
        variant="dark"
        title="Assistente Vivo"
        subtitle="● online · Powered by Gemini"
        leading={
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: C.green }}>
            <Zap size={17} className="text-white" strokeWidth={2} />
          </div>
        }
        actions={<>
          {NONESSENTIAL_SUMMARIES_ENABLED && (
            <AppIconButton label="Resumo diário" onClick={handleDailySummary}>
              <BarChart2 size={18} strokeWidth={1.8} />
            </AppIconButton>
          )}
          <AppIconButton label="Limpar histórico" onClick={handleClear}>
            <Trash2 size={18} strokeWidth={1.8} />
          </AppIconButton>
        </>}
      />

      {/* ── Error toast ───────────────────────────────────────────────────── */}
      {error && (
        <div
          className="shrink-0 flex items-center gap-2 text-[13px]"
          style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 10, margin: "12px 16px 0", padding: "10px 14px" }}
        >
          <AlertCircle size={14} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><XCircle size={14} /></button>
        </div>
      )}

      {/* ── Messages ─────────────────────────────────────────────────────── */}
      <div className="owner-content-scroll py-3 min-h-0" style={{ background: C.chatBg }}>
        {loading && (
          <div className="flex items-center justify-center h-20">
            <Loader2 size={18} className="animate-spin" style={{ color: C.text3 }} />
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full px-4 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: "#E8F5E9" }}>
                <Zap size={28} style={{ color: C.green }} />
              </div>
              <p className="font-semibold text-[15px]" style={{ color: C.text }}>
                O teu assistente de negócios
              </p>
              <p className="text-[13px] mt-1 max-w-[260px] mx-auto leading-relaxed" style={{ color: C.text2 }}>
                Pergunta sobre contactos qualificados, conversas, pedidos e pagamentos.
              </p>
            </div>
            {/* Quick chips */}
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_ACTIONS.map((a) => (
                <button key={a.label} onClick={() => setInput(a.text)}
                  className="text-[12px] px-3 py-1.5 rounded-full font-medium"
                  style={{ background: C.white, color: C.text2, border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
                  {a.label}
                </button>
              ))}
            </div>
            {NONESSENTIAL_SUMMARIES_ENABLED && (
              <div className="flex gap-2">
                <button onClick={handleDailySummary} className="rounded-full border border-[#C8E6C9] bg-[#E8F5E9] px-3 py-1.5 text-[12px] font-medium text-[#1B5E20]">Resumo do dia</button>
                <button onClick={handleStaleCheck} className="rounded-full border border-[#FFE082] bg-[#FFF8E1] px-3 py-1.5 text-[12px] font-medium text-[#E65100]">Contactos parados</button>
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <AssistantBubble
            key={msg.id}
            msg={msg}
            onConfirm={msg.meta?.pendingAction?.type === "update_lead_state" && !confirming ? handleConfirm : undefined}
          />
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="flex items-center gap-2 px-3 mb-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "#E8F5E9" }}>
              <Zap size={13} style={{ color: C.green }} />
            </div>
            <div className="px-3.5 py-3 rounded-[2px_8px_8px_8px]"
              style={{ background: C.bubIn, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
              <div className="flex items-center gap-[5px]">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="typing-dot w-2 h-2 rounded-full inline-block"
                    style={{ background: C.text3, animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-end gap-2 px-3 py-2"
        style={{ background: C.bg, borderTop: `1px solid ${C.border}` }}>
        <div className="flex-1 flex items-end rounded-2xl px-4 py-2.5 min-h-[44px]"
          style={{ background: C.white, border: `1px solid ${C.border}` }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
            }}
            placeholder="Mensagem"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-[15px] leading-normal"
            style={{ color: C.text, maxHeight: "120px", overflowY: "auto" }}
          />
        </div>
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-40"
          style={{ background: C.green }}
        >
          <Send size={18} className="text-white" strokeWidth={2} />
        </button>
      </div>

      <OwnerNav />
    </div>
  );
}
