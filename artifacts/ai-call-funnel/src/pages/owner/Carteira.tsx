/**
 * Carteira — owner wallet: balance from immutable ledger, statement,
 * saque (payout) request via Multicaixa Express / IBAN, payout history.
 */
import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Wallet, ArrowDownToLine, ArrowUpRight, ArrowDownLeft, Loader2,
  CheckCircle2, Clock, XCircle, RotateCcw, FlaskConical, Landmark, Smartphone,
} from "lucide-react";
import { OwnerNav } from "../../components/owner/OwnerNav";
import { WaSkeletonList } from "../../components/wa/WaSkeletonList";
import { WaEmptyState } from "../../components/wa/WaEmptyState";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { businessApi, type WalletData, type WalletLedgerEntry, type Payout } from "../../lib/api";
import { C } from "../../theme";

function fmtKz(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return `${n.toLocaleString("pt-AO", { maximumFractionDigits: 2 })} Kz`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const PAYOUT_UI: Record<Payout["status"], { label: string; bg: string; color: string; Icon: typeof Clock }> = {
  processado: { label: "Processado", bg: C.successBg, color: C.successText, Icon: CheckCircle2 },
  pendente:   { label: "Pendente",   bg: C.warnBg,    color: C.warnText,    Icon: Clock },
  falhado:    { label: "Falhado",    bg: C.errorBg,   color: C.errorText,   Icon: XCircle },
  revertido:  { label: "Revertido",  bg: "#F3F4F6",   color: "#6B7280",     Icon: RotateCcw },
};

function LedgerRow({ entry }: { entry: WalletLedgerEntry }) {
  const credit = Number(entry.amount) > 0;
  return (
    <div className="px-4 py-3 flex items-center gap-3" style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ background: credit ? C.greenLight : "#FEE2E2" }}
      >
        {credit
          ? <ArrowDownLeft size={16} style={{ color: C.greenDark }} />
          : <ArrowUpRight size={16} style={{ color: C.errorText }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[14px] truncate" style={{ color: C.text }}>{entry.description}</p>
        <p className="text-[12px]" style={{ color: C.text3 }}>{fmtDate(entry.createdAt)}</p>
      </div>
      <p className="font-bold text-[14px] tabular-nums shrink-0" style={{ color: credit ? C.green : C.errorText }}>
        {credit ? "+" : ""}{fmtKz(entry.amount)}
      </p>
    </div>
  );
}

function PayoutRow({ payout, onReconcile, busy }: { payout: Payout; onReconcile: (id: string) => void; busy: boolean }) {
  const ui = PAYOUT_UI[payout.status];
  return (
    <div className="px-4 py-3" style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[14px]" style={{ color: C.text }}>{fmtKz(payout.amount)}</p>
          <p className="text-[12px] truncate mt-0.5 flex items-center gap-1" style={{ color: C.text2 }}>
            {payout.destinationType === "iban" ? <Landmark size={11} /> : <Smartphone size={11} />}
            {payout.destination} · {fmtDate(payout.createdAt)}
          </p>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: ui.bg, color: ui.color }}>
          <ui.Icon size={11} /> {ui.label}
        </span>
      </div>
      {payout.error && (
        <p className="text-[12px] mt-1.5" style={{ color: C.errorText }}>{payout.error}</p>
      )}
      {payout.status === "pendente" && (
        <button
          onClick={() => onReconcile(payout.id)}
          disabled={busy}
          className="mt-2 text-[12px] font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60"
          style={{ background: C.inputBg, color: C.text }}
        >
          Verificar estado
        </button>
      )}
    </div>
  );
}

