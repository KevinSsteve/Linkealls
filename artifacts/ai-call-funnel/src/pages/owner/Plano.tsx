/**
 * Plano — Linkealls subscription (10.000 Kz / 30 dias) paid via Multicaixa Express.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Crown, Smartphone, Loader2, CheckCircle2, XCircle, FlaskConical, Clock,
} from "lucide-react";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { businessApi, confirmSensitiveAction, simulatePayment, type SubscriptionInfo, type Subscription } from "../../lib/api";
import { C } from "../../theme";
import { AppHeader, AppIconButton } from "../../components/app/AppHeader";

function fmtKz(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return `${n.toLocaleString("pt-AO", { maximumFractionDigits: 2 })} Kz`;
}
function fmtDay(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" }) : "—";
}

const SUB_UI: Record<Subscription["status"], { label: string; bg: string; color: string }> = {
  ativa:    { label: "Activa",   bg: C.successBg, color: C.successText },
  pendente: { label: "Pendente", bg: C.warnBg,    color: C.warnText },
  expirada: { label: "Expirada", bg: "#F3F4F6",   color: "#6B7280" },
  falhada:  { label: "Falhada",  bg: C.errorBg,   color: C.errorText },
};

export function Plano() {
  const slug = useBusinessSlug();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Checkout flow
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<{ id: string; mtid: string; simulated: boolean } | null>(null);
  const [result, setResult] = useState<"paid" | "failed" | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const api = slug ? businessApi(slug) : null;

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      setInfo(await api.getSubscription());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar o plano");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const startPolling = useCallback((id: string) => {
    if (!api) return;
    stopPolling();
    pollRef.current = setInterval(() => {
      api.getSubscriptionStatus(id)
        .then((s) => {
          if (s.status === "ativa") { setResult("paid"); setWaiting(null); stopPolling(); void load(); }
          else if (s.status === "falhada" || s.status === "expirada") { setResult("failed"); setWaiting(null); stopPolling(); }
        })
        .catch(() => {});
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, stopPolling, load]);

  const checkout = useCallback(async () => {
    if (!api) return;
    setCheckoutError(null);
    setResult(null);
    const p = phone.replace(/[\s-]/g, "").replace(/^\+?244/, "");
    if (!/^9\d{8}$/.test(p)) { setCheckoutError("Indica um número válido (9XXXXXXXX)"); return; }
    if (!(await confirmSensitiveAction())) {
      setCheckoutError("É necessária uma confirmação para iniciar o pagamento.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.checkoutSubscription(p);
      setWaiting({ id: res.subscriptionId, mtid: res.merchantTransactionId, simulated: res.simulated });
      startPolling(res.subscriptionId);
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : "Erro ao iniciar o pagamento");
    } finally {
      setBusy(false);
    }
  }, [api, phone, startPolling]);

  const approveSimulated = useCallback(async () => {
    if (!waiting) return;
    setBusy(true);
    try { await simulatePayment(waiting.mtid, true); } catch { /* poll reflects */ }
    finally { setBusy(false); }
  }, [waiting]);

  const active = info?.active ?? null;

  return (
    <div className="flex flex-col h-full" style={{ background: C.bg }}>
      {/* Header */}
      <AppHeader
        title="Plano"
        actions={
          <AppIconButton label="Actualizar" onClick={() => void load()}>
            <RefreshCw size={18} strokeWidth={1.75} />
          </AppIconButton>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 size={28} className="animate-spin" style={{ color: C.green }} />
          </div>
        )}

        {error && (
          <div className="rounded-xl px-3.5 py-2.5 text-[13px]" style={{ background: C.errorBg, color: C.errorText, border: `1px solid ${C.errorBorder}` }}>
            {error}
          </div>
        )}

        {info?.simulation && (
          <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12px]"
            style={{ background: C.warnBg, color: C.warnText, border: `1px solid ${C.warnBorder}` }}>
            <FlaskConical size={14} className="shrink-0" />
            Modo de simulação — pagamento sem dinheiro real.
          </div>
        )}

        {!loading && info && (
          <>
            {/* Status card */}
            <div className="rounded-2xl px-5 py-5" style={{ background: active ? C.headerBg : C.white, border: active ? "none" : `1px solid ${C.border}` }}>
              <div className="flex items-center gap-2 mb-2">
                <Crown size={18} style={{ color: active ? "#FDE68A" : C.green }} />
                <p className="font-extrabold text-[17px]" style={{ color: active ? "#FFFFFF" : C.text }}>
                  Plano Linkealls
                </p>
              </div>
              {active ? (
                <>
                  <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.75)" }}>
                    Activo até <strong style={{ color: "#FFFFFF" }}>{fmtDay(active.expiresAt)}</strong>
                  </p>
                  <p className="text-[12px] mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Renovar antes do fim adiciona 30 dias ao período actual.
                  </p>
                </>
              ) : (
                <p className="text-[13px]" style={{ color: C.text2 }}>
                  Sem plano activo. Activa por <strong style={{ color: C.text }}>{fmtKz(info.planPrice)}</strong> / 30 dias com Multicaixa Express.
                </p>
              )}
            </div>

            {/* Result banners */}
            {result === "paid" && (
              <div className="flex items-center gap-2 rounded-xl px-3.5 py-3 text-[13px] font-semibold"
                style={{ background: C.successBg, color: C.successText, border: `1px solid ${C.successBorder}` }}>
                <CheckCircle2 size={16} /> Pagamento confirmado — plano activo!
              </div>
            )}
            {result === "failed" && (
              <div className="flex items-center gap-2 rounded-xl px-3.5 py-3 text-[13px] font-semibold"
                style={{ background: C.errorBg, color: C.errorText, border: `1px solid ${C.errorBorder}` }}>
                <XCircle size={16} /> Pagamento não concluído. Tenta de novo.
              </div>
            )}

            {/* Checkout / waiting */}
            {waiting ? (
              <div className="rounded-2xl px-4 py-5 flex flex-col items-center text-center gap-3" style={{ background: C.white, border: `1px solid ${C.border}` }}>
                <Loader2 size={30} className="animate-spin" style={{ color: C.green }} />
                <p className="font-bold text-[15px]" style={{ color: C.text }}>Aguardando confirmação…</p>
                <p className="text-[13px] max-w-[280px]" style={{ color: C.text2 }}>
                  Aprova o pagamento de {fmtKz(info.planPrice)} na app Multicaixa Express.
                </p>
                {waiting.simulated && (
                  <div className="w-full rounded-xl px-3.5 py-3" style={{ background: C.warnBg, border: `1px solid ${C.warnBorder}` }}>
                    <p className="text-[12px] font-semibold flex items-center justify-center gap-1.5 mb-2" style={{ color: C.warnText }}>
                      <FlaskConical size={13} /> Modo de simulação
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
            ) : (
              <div className="rounded-2xl px-4 py-4" style={{ background: C.white, border: `1px solid ${C.border}` }}>
                <p className="font-bold text-[15px] mb-1" style={{ color: C.text }}>
                  {active ? "Renovar plano" : "Activar plano"} — {fmtKz(info.planPrice)}
                </p>
                <p className="text-[12px] mb-3" style={{ color: C.text2 }}>
                  Vais receber uma notificação Multicaixa Express para aprovar.
                </p>
                <label className="block mb-3">
                  <span className="text-[12px] font-medium block mb-1" style={{ color: C.text2 }}>Telemóvel</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9XX XXX XXX"
                    inputMode="tel"
                    className="w-full rounded-xl px-3.5 py-2.5 text-[15px] outline-none tabular-nums"
                    style={{ background: C.inputBg, color: C.text }}
                  />
                </label>
                {checkoutError && (
                  <div className="rounded-xl px-3.5 py-2.5 text-[13px] mb-3" style={{ background: C.errorBg, color: C.errorText, border: `1px solid ${C.errorBorder}` }}>
                    {checkoutError}
                  </div>
                )}
                <button
                  onClick={() => void checkout()}
                  disabled={busy}
                  className="w-full py-3 rounded-xl font-bold text-[14px] text-white flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: C.green }}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />}
                  Pagar {fmtKz(info.planPrice)}
                </button>
              </div>
            )}

            {/* History */}
            {info.history.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ background: C.white, border: `1px solid ${C.border}` }}>
                <p className="px-4 pt-3 pb-1.5 text-[12px] font-semibold" style={{ color: C.text2 }}>Histórico</p>
                {info.history.map((s) => {
                  const ui = SUB_UI[s.status];
                  return (
                    <div key={s.id} className="px-4 py-3 flex items-center gap-3" style={{ borderTop: `1px solid ${C.border}` }}>
                      <Clock size={15} style={{ color: C.text3 }} className="shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium" style={{ color: C.text }}>{fmtKz(s.amount)} · 30 dias</p>
                        <p className="text-[12px]" style={{ color: C.text3 }}>
                          {s.paidAt ? `Pago em ${fmtDay(s.paidAt)}` : `Criado em ${fmtDay(s.createdAt)}`}
                        </p>
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: ui.bg, color: ui.color }}>
                        {ui.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <OwnerNav />
    </div>
  );
}
