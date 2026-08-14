/**
 * BuyModal — public Multicaixa Express checkout for a catalog product.
 * Flow: quantity + phone → GPO charge (push to the buyer's phone) → poll →
 * success / failure. In simulation mode a clearly-flagged button approves
 * the payment locally.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, Smartphone, Loader2, CheckCircle2, XCircle, Minus, Plus, ShieldCheck, FlaskConical,
} from "lucide-react";
import { businessApi, simulatePayment, type Offering, type OrderStatus } from "../lib/api";
import { C } from "../theme";

/** Parse "50.000 Kz" / "244 329,00 Kz" → number, or null when not sellable. */
export function parsePriceAoa(price: string): number | null {
  const cleaned = price.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

export function formatAoa(v: number): string {
  return `${v.toLocaleString("pt-AO", { maximumFractionDigits: 2 })} Kz`;
}

type Step = "form" | "waiting" | "paid" | "failed";

export function BuyModal({
  businessSlug,
  offering,
  onClose,
}: {
  businessSlug: string;
  offering: Offering;
  onClose: () => void;
}) {
  const unitPrice = parsePriceAoa(offering.price) ?? 0;
  const [qty, setQty] = useState(1);
  const [phone, setPhone] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [mtid, setMtid] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = unitPrice * qty;
  const api = businessApi(businessSlug);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(() => {
      api.getOrderStatus(id)
        .then((s) => {
          const st: OrderStatus = s.status;
          if (st === "paga") { setStep("paid"); stopPolling(); }
          else if (st === "expirada" || st === "falhada") { setStep("failed"); stopPolling(); }
        })
        .catch(() => {});
    }, 3000);
  }, [api, stopPolling]);

  const submit = useCallback(async () => {
    setError(null);
    const p = phone.replace(/[\s-]/g, "").replace(/^\+?244/, "");
    if (!/^9\d{8}$/.test(p)) { setError("Indica um número válido (9XXXXXXXX)"); return; }
    setBusy(true);
    try {
      const res = await api.createOrder({
        offeringName: offering.name,
        quantity: qty,
        phone: p,
        ...(buyerName.trim() ? { buyerName: buyerName.trim() } : {}),
      });
      setOrderId(res.orderId);
      setMtid(res.merchantTransactionId);
      setSimulated(res.simulated);
      setStep("waiting");
      startPolling(res.orderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao iniciar o pagamento");
    } finally {
      setBusy(false);
    }
  }, [api, phone, buyerName, qty, offering.name, startPolling]);

  const approveSimulated = useCallback(async () => {
    if (!mtid) return;
    setBusy(true);
    try { await simulatePayment(mtid, true); } catch { /* poll will reflect */ }
    finally { setBusy(false); }
  }, [mtid]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white flex flex-col overflow-hidden"
        style={{ borderRadius: "20px 20px 0 0", maxHeight: "92svh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2">
            <Smartphone size={18} style={{ color: C.green }} />
            <span className="font-bold text-[15px]" style={{ color: C.text }}>Pagar com Multicaixa Express</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: C.text2 }}>
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {/* Product summary */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="font-semibold text-[14px] truncate" style={{ color: C.text }}>{offering.name}</p>
              <p className="text-[13px]" style={{ color: C.text2 }}>{formatAoa(unitPrice)} / unidade</p>
            </div>
            <p className="font-extrabold text-[17px] tabular-nums shrink-0" style={{ color: C.green }}>{formatAoa(total)}</p>
          </div>

          {step === "form" && (
            <>
              {/* Quantity */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-[13px] font-medium" style={{ color: C.text2 }}>Quantidade</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: C.inputBg, color: C.text }}
                  ><Minus size={15} /></button>
                  <span className="font-bold text-[16px] w-6 text-center tabular-nums" style={{ color: C.text }}>{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(99, q + 1))}
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: C.inputBg, color: C.text }}
                  ><Plus size={15} /></button>
                </div>
              </div>

              <label className="block mb-3">
                <span className="text-[13px] font-medium block mb-1.5" style={{ color: C.text2 }}>O teu nome (opcional)</span>
                <input
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Nome"
                  className="w-full rounded-xl px-3.5 py-3 text-[14px] outline-none"
                  style={{ background: C.inputBg, color: C.text }}
                />
              </label>

              <label className="block mb-1">
                <span className="text-[13px] font-medium block mb-1.5" style={{ color: C.text2 }}>
                  Telemóvel associado ao Multicaixa Express
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9XX XXX XXX"
                  inputMode="tel"
                  className="w-full rounded-xl px-3.5 py-3 text-[15px] outline-none tabular-nums"
                  style={{ background: C.inputBg, color: C.text }}
                />
              </label>
              <p className="text-[12px] mb-3 flex items-center gap-1.5" style={{ color: C.text3 }}>
                <ShieldCheck size={13} /> Vais receber uma notificação na app Multicaixa Express para aprovar.
              </p>

              {error && (
                <div className="rounded-xl px-3.5 py-2.5 text-[13px] mb-3" style={{ background: C.errorBg, color: C.errorText, border: `1px solid ${C.errorBorder}` }}>
                  {error}
                </div>
              )}

              <button
                onClick={() => void submit()}
                disabled={busy}
                className="w-full py-3.5 rounded-xl font-bold text-[15px] text-white flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: C.green }}
              >
                {busy ? <Loader2 size={17} className="animate-spin" /> : <Smartphone size={17} />}
                Pagar {formatAoa(total)}
              </button>
            </>
          )}

          {step === "waiting" && (
            <div className="flex flex-col items-center text-center py-4 gap-3">
              <Loader2 size={36} className="animate-spin" style={{ color: C.green }} />
              <p className="font-bold text-[15px]" style={{ color: C.text }}>Aguardando confirmação…</p>
              <p className="text-[13px] max-w-[280px]" style={{ color: C.text2 }}>
                Abre a app <strong>Multicaixa Express</strong> no telemóvel {phone} e aprova o pagamento de {formatAoa(total)}.
              </p>
              {simulated && (
                <div className="w-full rounded-xl px-3.5 py-3 mt-1" style={{ background: C.warnBg, border: `1px solid ${C.warnBorder}` }}>
                  <p className="text-[12px] font-semibold flex items-center gap-1.5 mb-2" style={{ color: C.warnText }}>
                    <FlaskConical size={13} /> Modo de simulação — sem dinheiro real
                  </p>
                  <button
                    onClick={() => void approveSimulated()}
                    disabled={busy}
                    className="w-full py-2.5 rounded-lg font-semibold text-[13px] text-white disabled:opacity-60"
                    style={{ background: C.warnText }}
                  >
                    Simular aprovação no telemóvel
                  </button>
                </div>
              )}
            </div>
          )}

          {step === "paid" && (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <CheckCircle2 size={44} style={{ color: C.green }} />
              <p className="font-bold text-[17px]" style={{ color: C.text }}>Pagamento confirmado!</p>
              <p className="text-[13px] max-w-[280px]" style={{ color: C.text2 }}>
                A tua encomenda de <strong>{offering.name}</strong> foi paga. O negócio já foi notificado e vai entrar em contacto.
              </p>
              {orderId && <p className="text-[11px] tabular-nums" style={{ color: C.text3 }}>Ref: {orderId.slice(0, 8).toUpperCase()}</p>}
              <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-[14px] text-white mt-2" style={{ background: C.green }}>
                Fechar
              </button>
            </div>
          )}

          {step === "failed" && (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <XCircle size={44} style={{ color: C.errorText }} />
              <p className="font-bold text-[17px]" style={{ color: C.text }}>Pagamento não concluído</p>
              <p className="text-[13px] max-w-[280px]" style={{ color: C.text2 }}>
                O pagamento foi recusado ou expirou. Podes tentar de novo.
              </p>
              <button
                onClick={() => { setStep("form"); setError(null); }}
                className="w-full py-3 rounded-xl font-bold text-[14px] text-white mt-2"
                style={{ background: C.green }}
              >
                Tentar de novo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
