/**
 * BuyModal — public Multicaixa Express checkout for a catalog product.
 * Flow: quantity + phone → GPO charge (push to the buyer's phone) → poll →
 * success / failure. In simulation mode a clearly-flagged button approves
 * the payment locally.
 *
 * VISUAL: linguagem visual idêntica ao catálogo — tokens neutros, pill buttons,
 * radius 24px, inputs com borda fina, modal centrado com margens em todo o ecrã.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, Smartphone, Loader2, CheckCircle2, XCircle, Minus, Plus, ShieldCheck, FlaskConical,
} from "lucide-react";
import { simulatePayment, type Offering, type OrderStatus } from "../lib/api";
import { visitorApi } from "../lib/visitorAccess";
import "../styles/customer-ux.css";
import { useDialogFocus } from "../hooks/useDialogFocus";

// ─── Tokens locais (mesmos valores que T em Catalogo.tsx) ─────────────────────
const M = {
  bg:       "#F6F9FC",
  surface:  "#FFFFFF",
  ink:      "#0A2540",
  inkSoft:  "#425466",
  inkFaint: "#8898AA",
  line:     "#E6EBF1",
  lineSoft: "#F1F4F8",
  subtle:   "#F1F5F9",
  // Checkout catalogue uses the same neutral palette as the public profile.
  mcGreen:  "#111111",
  mcLight:  "#F8F8F8",
  mcBorder: "#E5E5E5",
  // Erro
  errBg:    "#FEF2F2",
  errText:  "#DC2626",
  errBorder:"#FECACA",
  // Aviso simulação
  warnBg:   "#FFFBEB",
  warnText: "#D97706",
  warnBorder:"#FDE68A",
  // Geometry
  rModal:   "24px",
  rBtn:     "999px",
  rInput:   "12px",
  rCard:    "16px",
} as const;

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

// ─── Componente de input reutilizável ─────────────────────────────────────────
function Field({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        className="block font-medium"
        style={{ color: M.inkSoft, fontSize: 12, marginBottom: 6 }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value, onChange, placeholder, inputMode, type,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  type?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      type={type}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="w-full outline-none text-[14px]"
      style={{
        background: M.surface,
        color: M.ink,
        border: `1.5px solid ${focused ? M.ink : M.line}`,
        borderRadius: M.rInput,
        padding: "11px 14px",
        transition: "border-color 0.15s",
      }}
    />
  );
}

// ─── Modal principal ──────────────────────────────────────────────────────────
export function BuyModal({
  businessSlug,
  offering,
  onClose,
  leadId,
  onOrderPaid,
  initialQuantity = 1,
}: {
  businessSlug: string;
  offering: Offering;
  onClose: () => void;
  leadId?: string | null;
  onOrderPaid?: (orderId: string, leadId: string) => void;
  initialQuantity?: number;
}) {
  const unitPrice = parsePriceAoa(offering.price) ?? 0;
  const [qty, setQty] = useState(() => Math.min(99, Math.max(1, Math.round(initialQuantity))));
  const [phone, setPhone] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [sessionLeadId, setSessionLeadId] = useState<string | null>(leadId ?? null);
  const [mtid, setMtid] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!busy && step !== "waiting") {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, step]);

  const total = unitPrice * qty;
  const api = visitorApi(businessSlug);

  async function ensureLeadSession(): Promise<string> {
    if (sessionLeadId) return sessionLeadId;
    const { leadId: createdLeadId } = await api.createLeadSession(
      { source: "catalogo", url: window.location.href },
      [],
    );
    setSessionLeadId(createdLeadId);
    return createdLeadId;
  }

  useEffect(() => {
    if (leadId && leadId !== sessionLeadId) setSessionLeadId(leadId);
  }, [leadId, sessionLeadId]);

  useEffect(() => {
    if (step !== "paid" || !orderId || !sessionLeadId) return;
    const timer = window.setTimeout(() => {
      if (onOrderPaid) {
        onOrderPaid(orderId, sessionLeadId);
        return;
      }
      const base = import.meta.env.BASE_URL.endsWith("/")
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`;
      window.location.assign(
        `${base}e/${encodeURIComponent(businessSlug)}`,
      );
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [businessSlug, onOrderPaid, orderId, sessionLeadId, step]);

  // Bloquear scroll da página atrás enquanto modal está aberto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback((id: string, currentLeadId: string) => {
    stopPolling();
    pollRef.current = setInterval(() => {
      api.getOrderStatus(id, currentLeadId)
        .then((s) => {
          setError(null);
          const st: OrderStatus = (s as { status: OrderStatus }).status;
          if (st === "paga") { setStep("paid"); stopPolling(); }
          else if (st === "expirada" || st === "falhada") { setStep("failed"); stopPolling(); }
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Não foi possível verificar o pagamento.");
        });
    }, 3000);
  }, [api, stopPolling]);

  const submit = useCallback(async () => {
    setError(null);
    const p = phone.replace(/[\s-]/g, "").replace(/^\+?244/, "");
    if (!/^9\d{8}$/.test(p)) { setError("Indica um número válido (9XXXXXXXX)"); return; }
    setBusy(true);
    try {
      const checkoutLeadId = await ensureLeadSession();
      const res = await api.createOrder({
        offeringName: offering.name,
        quantity: qty,
        phone: p,
        ...(buyerName.trim() ? { buyerName: buyerName.trim() } : {}),
        leadId: checkoutLeadId,
      });
      setOrderId(res.orderId);
      setSessionLeadId(res.leadId);
      setMtid(res.merchantTransactionId);
      setSimulated(res.simulated);
      setStep("waiting");
      startPolling(res.orderId, res.leadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao iniciar o pagamento");
    } finally {
      setBusy(false);
    }
  }, [api, phone, buyerName, qty, offering.name, ensureLeadSession, startPolling]);

  const approveSimulated = useCallback(async () => {
    if (!mtid) return;
    setBusy(true);
    try { await simulatePayment(mtid, true); } catch { /* poll will reflect */ }
    finally { setBusy(false); }
  }, [mtid]);

  return (
    // Overlay — foco no modal, página ao fundo
    <div
      className="catalog-buy-modal-overlay fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(20,23,26,0.48)", padding: "20px 16px" }}
      onClick={onClose}
    >
      {/* Container do modal — card premium, nunca toca nas bordas */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full flex flex-col overflow-hidden customer-selectable"
        style={{
          maxWidth: 420,
          maxHeight: "calc(100svh - 28px)",
          background: M.surface,
          borderRadius: M.rModal,
          boxShadow: "0 24px 64px rgba(20,23,26,0.20), 0 4px 16px rgba(20,23,26,0.08)",
          outline: "none",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            padding: "18px 20px 16px",
            borderBottom: `1px solid ${M.lineSoft}`,
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone size={16} style={{ color: M.mcGreen, flexShrink: 0 }} />
            <span
              className="font-semibold leading-snug"
              style={{ color: M.ink, fontSize: 14.5 }}
              id="checkout-dialog-title"
            >
              Pagar com Multicaixa Express
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full shrink-0 transition-colors hover:bg-black/5 touch-target-min"
            style={{
              color: M.inkSoft,
              marginLeft: 8,
            }}
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Conteúdo com scroll interno ────────────────────────────────────── */}
        <div
          className="overflow-y-auto"
          style={{ padding: "18px 20px 24px" }}
        >
          {/* Resumo do produto */}
          <div
            className="rounded-2xl"
            style={{
              marginBottom: 16,
              padding: "14px",
              background: M.subtle,
              border: `1px solid ${M.line}`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p
                  className="font-bold uppercase tracking-[0.08em]"
                  style={{ color: M.inkFaint, fontSize: 9.5 }}
                >
                  Resumo do pedido
                </p>
                <p
                  className="mt-2 font-semibold leading-snug"
                  style={{ color: M.ink, fontSize: 14 }}
                >
                  {offering.name}
                </p>
                <p
                  className="mt-1 tabular-nums"
                  style={{ color: M.inkSoft, fontSize: 12.5 }}
                >
                  {formatAoa(unitPrice)} <span style={{ color: M.inkFaint }}>/ unidade</span>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className="font-bold uppercase tracking-[0.08em]"
                  style={{ color: M.inkFaint, fontSize: 9.5 }}
                >
                  Total
                </p>
                <p
                  className="mt-2 font-extrabold tabular-nums"
                  style={{ color: M.mcGreen, fontSize: 18 }}
                >
                  {formatAoa(total)}
                </p>
              </div>
            </div>
            {step === "form" && (
              <div
                className="flex items-center justify-between gap-3"
                style={{
                  marginTop: 13,
                  paddingTop: 12,
                  borderTop: `1px solid ${M.line}`,
                }}
              >
                <span
                  className="font-medium"
                  style={{ color: M.ink, fontSize: 13 }}
                >
                  Quantidade
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="flex items-center justify-center transition-colors hover:bg-white touch-target-min"
                    style={{
                      borderRadius: M.rBtn,
                      background: M.surface,
                      border: `1px solid ${M.line}`,
                      color: M.ink,
                    }}
                    aria-label="Diminuir quantidade"
                  >
                    <Minus size={16} />
                  </button>
                  <span
                    className="font-bold tabular-nums text-center"
                    style={{ color: M.ink, fontSize: 15, minWidth: 28 }}
                  >
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(99, q + 1))}
                    className="flex items-center justify-center transition-colors hover:bg-white touch-target-min"
                    style={{
                      borderRadius: M.rBtn,
                      background: M.surface,
                      border: `1px solid ${M.line}`,
                      color: M.ink,
                    }}
                    aria-label="Aumentar quantidade"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── STEP: form ─────────────────────────────────────────────────── */}
          {step === "form" && (
            <>
              {/* Método de pagamento */}
              <div
                className="flex items-center gap-3 rounded-2xl"
                style={{
                  marginBottom: 18,
                  padding: "12px 14px",
                  background: M.mcLight,
                  border: `1px solid ${M.mcBorder}`,
                }}
              >
                <div
                  className="flex items-center justify-center rounded-xl shrink-0"
                  style={{ width: 38, height: 38, color: M.mcGreen, background: M.surface }}
                >
                  <Smartphone size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold" style={{ color: M.ink, fontSize: 13 }}>
                    Multicaixa Express
                  </p>
                  <p className="mt-0.5" style={{ color: M.inkSoft, fontSize: 11.5 }}>
                    Aprovação segura por notificação no telemóvel
                  </p>
                </div>
                <ShieldCheck size={17} style={{ color: M.mcGreen, flexShrink: 0 }} />
              </div>

              {/* Dados do comprador */}
              <div style={{ marginBottom: 12 }}>
                <p
                  className="font-bold uppercase tracking-[0.08em]"
                  style={{ color: M.inkFaint, fontSize: 9.5 }}
                >
                  Dados para pagamento
                </p>
                <p className="mt-1" style={{ color: M.inkSoft, fontSize: 12 }}>
                  Usa os dados associados à tua conta Multicaixa Express.
                </p>
              </div>

              {/* Nome (opcional) */}
              <Field label="O teu nome (opcional)">
                <TextInput
                  value={buyerName}
                  onChange={setBuyerName}
                  placeholder="Nome"
                />
              </Field>

              {/* Telemóvel */}
              <Field label="Telemóvel associado ao Multicaixa Express">
                <TextInput
                  value={phone}
                  onChange={setPhone}
                  placeholder="9XX XXX XXX"
                  inputMode="tel"
                />
                <p
                  className="flex items-center gap-1.5 mt-2"
                  style={{ color: M.inkFaint, fontSize: 11.5 }}
                >
                  <ShieldCheck size={12} style={{ color: M.mcGreen, flexShrink: 0 }} />
                  Vais receber uma notificação para aprovar o pagamento.
                </p>
              </Field>

              {/* Erro */}
              {error && (
                <div
                  className="text-[13px]"
                  style={{
                    background: M.errBg,
                    color: M.errText,
                    border: `1px solid ${M.errBorder}`,
                    borderRadius: M.rInput,
                    padding: "10px 14px",
                    marginBottom: 14,
                  }}
                >
                  {error}
                </div>
              )}

              {/* CTA — Pagar */}
              <button
                onClick={() => void submit()}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 font-bold transition-opacity disabled:opacity-60"
                style={{
                  background: M.mcGreen,
                  color: "#FFFFFF",
                  borderRadius: M.rBtn,
                  fontSize: 15,
                  minHeight: 52,
                  marginTop: 4,
                }}
              >
                {busy ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Smartphone size={17} />
                )}
                Pagar {formatAoa(total)}
              </button>
            </>
          )}

          {/* ── STEP: waiting ──────────────────────────────────────────────── */}
          {step === "waiting" && (
            <div className="flex flex-col items-center text-center" style={{ gap: 14, paddingTop: 8 }}>
              <div
                className="flex items-center justify-center"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: M.mcLight,
                  border: `1px solid ${M.mcBorder}`,
                }}
              >
                <Loader2 size={26} className="animate-spin" style={{ color: M.mcGreen }} />
              </div>
              <p
                className="font-bold"
                style={{ color: M.ink, fontSize: 16 }}
              >
                Aguardando confirmação…
              </p>
              <p
                className="leading-relaxed"
                style={{ color: M.inkSoft, fontSize: 13, maxWidth: 280 }}
              >
                Abre a app <strong style={{ color: M.ink }}>Multicaixa Express</strong> no telemóvel{" "}
                <strong style={{ color: M.ink }}>{phone}</strong> e aprova o pagamento de{" "}
                <strong style={{ color: M.ink }}>{formatAoa(total)}</strong>.
              </p>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error} O pagamento ainda não foi confirmado nesta página. Não repitas a compra.
                </p>
              )}
              {simulated && (
                <div
                  style={{
                    width: "100%",
                    background: M.warnBg,
                    border: `1px solid ${M.warnBorder}`,
                    borderRadius: M.rCard,
                    padding: "14px 16px",
                  }}
                >
                  <p
                    className="flex items-center gap-1.5 font-semibold"
                    style={{ color: M.warnText, fontSize: 12, marginBottom: 10 }}
                  >
                    <FlaskConical size={12} /> Modo de simulação — sem dinheiro real
                  </p>
                  <button
                    onClick={() => void approveSimulated()}
                    disabled={busy}
                    className="w-full font-semibold transition-opacity disabled:opacity-60 touch-target-min"
                    style={{
                      background: M.warnText,
                      color: "#FFFFFF",
                      borderRadius: M.rBtn,
                      fontSize: 13,
                    }}
                  >
                    Simular aprovação no telemóvel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP: paid ─────────────────────────────────────────────────── */}
          {step === "paid" && (
            <div className="flex flex-col items-center text-center" style={{ gap: 12, paddingTop: 8 }}>
              <div
                className="flex items-center justify-center"
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: M.mcLight,
                  border: `1px solid ${M.mcBorder}`,
                }}
              >
                <CheckCircle2 size={28} style={{ color: M.mcGreen }} />
              </div>
              <p
                className="font-bold"
                style={{ color: M.ink, fontSize: 17 }}
              >
                Pagamento confirmado!
              </p>
              <p
                className="leading-relaxed"
                style={{ color: M.inkSoft, fontSize: 13, maxWidth: 280 }}
              >
                 A tua encomenda de <strong style={{ color: M.ink }}>{offering.name}</strong> foi paga.{" "}
                 O negócio foi notificado. O acompanhamento será feito no chat da loja.
              </p>
              {orderId && (
                <p
                  className="tabular-nums"
                  style={{ color: M.inkFaint, fontSize: 11 }}
                >
                  Ref: {orderId.slice(0, 8).toUpperCase()}
                </p>
              )}
              <div
                className="w-full rounded-xl px-3 py-3"
                style={{ background: M.mcLight, border: `1px solid ${M.mcBorder}`, color: M.inkSoft, fontSize: 12 }}
              >
                Vamos abrir a conversa para veres o estado da encomenda e receberes as actualizações.
              </div>
              <button
                onClick={onClose}
                className="w-full font-bold transition-opacity hover:opacity-90"
                style={{
                  background: M.mcGreen,
                  color: "#FFFFFF",
                  borderRadius: M.rBtn,
                  fontSize: 14,
                  minHeight: 48,
                  marginTop: 8,
                }}
              >
                Fechar
              </button>
            </div>
          )}

          {/* ── STEP: failed ───────────────────────────────────────────────── */}
          {step === "failed" && (
            <div className="flex flex-col items-center text-center" style={{ gap: 12, paddingTop: 8 }}>
              <div
                className="flex items-center justify-center"
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: M.errBg,
                  border: `1px solid ${M.errBorder}`,
                }}
              >
                <XCircle size={28} style={{ color: M.errText }} />
              </div>
              <p
                className="font-bold"
                style={{ color: M.ink, fontSize: 17 }}
              >
                Pagamento não concluído
              </p>
              <p
                className="leading-relaxed"
                style={{ color: M.inkSoft, fontSize: 13, maxWidth: 280 }}
              >
                O pagamento foi recusado ou expirou. Podes tentar de novo.
              </p>
              <button
                onClick={() => { setStep("form"); setError(null); }}
                className="w-full font-bold transition-opacity hover:opacity-90"
                style={{
                  background: M.ink,
                  color: "#FFFFFF",
                  borderRadius: M.rBtn,
                  fontSize: 14,
                  minHeight: 48,
                  marginTop: 8,
                }}
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
