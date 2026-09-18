/**
 * InlineCheckout — compact payment panel shown in the call/chat UI when the
 * AI agent initiates a Multicaixa Express checkout.
 *
 * It polls the order status every 3 s and notifies the parent once settled,
 * so the parent can forward the result to the AI agent via sendPaymentResult.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Smartphone,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";
import { simulatePayment } from "../lib/api";
import { visitorApi } from "../lib/visitorAccess";
import type { CheckoutInfo } from "../hooks/useGeminiLive";

function formatAoa(v: number): string {
  return `${v.toLocaleString("pt-AO", { maximumFractionDigits: 2 })} Kz`;
}

type PayStep = "waiting" | "paid" | "failed";

interface Props {
  businessSlug: string;
  leadId: string | null;
  checkout: CheckoutInfo;
  onDone: (orderId: string, status: string, offeringName: string) => void;
  onDismiss: () => void;
  onOrderPaid?: (orderId: string) => void;
}

export function InlineCheckout({ businessSlug, leadId, checkout, onDone, onDismiss, onOrderPaid }: Props) {
  const [step, setStep] = useState<PayStep>("waiting");
  const [busy, setBusy] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settledRef = useRef(false);
  const api = visitorApi(businessSlug);

  const settle = useCallback(
    (status: string) => {
      if (settledRef.current) return;
      settledRef.current = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setStep(status === "paga" ? "paid" : "failed");
      onDone(checkout.orderId, status, checkout.offeringName);
      if (status === "paga") {
        window.setTimeout(() => onOrderPaid?.(checkout.orderId), 1200);
      }
    },
    [checkout.orderId, checkout.offeringName, onDone],
  );

  useEffect(() => {
    if (step !== "waiting") return;
    pollRef.current = setInterval(() => {
      if (!leadId) return;
      api.getOrderStatus<{ status: string }>(checkout.orderId, leadId)
        .then((s) => {
          setPollError(null);
          if (s.status === "paga") settle("paga");
          else if (s.status === "expirada" || s.status === "falhada") settle(s.status);
        })
        .catch((err: unknown) => {
          setPollError(err instanceof Error ? err.message : "Não foi possível verificar o pagamento.");
        });
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [api, checkout.orderId, leadId, step, settle]);

  const approveSimulated = useCallback(async () => {
    setBusy(true);
    try { await simulatePayment(checkout.merchantTransactionId, true); }
    catch { /* poll will pick it up */ }
    finally { setBusy(false); }
  }, [checkout.merchantTransactionId]);

  // Tokens consistent with BuyModal
  const T = {
    bg: "var(--surface)",
    ink: "var(--ink)",
    inkSoft: "var(--ink-soft)",
    inkFaint: "var(--ink-faint)",
    line: "var(--border)",
    mcGreen: "var(--green)",
    mcLight: "var(--green-light)",
    mcBorder: "var(--green)",
    errBg: "var(--errorBg)",
    errText: "var(--errorText)",
    errBorder: "var(--errorBorder)",
    warnBg: "#fff6e5",
    warnText: "#a65c00",
    warnBorder: "#e8c477",
    r: "16px",
    rBtn: "999px",
  } as const;

  return (
    <div
      className="mx-3 mb-3 rounded-2xl overflow-hidden customer-selectable"
      style={{
        background: T.bg,
        border: `1px solid ${T.line}`,
        boxShadow: "0 8px 24px rgba(23, 19, 31, 0.10)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${T.line}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Smartphone size={15} style={{ color: T.mcGreen, flexShrink: 0 }} />
          <span className="font-semibold text-[14px] truncate" style={{ color: T.ink }}>
            Pagar com Multicaixa Express
          </span>
        </div>
        {(step === "paid" || step === "failed") && (
          <button
            onClick={onDismiss}
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-full transition-colors hover:bg-black/5"
            style={{ color: T.inkSoft }}
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Product line */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ borderBottom: `1px solid ${T.line}`, background: "var(--subtle)" }}
      >
        <span className="text-[13px] truncate mr-2" style={{ color: T.inkSoft }}>
          {checkout.offeringName}
        </span>
        <span className="font-bold tabular-nums text-[14px] shrink-0" style={{ color: T.mcGreen }}>
          {formatAoa(checkout.amount)}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        {/* WAITING */}
        {step === "waiting" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className="flex items-center justify-center"
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: T.mcLight,
                border: `1px solid ${T.mcBorder}`,
              }}
            >
              <Loader2 size={22} className="animate-spin" style={{ color: T.mcGreen }} />
            </div>
            <div>
              <p className="font-semibold text-[14px]" style={{ color: T.ink }}>
                Aguarda confirmação
              </p>
              <p className="text-[12px] mt-1 leading-relaxed" style={{ color: T.inkSoft }}>
                Aprova na app <strong style={{ color: T.ink }}>Multicaixa Express</strong> no teu telemóvel.
              </p>
              {pollError && (
                <p role="alert" className="text-sm mt-2" style={{ color: T.errText }}>
                  {pollError} O pagamento ainda não foi confirmado nesta página. Não repitas a compra.
                </p>
              )}
            </div>
            <p
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: T.inkFaint }}
            >
              <ShieldCheck size={11} style={{ flexShrink: 0 }} />
              Dados processados pela Ekwanza de forma segura
            </p>
            {checkout.simulated && (
              <div
                className="w-full"
                style={{
                  background: T.warnBg,
                  border: `1px solid ${T.warnBorder}`,
                  borderRadius: "12px",
                  padding: "12px 14px",
                }}
              >
                <p
                  className="flex items-center gap-1.5 font-semibold text-[11px] mb-2"
                  style={{ color: T.warnText }}
                >
                  <FlaskConical size={11} /> Modo de simulação — sem dinheiro real
                </p>
                <button
                  onClick={() => void approveSimulated()}
                  disabled={busy}
                  className="w-full font-semibold text-[13px] transition-opacity disabled:opacity-60 touch-target-min"
                  style={{
                    background: T.warnText,
                    color: "#FFFFFF",
                    borderRadius: T.rBtn,
                  }}
                >
                  {busy ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Simular aprovação"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* PAID */}
        {step === "paid" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className="flex items-center justify-center"
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: T.mcLight,
                border: `1px solid ${T.mcBorder}`,
              }}
            >
              <CheckCircle2 size={24} style={{ color: T.mcGreen }} />
            </div>
            <div>
              <p className="font-bold text-[15px]" style={{ color: T.ink }}>
                Pagamento confirmado!
              </p>
              <p className="text-[12px] mt-1 leading-relaxed" style={{ color: T.inkSoft }}>
                O negócio foi notificado. O acompanhamento será feito nesta conversa.
              </p>
            </div>
            <p className="text-[11px] tabular-nums" style={{ color: T.inkFaint }}>
              Ref: {checkout.orderId.slice(0, 8).toUpperCase()}
            </p>
          </div>
        )}

        {/* FAILED */}
        {step === "failed" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className="flex items-center justify-center"
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: T.errBg,
                border: `1px solid ${T.errBorder}`,
              }}
            >
              <XCircle size={24} style={{ color: T.errText }} />
            </div>
            <div>
              <p className="font-bold text-[15px]" style={{ color: T.ink }}>
                Pagamento não concluído
              </p>
              <p className="text-[12px] mt-1 leading-relaxed" style={{ color: T.inkSoft }}>
                O pagamento foi recusado ou expirou. Podes dizer ao assistente que queres tentar de novo.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