export function Carteira() {
  const slug = useBusinessSlug();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Saque form
  const [showSaque, setShowSaque] = useState(false);
  const [amount, setAmount] = useState("");
  const [destType, setDestType] = useState<"telemovel" | "iban">("telemovel");
  const [destination, setDestination] = useState("");
  const [saqueBusy, setSaqueBusy] = useState(false);
  const [saqueError, setSaqueError] = useState<string | null>(null);
  const [saqueOk, setSaqueOk] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);

  const api = slug ? businessApi(slug) : null;

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      const [w, p] = await Promise.all([api.getWallet(), api.listPayouts()]);
      setWallet(w);
      setPayouts(p.payouts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar carteira");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const submitSaque = useCallback(async () => {
    if (!api || !wallet) return;
    setSaqueError(null);
    setSaqueOk(null);
    const value = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(value) || value < wallet.payoutMin) {
      setSaqueError(`O valor mínimo de saque é ${fmtKz(wallet.payoutMin)}.`);
      return;
    }
    if (value > wallet.balance) {
      setSaqueError("Saldo insuficiente.");
      return;
    }
    const dest = destination.trim().replace(/[\s-]/g, "");
    if (destType === "telemovel" && !/^(?:\+?244)?9\d{8}$/.test(dest)) {
      setSaqueError("Indica um telemóvel válido (9XXXXXXXX).");
      return;
    }
    if (destType === "iban" && !/^AO06\d{21}$/i.test(dest)) {
      setSaqueError("Indica um IBAN angolano válido (AO06 + 21 dígitos).");
      return;
    }
    setSaqueBusy(true);
    try {
      await api.requestPayout({ amount: value, destinationType: destType, destination: dest });
      setSaqueOk("Saque pedido com sucesso.");
      setAmount("");
      setDestination("");
      setShowSaque(false);
      await load();
    } catch (e) {
      setSaqueError(e instanceof Error ? e.message : "Erro ao pedir o saque");
    } finally {
      setSaqueBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, wallet, amount, destType, destination, load]);

  const reconcile = useCallback(async (id: string) => {
    if (!api) return;
    setReconciling(true);
    try { await api.reconcilePayout(id); await load(); }
    catch { /* keep state */ }
    finally { setReconciling(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, load]);

  return (
    <div className="flex flex-col h-full" style={{ background: "#F8F9FA" }}>
      {/* Header */}
      <div className="shrink-0" style={{ background: "#FFFFFF", borderBottom: "1px solid #E5E7EB" }}>
        <div className="flex items-center justify-between" style={{ padding: "16px 16px 12px" }}>
          <h1 style={{ color: "#111111", fontSize: 22, fontWeight: 700, letterSpacing: "-0.3px" }}>Carteira</h1>
          <button
            onClick={() => void load()}
            className="flex items-center justify-center rounded-full transition-opacity active:opacity-60"
            style={{ width: 36, height: 36, color: "#9CA3AF" }}
            aria-label="Actualizar"
          >
            <RefreshCw size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Balance card */}
        <div style={{ padding: "0 16px 16px" }}>
          <div className="rounded-2xl" style={{ background: C.headerBg, padding: "16px 18px" }}>
            <p className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Saldo disponível</p>
            <p className="text-[28px] font-extrabold tabular-nums text-white">
              {wallet ? fmtKz(wallet.balance) : "—"}
            </p>
            <button
              onClick={() => { setShowSaque((s) => !s); setSaqueError(null); setSaqueOk(null); }}
              disabled={!wallet || wallet.balance < (wallet?.payoutMin ?? 1000)}
              className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold disabled:opacity-50"
              style={{ background: "#FFFFFF", color: C.greenDark }}
            >
              <ArrowDownToLine size={14} /> Sacar dinheiro
            </button>
          </div>
        </div>
      </div>

      {wallet?.simulation && (
        <div className="shrink-0 flex items-center gap-2 text-[12px]"
          style={{ background: C.warnBg, color: C.warnText, border: `1px solid ${C.warnBorder}`, borderRadius: 10, margin: "12px 16px 0", padding: "10px 14px" }}>
          <FlaskConical size={14} className="shrink-0" />
          Modo de simulação — saldos e saques sem dinheiro real.
        </div>
      )}

      {saqueOk && (
        <div className="shrink-0 text-[13px]"
          style={{ background: C.successBg, color: C.successText, border: `1px solid ${C.successBorder}`, borderRadius: 10, margin: "12px 16px 0", padding: "10px 14px" }}>
          {saqueOk}
        </div>
      )}

      {/* Saque form */}
      {showSaque && wallet && (
        <div className="shrink-0" style={{ background: C.white, border: `1px solid #E5E7EB`, borderRadius: 16, margin: "12px 16px 0", padding: "16px 16px" }}>
          <p className="font-bold text-[15px] mb-3" style={{ color: C.text }}>Pedir saque</p>

          <label className="block mb-3">
            <span className="text-[12px] font-medium block mb-1" style={{ color: C.text2 }}>Valor (mínimo {fmtKz(wallet.payoutMin)})</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              className="w-full rounded-xl px-3.5 py-2.5 text-[15px] outline-none tabular-nums"
              style={{ background: C.inputBg, color: C.text }}
            />
          </label>

          <div className="flex gap-2 mb-3">
            {(["telemovel", "iban"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setDestType(t)}
                className="flex-1 py-2 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5"
                style={destType === t
                  ? { background: C.greenLight, color: C.greenDark, border: `1px solid ${C.successBorder}` }
                  : { background: C.inputBg, color: C.text2, border: "1px solid transparent" }}
              >
                {t === "telemovel" ? <Smartphone size={14} /> : <Landmark size={14} />}
                {t === "telemovel" ? "Multicaixa Express" : "IBAN"}
              </button>
            ))}
          </div>

          <label className="block mb-3">
            <span className="text-[12px] font-medium block mb-1" style={{ color: C.text2 }}>
              {destType === "telemovel" ? "Telemóvel associado ao Multicaixa Express" : "IBAN (AO06...)"}
            </span>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={destType === "telemovel" ? "9XX XXX XXX" : "AO06 0000 0000 0000 0000 0000 0"}
              inputMode={destType === "telemovel" ? "tel" : "text"}
              className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none"
              style={{ background: C.inputBg, color: C.text }}
            />
          </label>

          {saqueError && (
            <div className="rounded-xl px-3.5 py-2.5 text-[13px] mb-3" style={{ background: C.errorBg, color: C.errorText, border: `1px solid ${C.errorBorder}` }}>
              {saqueError}
            </div>
          )}

          <button
            onClick={() => void submitSaque()}
            disabled={saqueBusy}
            className="w-full py-3 rounded-xl font-bold text-[14px] text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: C.green }}
          >
            {saqueBusy ? <Loader2 size={16} className="animate-spin" /> : <ArrowDownToLine size={16} />}
            Confirmar saque
          </button>
        </div>
      )}

      {/* Statement + payouts */}
      <div className="flex-1 overflow-y-auto flex flex-col mt-2">
        {error && (
          <div className="text-[13px]" style={{ background: C.errorBg, color: C.errorText, border: `1px solid ${C.errorBorder}`, borderRadius: 10, margin: "12px 16px", padding: "10px 14px" }}>
            {error}
          </div>
        )}
        {loading && <WaSkeletonList count={5} />}

        {!loading && payouts.length > 0 && (
          <>
            <p style={{ color: "#6B7280", fontSize: 11, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", padding: "20px 16px 8px" }}>Saques</p>
            <div>
              {payouts.map((p) => (
                <PayoutRow key={p.id} payout={p} onReconcile={(id) => void reconcile(id)} busy={reconciling} />
              ))}
            </div>
          </>
        )}

        {!loading && wallet && (
          <>
            <p style={{ color: "#6B7280", fontSize: 11, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", padding: "20px 16px 8px" }}>Extracto</p>
            {wallet.entries.length === 0 ? (
              <WaEmptyState
                icon={<Wallet size={36} />}
                iconBg="#E8F5E9"
                iconColor={C.green}
                title="Sem movimentos"
                subtitle="As vendas pagas no catálogo aparecem aqui como crédito."
              />
            ) : (
              <div>
                {wallet.entries.map((e) => <LedgerRow key={e.id} entry={e} />)}
              </div>
            )}
          </>
        )}
      </div>

      <OwnerNav />
    </div>
  );
}
