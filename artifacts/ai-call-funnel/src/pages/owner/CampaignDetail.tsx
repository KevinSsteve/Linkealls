/**
 * Detalhe de campanha — tema claro estilo WhatsApp Business.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft, Sparkles, Copy, Check, Loader2, AlertCircle,
  Globe, Instagram, Facebook, ExternalLink,
  Layers2, ImagePlus, WandSparkles,
  ChevronDown, ChevronUp, Users, BadgeCheck, TrendingUp,
  DollarSign, Lightbulb, Play, Pause, CopyPlus,
  Wallet, Smartphone, Rocket, Eye, MousePointerClick, StopCircle,
  MapPin, Search, X,
} from "lucide-react";
import { OwnerNav } from "../../components/owner/OwnerNav";
import {
  businessApi, type Campaign, type CampaignKit,
  type CampaignMetrics, type CampaignPlatform,
  type AdsQuote, type CampaignPublishStatus,
  type CampaignSetup,
  type MetaTargetingSuggestion,
  uploadPrivateImage,
} from "../../lib/api";
import { useBusinessSlug } from "../../hooks/useBusinessSlug";
import { AppHeader, AppIconButton } from "../../components/app/AppHeader";

// ─── Colours ─────────────────────────────────────────────────────────────────
const C = {
  bg:     "#F8F9FA",
  white:  "#FFFFFF",
  text:   "#111111",
  text2:  "#6B7280",
  text3:  "#9CA3AF",
  green:  "#16A34A",
  border: "#E5E7EB",
};

// ─── Constants ────────────────────────────────────────────────────────────────
const PLATFORM_META: Record<CampaignPlatform, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  google:    { label: "Google Ads",  icon: <Globe size={14} />,     color: "#4285F4", bg: "#E8F0FE" },
  instagram: { label: "Instagram",   icon: <Instagram size={14} />, color: "#E1306C", bg: "#FCE4EC" },
  facebook:  { label: "Facebook",    icon: <Facebook size={14} />,  color: "#1877F2", bg: "#E3F2FD" },
  tiktok:    { label: "TikTok",      icon: <span className="text-[13px] font-bold">T</span>, color: "#010101", bg: "#F5F5F5" },
  meta:      { label: "Meta Ads",    icon: <Layers2 size={14} />,    color: "#0866FF", bg: "#E7F0FF" },
};
const STATUS_NEXT: Record<Campaign["status"], Campaign["status"] | null> = {
  rascunho: "ativa", ativa: "pausada", pausada: "ativa", encerrada: null,
};

function readableCreativeError(error: string | null | undefined): string {
  if (!error) return "Não foi possível gerar o criativo.";
  if (/RESOURCE_EXHAUSTED|quota|free.?tier|generate_content_free_tier|429/i.test(error)) {
    return "O Gemini está sem quota para gerar imagens nesta conta. Ativa faturação/quota no projeto Google ou usa uma imagem da tua galeria.";
  }
  if (/PERMISSION_DENIED|forbidden|unauthenticated/i.test(error)) {
    return "A chave Gemini não tem acesso ao modelo de imagem configurado.";
  }
  if (error.length > 320) return "O Gemini não conseguiu gerar o criativo. Tenta novamente mais tarde ou usa uma imagem da tua galeria.";
  return error;
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyBtn({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-[11px] transition-colors shrink-0 font-medium"
      style={{ color: copied ? "#2E7D32" : C.green }}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Copiado!" : label}
    </button>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: C.bg, borderBottom: open ? `1px solid ${C.border}` : undefined }}>
        <span className="text-[13px] font-semibold" style={{ color: C.text }}>{title}</span>
        {open ? <ChevronUp size={14} style={{ color: C.text3 }} /> : <ChevronDown size={14} style={{ color: C.text3 }} />}
      </button>
      {open && (
        <div className="px-4 py-3 space-y-3" style={{ background: C.white }}>{children}</div>
      )}
    </div>
  );
}

// ─── Kit view ─────────────────────────────────────────────────────────────────
function KitView({ kit }: { kit: CampaignKit }) {
  return (
    <div className="space-y-3 px-4 py-3">
      <Section title="✍️ Copies prontas a usar">
        {kit.copies.map((copy, i) => (
          <div key={i} className="rounded-xl p-3 space-y-1"
            style={{ background: C.bg, border: `1px solid ${C.border}` }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] mb-1" style={{ color: C.text3 }}>Variante {i + 1}</p>
                <p className="font-semibold text-[14px]" style={{ color: C.text }}>{copy.headline}</p>
                <p className="text-[13px] mt-1 leading-relaxed" style={{ color: C.text2 }}>{copy.body}</p>
                <p className="text-[13px] mt-1 font-medium" style={{ color: C.green }}>→ {copy.cta}</p>
              </div>
              <CopyBtn text={`${copy.headline}\n\n${copy.body}\n\n${copy.cta}`} />
            </div>
          </div>
        ))}
      </Section>

      <Section title="🎯 Público-alvo">
        {[
          { label: "Demografias",   value: kit.audience.demographics },
          { label: "Interesses",    value: kit.audience.interests },
          { label: "Comportamentos",value: kit.audience.behaviours },
          { label: "Excluir",       value: kit.audience.excludedAudiences },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: C.text3 }}>{label}</p>
            <p className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>{value}</p>
          </div>
        ))}
      </Section>

      <Section title="💰 Orçamento & Licitação">
        {[
          { label: "Distribuição",          value: kit.budgetAllocation.suggestion },
          { label: "Orçamento diário",       value: kit.budgetAllocation.dailyBudget },
          { label: "Estratégia de licitação",value: kit.budgetAllocation.bidStrategy },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: C.text3 }}>{label}</p>
            <p className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>{value}</p>
          </div>
        ))}
      </Section>

      <Section title="🎨 Brief Criativo" defaultOpen={false}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: C.text3 }}>Formatos</p>
          <p className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>{kit.creativeBrief.format}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: C.text3 }}>Conceito visual</p>
          <p className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>{kit.creativeBrief.visualConcept}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold mb-1" style={{ color: C.green }}>✓ Incluir</p>
          <ul className="space-y-0.5">{kit.creativeBrief.doList.map((d, i) => (
            <li key={i} className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>• {d}</li>
          ))}</ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold mb-1" style={{ color: "#C62828" }}>✗ Evitar</p>
          <ul className="space-y-0.5">{kit.creativeBrief.dontList.map((d, i) => (
            <li key={i} className="text-[13px] leading-relaxed" style={{ color: C.text2 }}>• {d}</li>
          ))}</ul>
        </div>
      </Section>

      <Section title="💡 Dicas de Segmentação" defaultOpen={false}>
        <ul className="space-y-1.5">{kit.segmentationTips.map((tip, i) => (
          <li key={i} className="text-[13px] leading-relaxed flex items-start gap-2" style={{ color: C.text2 }}>
            <span style={{ color: C.green }} className="mt-0.5 shrink-0">→</span>{tip}
          </li>
        ))}</ul>
      </Section>

      {kit.keyMetricsToTrack.length > 0 && (
        <Section title="📊 Métricas a monitorar" defaultOpen={false}>
          <div className="flex flex-wrap gap-1.5">
            {kit.keyMetricsToTrack.map((m, i) => (
              <span key={i} className="text-[12px] px-2.5 py-1 rounded-full"
                style={{ background: C.bg, color: C.text2, border: `1px solid ${C.border}` }}>{m}</span>
            ))}
          </div>
          <p className="text-[12px]" style={{ color: C.text3 }}>Alcance estimado: {kit.estimatedReach}</p>
        </Section>
      )}
    </div>
  );
}

// ─── Meta Ads Wizard — WhatsApp Business native design ───────────────────────
const MW_OBJECTIVES = [
  { value: "awareness",       label: "Dar a conhecer",      description: "Alcança mais pessoas na tua zona e aumenta o reconhecimento da tua marca." },
  { value: "traffic",         label: "Visitas ao catálogo", description: "Leva pessoas diretamente para os teus produtos e serviços." },
  { value: "lead_generation", label: "Receber mensagens",   description: "Responde a perguntas e interage com clientes em potencial." },
  { value: "engagement",      label: "Gerar envolvimento",  description: "Aumenta as interações das pessoas com a tua marca." },
] as const;

// ─── Shared native-feel sub-components ───────────────────────────────────────
const SEP = "1px solid #EBEBEB";

function WRadio({ selected, onSelect, label, description, green }: {
  selected: boolean; onSelect: () => void; label: string; description: string; green?: boolean;
}) {
  return (
    <button type="button" onClick={onSelect}
      className="w-full flex items-start gap-4 text-left"
      style={{ padding: "16px 0", borderBottom: SEP }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginTop: 2,
        border: `2px solid ${selected ? "#111" : "#C4C4C4"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {selected && <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#111" }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 15, fontWeight: 600, color: "#111", lineHeight: 1.3 }}>{label}</p>
        <p style={{ fontSize: 13, color: green ? "#16A34A" : "#6B7280", marginTop: 4, lineHeight: 1.5 }}>{description}</p>
      </div>
    </button>
  );
}

function WSourceRow({ icon, label, description, selected, onClick }: {
  icon: React.ReactNode; label: string; description: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-4 text-left"
      style={{ padding: "14px 0", borderBottom: SEP }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
        background: selected ? "#DCFCE7" : "#F5F5F5",
        border: `2px solid ${selected ? "#A5D6A7" : "transparent"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>{label}</p>
        <p style={{ fontSize: 13, color: "#6B7280", marginTop: 3 }}>{description}</p>
      </div>
    </button>
  );
}

function WToggle({ on, onChange, label, description }: {
  on: boolean; onChange: (v: boolean) => void; label: string; description: string;
}) {
  return (
    <div className="flex items-start gap-4" style={{ padding: "16px 0", borderBottom: SEP }}>
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>{label}</p>
        <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4, lineHeight: 1.5 }}>{description}</p>
      </div>
      <button type="button" onClick={() => onChange(!on)}
        style={{
          width: 51, height: 31, borderRadius: 16, padding: 2, border: "none", cursor: "pointer",
          background: on ? "#111" : "#D1D5DB", display: "flex", alignItems: "center",
          transition: "background 0.2s", flexShrink: 0, marginTop: 2,
        }}>
        <div style={{
          width: 27, height: 27, borderRadius: "50%", background: "#FFF",
          transform: on ? "translateX(20px)" : "translateX(0)",
          transition: "transform 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </button>
    </div>
  );
}

function WAgeSlider({ ageMin, ageMax, onChange }: {
  ageMin: number; ageMax: number;
  onChange: (mn: number, mx: number) => void;
}) {
  const TMIN = 13; const TMAX = 65;
  const pMin = ((ageMin - TMIN) / (TMAX - TMIN)) * 100;
  const pMax = ((ageMax - TMIN) / (TMAX - TMIN)) * 100;
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const valueFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    return Math.round(TMIN + ((clientX - rect.left) / rect.width) * (TMAX - TMIN));
  };
  const setThumb = (thumb: "min" | "max", value: number) => {
    const next = Math.min(TMAX, Math.max(TMIN, value));
    if (thumb === "min") onChange(Math.min(next, ageMax), ageMax);
    else onChange(ageMin, Math.max(next, ageMin));
  };
  const onThumbKeyDown = (thumb: "min" | "max", event: React.KeyboardEvent) => {
    const current = thumb === "min" ? ageMin : ageMax;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault(); setThumb(thumb, current - 1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault(); setThumb(thumb, current + 1);
    } else if (event.key === "Home") {
      event.preventDefault(); setThumb(thumb, TMIN);
    } else if (event.key === "End") {
      event.preventDefault(); setThumb(thumb, TMAX);
    }
  };
  const thumbProps = (thumb: "min" | "max", value: number) => ({
    role: "slider",
    tabIndex: 0,
    "aria-label": thumb === "min" ? "Idade mínima" : "Idade máxima",
    "aria-valuemin": TMIN,
    "aria-valuemax": TMAX,
    "aria-valuenow": value,
    onKeyDown: (event: React.KeyboardEvent) => onThumbKeyDown(thumb, event),
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(thumb);
    },
    onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (dragging !== thumb) return;
      const next = valueFromPointer(event.clientX);
      if (next !== null) setThumb(thumb, next);
    },
    onPointerUp: () => setDragging(null),
    onPointerCancel: () => setDragging(null),
  });
  return (
    <div style={{ padding: "16px 0", borderBottom: SEP }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 20 }}>Idade</p>
      <div ref={trackRef} style={{ position: "relative", height: 44, display: "flex", alignItems: "center", touchAction: "none" }}>
        <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "#E5E7EB", borderRadius: 2 }} />
        <div style={{ position: "absolute", height: 3, background: "#111", borderRadius: 2, left: `${pMin}%`, width: `${pMax - pMin}%` }} />
        <button type="button" {...thumbProps("min", ageMin)}
          style={{ position: "absolute", width: 28, height: 28, borderRadius: "50%", background: "#111", border: "3px solid #FFF", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", left: `calc(${pMin}% - 14px)`, top: "50%", transform: "translateY(-50%)", cursor: "grab", zIndex: dragging === "min" ? 6 : 4, padding: 0 }} />
        <button type="button" {...thumbProps("max", ageMax)}
          style={{ position: "absolute", width: 28, height: 28, borderRadius: "50%", background: "#111", border: "3px solid #FFF", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", left: `calc(${pMax}% - 14px)`, top: "50%", transform: "translateY(-50%)", cursor: "grab", zIndex: dragging === "max" ? 6 : 5, padding: 0 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>{ageMin}</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>{ageMax}+</span>
      </div>
    </div>
  );
}

function WTargetingSheet({
  api, kind, selectedLocation, selectedInterests, onClose, onSelectLocation, onToggleInterest,
}: {
  api: ReturnType<typeof businessApi>;
  kind: "location" | "interests";
  selectedLocation: string;
  selectedInterests: string[];
  onClose: () => void;
  onSelectLocation: (item: MetaTargetingSuggestion) => void;
  onToggleInterest: (item: MetaTargetingSuggestion) => void;
}) {
  const [query, setQuery] = useState(kind === "location" ? selectedLocation : "");
  const [results, setResults] = useState<MetaTargetingSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]); setLoading(false); setError(null);
      return;
    }
    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(() => {
      setLoading(true); setError(null);
      const search = kind === "location"
        ? api.searchMetaLocations(q)
        : api.searchMetaInterests(q);
      search
        .then(({ results: next }) => {
          if (currentRequest === requestId.current) setResults(next);
        })
        .catch((err) => {
          if (currentRequest === requestId.current) {
            setResults([]);
            setError(err instanceof Error ? err.message : "Não foi possível pesquisar");
          }
        })
        .finally(() => {
          if (currentRequest === requestId.current) setLoading(false);
        });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [api, kind, query]);

  return (
    <div role="dialog" aria-modal="true" aria-label={kind === "location" ? "Escolher localização" : "Escolher interesses"}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 20, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "flex-end" }}>
      <div onClick={(event) => event.stopPropagation()}
        style={{ width: "100%", maxHeight: "86svh", overflowY: "auto", background: "#FFF", borderRadius: "22px 22px 0 0", padding: "10px 20px 28px", boxSizing: "border-box" }}>
        <div style={{ width: 38, height: 4, borderRadius: 4, background: "#D1D5DB", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>
              {kind === "location" ? "Localização" : "Interesses"}
            </p>
            <p style={{ fontSize: 13, color: "#6B7280", marginTop: 3 }}>
              {kind === "location" ? "Escolhe uma cidade disponível no Meta" : "Escolhe um ou mais interesses do Meta"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ border: 0, background: "#F3F4F6", borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={18} />
          </button>
        </div>
        {kind === "interests" && selectedInterests.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {selectedInterests.map((item) => (
              <span key={item} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 9px", borderRadius: 16, background: "#F0FDF4", color: "#166534", fontSize: 12, fontWeight: 600 }}>
                {item}
                <button type="button" aria-label={`Remover ${item}`} onClick={() => onToggleInterest({ id: "", name: item, type: "interest" })} style={{ border: 0, background: "transparent", padding: 0, color: "#166534", display: "flex" }}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search size={17} style={{ position: "absolute", left: 13, top: 12, color: "#9CA3AF" }} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder={kind === "location" ? "Pesquisar cidade" : "Pesquisar interesse"}
            style={{ width: "100%", height: 42, borderRadius: 12, border: "1px solid #E5E7EB", background: "#F9FAFB", padding: "0 14px 0 40px", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>
        {loading && <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Loader2 size={20} className="animate-spin" style={{ color: "#16A34A" }} /></div>}
        {!loading && error && <p style={{ color: "#C62828", fontSize: 13, padding: "12px 4px" }}>{error}</p>}
        {!loading && !error && query.trim().length < 2 && <p style={{ color: "#9CA3AF", fontSize: 13, padding: "12px 4px" }}>Escreve pelo menos 2 letras para pesquisar.</p>}
        {!loading && !error && query.trim().length >= 2 && results.length === 0 && <p style={{ color: "#6B7280", fontSize: 13, padding: "12px 4px" }}>Nenhum resultado encontrado.</p>}
        {!loading && results.map((item) => {
          const selected = kind === "interests" && selectedInterests.includes(item.name);
          return (
            <button type="button" key={`${item.type}-${item.id}`} onClick={() => kind === "location" ? onSelectLocation(item) : onToggleInterest(item)}
              style={{ width: "100%", border: 0, borderBottom: "1px solid #F0F0F0", background: selected ? "#F0FDF4" : "#FFF", minHeight: 52, display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", textAlign: "left", cursor: "pointer" }}>
              {kind === "location" ? <MapPin size={18} style={{ color: "#16A34A", flexShrink: 0 }} /> : <span style={{ width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${selected ? "#16A34A" : "#D1D5DB"}`, background: selected ? "#16A34A" : "#FFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{selected && <Check size={12} color="#FFF" />}</span>}
              <span style={{ flex: 1, color: "#111", fontSize: 14, fontWeight: selected ? 600 : 500 }}>{item.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WBudgetSlider({ value, minAoa, maxAoa, onChange }: {
  value: number; minAoa: number; maxAoa: number; onChange: (v: number) => void;
}) {
  const pct = Math.min(100, Math.max(0, ((value - minAoa) / (maxAoa - minAoa)) * 100));
  return (
    <div style={{ position: "relative", height: 44, display: "flex", alignItems: "center" }}>
      <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "#E5E7EB", borderRadius: 2 }} />
      <div style={{ position: "absolute", height: 3, background: "#111", borderRadius: 2, left: 0, width: `${pct}%` }} />
      <input type="range" min={minAoa} max={maxAoa} step={500} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ position: "absolute", width: "100%", opacity: 0, cursor: "pointer", margin: 0, height: "100%", zIndex: 2 }} />
      <div style={{ position: "absolute", width: 24, height: 24, borderRadius: "50%", background: "#111", left: `calc(${pct}% - 12px)`, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
}

function WPillCTA({ label, onClick, disabled, loading }: {
  label: string; onClick: () => void; disabled?: boolean; loading?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading}
      style={{
        width: "100%", height: 52, borderRadius: 26,
        background: (disabled || loading) ? "#9CA3AF" : "#111",
        color: "#FFF", fontSize: 16, fontWeight: 600, border: "none",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        cursor: (disabled || loading) ? "not-allowed" : "pointer",
      }}>
      {loading ? <Loader2 size={18} className="animate-spin" /> : label}
    </button>
  );
}

function ObjIllustration() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 16px" }}>
      <svg width="130" height="110" viewBox="0 0 130 110" fill="none">
        <rect x="8" y="10" width="80" height="88" rx="10" fill="#E8F5E9" stroke="#C8E6C9" strokeWidth="1.5"/>
        <rect x="20" y="26" width="56" height="4" rx="2" fill="#C8E6C9"/>
        <rect x="20" y="36" width="40" height="4" rx="2" fill="#C8E6C9"/>
        <rect x="20" y="46" width="50" height="4" rx="2" fill="#C8E6C9"/>
        <path d="M40 62 L58 50 L58 76 L40 64 Z" fill="none" stroke="#1C1C1C" strokeWidth="2" strokeLinejoin="round"/>
        <rect x="30" y="62" width="10" height="14" rx="2" fill="none" stroke="#1C1C1C" strokeWidth="2"/>
        <path d="M40 76 L36 84" stroke="#1C1C1C" strokeWidth="2" strokeLinecap="round"/>
        <path d="M62 54 Q67 63 62 72" stroke="#1C1C1C" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
        <circle cx="100" cy="80" r="24" fill="#16A34A"/>
        <path d="M100 68 C93 68 87 74 87 81 C87 84 88.2 86.6 90 88.5 L88.3 94 L93.8 92.3 C95.6 93.2 97.7 93.8 100 93.8 C107 93.8 113 87.8 113 80.8 C113 73.8 107 68 100 68Z" fill="white"/>
        <path d="M97 75 C96.5 74.5 95.5 74.5 95 75.5 C94.5 76.5 94.5 79 96.5 81 C98.5 83 101 84.2 103 84 C104 83.8 105.2 83 105 82 C104.8 81 104 80.6 103.4 80.4 C102.8 80.2 101.8 80.8 101 80 C100.2 79.2 99 77.4 98.2 76.4 C97.8 75.8 97 75 97 75Z" fill="#16A34A"/>
      </svg>
    </div>
  );
}

function WReviewRow({ icon, label, detail, sub, onEdit }: {
  icon: React.ReactNode; label: string; detail: string; sub?: string; onEdit?: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: SEP }}>
      <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>{label}</p>
        <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{detail}</p>
        {sub && <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{sub}</p>}
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} style={{ padding: 4, flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#BDBDBD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      )}
    </div>
  );
}

const PencilIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#BDBDBD" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
);

function defaultCampaignSetup(campaign: Campaign): CampaignSetup {
  const existing = campaign.campaignSetup;
  return {
    audience: {
      location: existing?.audience?.location ?? "Luanda",
      locationId: existing?.audience?.locationId ?? null,
      ageMin: existing?.audience?.ageMin ?? 18,
      ageMax: existing?.audience?.ageMax ?? 55,
      gender: existing?.audience?.gender ?? "all",
      interests: existing?.audience?.interests ?? "",
      interestIds: existing?.audience?.interestIds ?? [],
      excludedAudiences: existing?.audience?.excludedAudiences ?? "",
    },
    creative: {
      source: existing?.creative?.source ?? "gemini",
      referenceImagePath: existing?.creative?.referenceImagePath ?? null,
      mediaPath: existing?.creative?.mediaPath ?? null,
      mediaMimeType: existing?.creative?.mediaMimeType ?? null,
      prompt: existing?.creative?.prompt ?? "",
      headline: existing?.creative?.headline ?? "",
      body: existing?.creative?.body ?? "",
      callToAction: existing?.creative?.callToAction ?? "LEARN_MORE",
    },
  };
}

function objectStorageUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}api/storage${path}`;
}

function MetaAdsWizard({ api, campaign, onUpdate, onExit }: {
  api: ReturnType<typeof businessApi>;
  campaign: Campaign;
  onUpdate: (c: Campaign) => void;
  onExit: () => void;
}) {
  const [step, setStep] = useState(() => (
    campaign.paymentStatus === "pago" || campaign.paymentStatus === "pendente" ? 4 : 0
  ));
  const [setup, setSetup] = useState<CampaignSetup>(() => defaultCampaignSetup(campaign));
  const [objective, setObjective] = useState(campaign.objective);
  const [budget, setBudget] = useState(campaign.budget || 5000);
  const [durationDays, setDurationDays] = useState(campaign.durationDays || 7);
  const [durationMode, setDurationMode] = useState<"open" | "fixed">("open");
  const [quote, setQuote] = useState<AdsQuote | null>(null);
  const [payMethod, setPayMethod] = useState<"carteira" | "multicaixa">("carteira");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [wizError, setWizError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"creative" | "reference" | null>(null);
  const [editField, setEditField] = useState<string | null>(null);
  const [targetingEditor, setTargetingEditor] = useState<"location" | "interests" | null>(null);
  const creativeInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);

  const paid = campaign.paymentStatus === "pago";
  const creativeReady = campaign.creativeStatus === "pronto" && !!campaign.creativeJson;
  const published = ["em_revisao", "ativa", "pausada", "encerrada"].includes(campaign.publishStatus);
  const paymentPending = campaign.paymentStatus === "pendente";
  const ps = PUBLISH_LABEL[campaign.publishStatus];

  useEffect(() => {
    if (campaign.campaignSetup) setSetup(campaign.campaignSetup);
    setObjective(campaign.objective);
    if (campaign.budget) setBudget(campaign.budget);
    setDurationDays(campaign.durationDays || 7);
  }, [campaign.campaignSetup, campaign.objective, campaign.budget, campaign.durationDays]);

  useEffect(() => {
    api.getAdsQuote(budget).then(setQuote).catch(() => {});
  }, [api, budget]);

  const polling = campaign.creativeStatus === "a_gerar" ||
    campaign.paymentStatus === "pendente" ||
    campaign.publishStatus === "a_publicar";
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => {
      api.getCampaignById(campaign.id).then(({ campaign: c }) => onUpdate(c)).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [api, campaign.id, onUpdate, polling]);

  const run = async (key: string, fn: () => Promise<{ campaign: Campaign }>) => {
    setBusy(key); setWizError(null);
    try { const { campaign: c } = await fn(); onUpdate(c); }
    catch (e) { setWizError(e instanceof Error ? e.message : "Erro inesperado"); }
    finally { setBusy(null); }
  };

  const saveObjective = async (v: string) => {
    const previous = objective;
    setObjective(v); setBusy("objective"); setWizError(null);
    try {
      const { campaign: c } = await api.updateCampaignStatus(campaign.id, { objective: v });
      onUpdate(c);
    } catch (e) {
      setObjective(previous);
      setWizError(e instanceof Error ? e.message : "Não foi possível guardar o objetivo");
    } finally {
      setBusy(null);
    }
  };

  const saveSetup = async (nextStep: number) => {
    await run("save", async () => {
      const c = await api.updateCampaignSetup(campaign.id, setup);
      setStep(nextStep); setEditField(null);
      return c;
    });
  };

  const saveBudget = async () => {
    const minAoa = quote?.minBudgetAoa ?? 5000;
    if (budget < minAoa) { setWizError(`Orçamento mínimo: ${minAoa.toLocaleString("pt-AO")} Kz`); return; }
    await run("budget", async () => {
      const c = await api.updateCampaignStatus(campaign.id, { budget, durationDays: durationMode === "fixed" ? durationDays : 30 });
      setQuote(await api.getAdsQuote(budget));
      setStep(4);
      return c;
    });
  };

  const handleFile = async (file: File | undefined, kind: "creative" | "reference") => {
    if (!file) return;
    setUploading(kind); setWizError(null);
    try {
      const path = await uploadPrivateImage(file, api.slug);
      setSetup((s) => ({
        ...s,
        creative: {
          ...s.creative,
          ...(kind === "creative"
            ? { source: "upload" as const, mediaPath: path, mediaMimeType: file.type }
            : { referenceImagePath: path }),
        },
      }));
    } catch (e) { setWizError(e instanceof Error ? e.message : "Não foi possível carregar a imagem"); }
    finally { setUploading(null); }
  };

  const generate = async () => {
    await run("generate", async () => {
      const saved = await api.updateCampaignSetup(campaign.id, setup);
      onUpdate(saved.campaign);
      return api.generateCampaignCreative(campaign.id);
    });
  };

  const aud = setup.audience;
  const cre = setup.creative;
  const selObj = MW_OBJECTIVES.find((o) => o.value === objective);
  const minAoa = quote?.minBudgetAoa ?? 5000;
  const maxAoa = Math.max(minAoa * 40, 1_000_000);
  const budgetUsd = quote ? (budget / quote.fxRateAoaPerUsd).toFixed(2) : null;
  const selectedInterests = aud.interests.split(",").map((item) => item.trim()).filter(Boolean);
  const selectLocation = (item: MetaTargetingSuggestion) => {
    setSetup((s) => ({
      ...s,
      audience: { ...s.audience, location: item.name, locationId: item.id },
    }));
    setTargetingEditor(null);
  };
  const toggleInterest = (item: MetaTargetingSuggestion) => {
    setSetup((s) => {
      const names = s.audience.interests.split(",").map((name) => name.trim()).filter(Boolean);
      const ids = s.audience.interestIds ?? [];
      const index = names.findIndex((name) => name === item.name);
      if (index >= 0) {
        return {
          ...s,
          audience: {
            ...s.audience,
            interests: names.filter((_, i) => i !== index).join(", "),
            interestIds: ids.filter((_, i) => i !== index),
          },
        };
      }
      return {
        ...s,
        audience: {
          ...s.audience,
          interests: [...names, item.name].join(", "),
          interestIds: [...ids, item.id],
        },
      };
    });
  };

  return (
    <div style={{
      background: "#FFF",
      height: "100%",
      minHeight: 0,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
    }}>
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 3,
        height: 64,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 20px",
        background: "#FFF",
        borderBottom: SEP,
      }}>
        <button type="button" onClick={onExit} aria-label="Voltar às campanhas"
          style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: "#111", padding: 0 }}>
          <ArrowLeft size={24} strokeWidth={1.8} />
        </button>
        <h1 style={{ flex: 1, fontSize: 22, fontWeight: 500, color: "#111", lineHeight: 1 }}>
          Criar anúncio
        </h1>
      </div>

      {/* Thin progress bar */}
      <div style={{ height: 3, background: "#F0F0F0" }}>
        <div style={{ height: 3, background: "#111", width: `${((step + 1) / 5) * 100}%`, transition: "width 0.35s ease" }} />
      </div>

      {/* Error */}
      {wizError && (
        <div style={{ margin: "12px 24px 0", padding: "10px 14px", borderRadius: 10, background: "#FFEBEE", color: "#C62828", fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {wizError}
        </div>
      )}

      {/* ── Step 0: Objective ── */}
      {step === 0 && (
        <div style={{ padding: "0 24px" }}>
          <ObjIllustration />
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#111", lineHeight: 1.25, marginBottom: 4 }}>
            O que queres que as pessoas façam quando virem o teu anúncio?
          </h2>
          <div style={{ marginTop: 8 }}>
            {MW_OBJECTIVES.map((o) => (
              <WRadio key={o.value} selected={objective === o.value} onSelect={() => void saveObjective(o.value)}
                label={o.label} description={o.description} />
            ))}
          </div>
          <div style={{ position: "sticky", bottom: 0, background: "#FFF", paddingTop: 16, paddingBottom: 32 }}>
            <WPillCTA label="Avançar" onClick={() => setStep(1)} disabled={!objective} />
          </div>
        </div>
      )}

      {/* ── Step 1: Creative ── */}
      {step === 1 && (
        <div style={{ padding: "0 24px" }}>
          <div style={{ padding: "20px 0 4px" }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: "#111", marginBottom: 4 }}>Criativo</h2>
            <p style={{ fontSize: 13, color: "#6B7280" }}>Criar anúncio a partir de</p>
          </div>

          <WSourceRow selected={cre.source === "upload"}
            onClick={() => setSetup((s) => ({ ...s, creative: { ...s.creative, source: "upload" as const, ...(s.creative.source !== "upload" ? { mediaPath: null, mediaMimeType: null } : {}) } }))}
            icon={<ImagePlus size={22} style={{ color: cre.source === "upload" ? "#16A34A" : "#6B7280" }} />}
            label="Da tua galeria" description="Enviar uma foto ou vídeo do teu negócio" />
          <WSourceRow selected={cre.source === "gemini"}
            onClick={() => setSetup((s) => ({ ...s, creative: { ...s.creative, source: "gemini" as const, ...(s.creative.source !== "gemini" ? { mediaPath: null } : {}) } }))}
            icon={<WandSparkles size={22} style={{ color: cre.source === "gemini" ? "#16A34A" : "#6B7280" }} />}
            label="Gerar com Gemini IA" description="Criar uma imagem publicitária com inteligência artificial" />

          {cre.source === "upload" && (
            <div style={{ marginTop: 16 }}>
              <input ref={creativeInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { void handleFile(e.target.files?.[0], "creative"); e.currentTarget.value = ""; }} />
              {cre.mediaPath ? (
                <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
                  <img src={objectStorageUrl(cre.mediaPath)} alt="Criativo" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                  <button onClick={() => creativeInput.current?.click()}
                    style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.65)", color: "#fff", border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    Trocar foto
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => creativeInput.current?.click()} disabled={uploading !== null}
                  style={{ width: "100%", borderRadius: 12, border: "2px dashed #D1D5DB", background: "#FAFAFA", padding: "40px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 12, boxSizing: "border-box" }}>
                  {uploading === "creative" ? <Loader2 size={24} className="animate-spin" style={{ color: "#6B7280" }} /> : <ImagePlus size={24} style={{ color: "#6B7280" }} />}
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>Adicionar foto</span>
                  <span style={{ fontSize: 13, color: "#6B7280" }}>da tua galeria</span>
                </button>
              )}
              <button type="button" onClick={() => setEditField(editField === "desc" ? null : "desc")}
                style={{ width: "100%", borderRadius: 12, border: "1px solid #E5E7EB", background: "#F9FAFB", padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", marginTop: 4, marginBottom: 8, boxSizing: "border-box" }}>
                <span style={{ fontSize: 15, color: cre.headline ? "#111" : "#9CA3AF" }}>{cre.headline || "Adicionar descrição"}</span>
                <PencilIcon />
              </button>
              {editField === "desc" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                  <input value={cre.headline} maxLength={40}
                    onChange={(e) => setSetup((s) => ({ ...s, creative: { ...s.creative, headline: e.target.value } }))}
                    placeholder="Título (máx. 40 caracteres)"
                    style={{ width: "100%", borderRadius: 10, border: "1px solid #E5E7EB", padding: "11px 14px", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  <textarea value={cre.body} maxLength={300}
                    onChange={(e) => setSetup((s) => ({ ...s, creative: { ...s.creative, body: e.target.value } }))}
                    placeholder="Texto do anúncio" rows={3}
                    style={{ width: "100%", borderRadius: 10, border: "1px solid #E5E7EB", padding: "11px 14px", fontSize: 14, outline: "none", resize: "none", boxSizing: "border-box" }} />
                </div>
              )}
            </div>
          )}

          {cre.source === "gemini" && (
            <div style={{ marginTop: 16 }}>
              <input ref={referenceInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { void handleFile(e.target.files?.[0], "reference"); e.currentTarget.value = ""; }} />
              {creativeReady && campaign.creativeJson ? (
                <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
                  <img src={campaign.creativeJson.mediaUrl} alt="Criativo" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                  <div style={{ padding: "12px 16px", background: "#F9FAFB", borderTop: "1px solid #EBEBEB" }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{campaign.creativeJson.headline}</p>
                    <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>{campaign.creativeJson.body}</p>
                  </div>
                </div>
              ) : (
                <div style={{ borderRadius: 12, border: "2px dashed #D1D5DB", background: "#FAFAFA", padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  {campaign.creativeStatus === "a_gerar" ? (
                    <><Loader2 size={24} className="animate-spin" style={{ color: "#16A34A" }} /><span style={{ fontSize: 14, color: "#6B7280" }}>A criar a imagem…</span></>
                  ) : campaign.creativeStatus === "erro" ? (
                    <><AlertCircle size={24} style={{ color: "#C62828", flexShrink: 0 }} /><span style={{ fontSize: 13, color: "#C62828", lineHeight: 1.45, overflowWrap: "anywhere" }}>{readableCreativeError(campaign.creativeError)}</span></>
                  ) : (
                    <><Sparkles size={24} style={{ color: "#16A34A" }} /><span style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>Pré-visualização</span><span style={{ fontSize: 13, color: "#6B7280" }}>aparecerá aqui após geração</span></>
                  )}
                </div>
              )}
              <button type="button" onClick={() => referenceInput.current?.click()} disabled={uploading !== null}
                style={{ width: "100%", borderRadius: 10, border: "1px solid #E5E7EB", background: "#F9FAFB", padding: "11px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 10, boxSizing: "border-box" }}>
                <ImagePlus size={18} style={{ color: "#6B7280", flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: "#6B7280" }}>{cre.referenceImagePath ? "Trocar imagem de referência" : "Adicionar referência (opcional)"}</span>
              </button>
              {cre.referenceImagePath && (
                <img src={objectStorageUrl(cre.referenceImagePath)} alt="Referência"
                  style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 10, marginBottom: 10 }} />
              )}
              <textarea value={cre.prompt}
                onChange={(e) => setSetup((s) => ({ ...s, creative: { ...s.creative, prompt: e.target.value } }))}
                placeholder="Descreve o estilo ou mensagem que queres (opcional)"
                rows={3} style={{ width: "100%", borderRadius: 10, border: "1px solid #E5E7EB", padding: "11px 14px", fontSize: 14, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 10 }} />
              <button type="button" onClick={() => void generate()} disabled={busy !== null || campaign.creativeStatus === "a_gerar"}
                style={{ width: "100%", borderRadius: 24, background: "#16A34A", color: "#fff", height: 46, fontSize: 15, fontWeight: 600, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", opacity: busy ? 0.7 : 1, marginBottom: 6 }}>
                {busy === "generate" || campaign.creativeStatus === "a_gerar" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {campaign.creativeStatus === "a_gerar" ? "A criar…" : creativeReady ? "Gerar nova imagem" : "Gerar imagem com Gemini"}
              </button>
            </div>
          )}

          <div style={{ position: "sticky", bottom: 0, background: "#FFF", paddingTop: 16, paddingBottom: 32 }}>
            <WPillCTA label="Avançar" onClick={() => void saveSetup(2)}
              loading={busy === "save"}
              disabled={busy !== null || (cre.source === "upload" && !cre.mediaPath) || (cre.source === "gemini" && !creativeReady)} />
          </div>
        </div>
      )}

      {/* ── Step 2: Audience ── */}
      {step === 2 && (
        <div style={{ padding: "0 24px" }}>
          <div style={{ paddingTop: 24 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: "#111", lineHeight: 1.25, marginBottom: 4 }}>
              Escolhe para quem o anúncio será exibido
            </h2>
            <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 8, lineHeight: 1.5 }}>
              O Meta pode otimizar automaticamente a entrega para melhores resultados.
            </p>
          </div>

          <WToggle on label="Público Advantage+"
            description="Encontra e adapta automaticamente o público para ajudar a melhorar o desempenho do anúncio."
            onChange={() => {}} />

          {/* Location */}
          <div style={{ padding: "14px 0", borderBottom: SEP }}>
            <button type="button" className="flex items-center justify-between" style={{ width: "100%", cursor: "pointer", border: 0, background: "transparent", padding: 0, textAlign: "left" }}
              onClick={() => setTargetingEditor("location")}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>Localizações</p>
                <p style={{ fontSize: 13, color: aud.locationId ? "#6B7280" : "#C62828", marginTop: 3 }}>{aud.locationId ? aud.location : "Seleciona uma cidade"}</p>
              </div>
              <PencilIcon />
            </button>
          </div>

          {/* Interests */}
          <div style={{ padding: "14px 0", borderBottom: SEP }}>
            <button type="button" className="flex items-center justify-between" style={{ width: "100%", cursor: "pointer", border: 0, background: "transparent", padding: 0, textAlign: "left" }}
              onClick={() => setTargetingEditor("interests")}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>Interesses</p>
                <p style={{ fontSize: 13, color: "#6B7280", marginTop: 3 }}>{selectedInterests.length ? selectedInterests.join(", ") : "Adicionar interesses do Meta"}</p>
              </div>
              <PencilIcon />
            </button>
          </div>

          {/* Gender */}
          <div style={{ padding: "16px 0", borderBottom: SEP }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 12 }}>Género</p>
            <div style={{ display: "flex", gap: 8 }}>
              {([ ["all", "Todos"], ["female", "Mulheres"], ["male", "Homens"] ] as const).map(([v, l]) => (
                <button key={v} type="button"
                  onClick={() => setSetup((s) => ({ ...s, audience: { ...s.audience, gender: v } }))}
                  style={{ flex: 1, height: 38, borderRadius: 20, border: `1.5px solid ${aud.gender === v ? "#111" : "#E5E7EB"}`, background: aud.gender === v ? "#111" : "#FFF", color: aud.gender === v ? "#FFF" : "#6B7280", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Age slider */}
          <WAgeSlider ageMin={aud.ageMin} ageMax={aud.ageMax}
            onChange={(mn, mx) => setSetup((s) => ({ ...s, audience: { ...s.audience, ageMin: mn, ageMax: mx } }))} />

          {aud.ageMin < 21 && (
            <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, border: "1px solid #E5E7EB", background: "#F9FAFB", display: "flex", gap: 10 }}>
              <AlertCircle size={16} style={{ color: "#6B7280", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>
                Selecionar idades abaixo de 21 anos pode limitar as opções disponíveis.
              </p>
            </div>
          )}

          <div style={{ height: 80 }} />
          <div style={{ position: "sticky", bottom: 0, background: "#FFF", paddingTop: 12, paddingBottom: 32 }}>
            <WPillCTA label="Guardar" onClick={() => void saveSetup(3)}
              loading={busy === "save"} disabled={busy !== null || !aud.locationId} />
          </div>
        </div>
      )}

      {/* ── Step 3: Budget ── */}
      {step === 3 && (
        <div style={{ padding: "0 24px" }}>
          <div style={{ paddingTop: 24 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: "#111", lineHeight: 1.25, marginBottom: 4 }}>
              Qual é o orçamento para o anúncio?
            </h2>
            <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.5, marginBottom: 24 }}>
              O orçamento e a duração afetam o alcance do anúncio.
            </p>
          </div>

          {/* Big centered budget value */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 40, fontWeight: 700, color: "#111", letterSpacing: -1 }}>
              {budget.toLocaleString("pt-AO")} <span style={{ fontSize: 20 }}>Kz</span>
            </span>
          </div>

          {/* Slider */}
          <WBudgetSlider value={budget} minAoa={minAoa} maxAoa={maxAoa} onChange={setBudget} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: "#9CA3AF" }}>{minAoa.toLocaleString("pt-AO")} Kz</span>
            <span style={{ fontSize: 13, color: "#9CA3AF" }}>{maxAoa.toLocaleString("pt-AO")} Kz</span>
          </div>

          {budgetUsd && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, padding: "10px 14px", background: "#F0FDF4", borderRadius: 10 }}>
              <Check size={15} style={{ color: "#16A34A", flexShrink: 0 }} />
              <p style={{ fontSize: 13, color: "#374151" }}>
                ≈ <strong>${budgetUsd}</strong> · câmbio {quote?.fxRateAoaPerUsd.toLocaleString("pt-AO")} Kz/USD
              </p>
            </div>
          )}

          {/* Duration */}
          <p style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 4 }}>Duração</p>
          <WRadio selected={durationMode === "open"} onSelect={() => setDurationMode("open")}
            label="Veicular até eu pausar"
            description="Recomendado" green />
          <WRadio selected={durationMode === "fixed"} onSelect={() => setDurationMode("fixed")}
            label="Veicular por um tempo definido"
            description="Define um período específico para o anúncio." />
          {durationMode === "fixed" && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
              <span style={{ fontSize: 14, color: "#6B7280" }}>Duração:</span>
              <input type="number" min={1} max={90} value={durationDays}
                onChange={(e) => setDurationDays(Math.min(90, Math.max(1, Number(e.target.value) || 7)))}
                style={{ width: 80, borderRadius: 10, border: "1px solid #E5E7EB", padding: "10px 14px", fontSize: 15, fontWeight: 600, textAlign: "center", outline: "none" }} />
              <span style={{ fontSize: 14, color: "#6B7280" }}>dias</span>
            </div>
          )}

          <div style={{ height: 80 }} />
          <div style={{ position: "sticky", bottom: 0, background: "#FFF", paddingTop: 12, paddingBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: "#6B7280" }}>Orçamento total</span>
              <strong style={{ fontSize: 13, color: "#111" }}>{budget.toLocaleString("pt-AO")} Kz</strong>
            </div>
            <WPillCTA label="Avançar" onClick={() => void saveBudget()} loading={busy === "budget"} disabled={busy !== null} />
          </div>
        </div>
      )}

      {/* ── Step 4: Review & Pay ── */}
      {step === 4 && (
        <div style={{ padding: "0 24px" }}>
          <div style={{ paddingTop: 24 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: "#111", lineHeight: 1.25, marginBottom: 4 }}>
              {paid ? (published ? "Anúncio publicado! 🎉" : "Anúncio pronto para publicar") : "O teu anúncio está pronto"}
            </h2>
            <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.5, marginBottom: 4 }}>
              {paid ? "Confirma o estado do teu anúncio no Meta." : "Confirma os detalhes e escolhe a forma de pagamento."}
            </p>
          </div>

          <WReviewRow
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>}
            label={selObj?.label ?? "Objetivo"} detail="Meta Ads"
            onEdit={!paid ? () => setStep(0) : undefined} />

          <WReviewRow
            icon={
              <div style={{ width: 36, height: 36, borderRadius: 6, overflow: "hidden", background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {creativeReady && campaign.creativeJson
                  ? <img src={campaign.creativeJson.mediaUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                  : <ImagePlus size={16} style={{ color: "#9CA3AF" }} />}
              </div>
            }
            label="Pré-visualização" detail={cre.source === "gemini" ? "Imagem gerada pela Gemini" : "Imagem própria"}
            onEdit={!paid ? () => setStep(1) : undefined} />

          <WReviewRow
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>}
            label="Público"
            detail={`${aud.location || "Angola"} · ${aud.ageMin}–${aud.ageMax}+ anos · ${aud.gender === "all" ? "Todos" : aud.gender === "female" ? "Mulheres" : "Homens"}`}
            sub="Público Advantage+: ativado"
            onEdit={!paid ? () => setStep(2) : undefined} />

          <WReviewRow
            icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>}
            label={`${campaign.budget.toLocaleString("pt-AO")} Kz${durationMode === "fixed" ? ` · ${campaign.durationDays} dias` : " · sem fim definido"}`}
            detail="Orçamento total"
            onEdit={!paid ? () => setStep(3) : undefined} />

          {quote?.simulated && (
            <div style={{ margin: "12px 0", padding: "12px 16px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A", display: "flex", gap: 10 }}>
              <AlertCircle size={16} style={{ color: "#D97706", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13, color: "#92400E", lineHeight: 1.5 }}>Modo de teste: nenhum anúncio real será publicado no Meta.</p>
            </div>
          )}

          {!paid && !paymentPending && (
            <>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#111", marginTop: 20, marginBottom: 12 }}>Forma de pagamento</p>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                {([ ["carteira", "Carteira Linkealls", <Wallet key="w" size={18} />], ["multicaixa", "Multicaixa Express", <Smartphone key="m" size={18} />] ] as const).map(([m, l, icon]) => (
                  <button key={m} type="button" onClick={() => setPayMethod(m)}
                    style={{ flex: 1, padding: "14px 8px", borderRadius: 14, border: `1.5px solid ${payMethod === m ? "#111" : "#E5E7EB"}`, background: payMethod === m ? "#111" : "#FFF", color: payMethod === m ? "#FFF" : "#6B7280", fontSize: 13, fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    {icon}{l}
                  </button>
                ))}
              </div>
              {payMethod === "multicaixa" && (
                <input value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="Nº Telemóvel (9XXXXXXXX)" inputMode="tel"
                  style={{ width: "100%", borderRadius: 10, border: "1px solid #E5E7EB", padding: "13px 16px", fontSize: 15, outline: "none", marginBottom: 4, boxSizing: "border-box" }} />
              )}
            </>
          )}

          {paymentPending && (
            <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 12, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#92400E" }}>Pagamento em confirmação</p>
              <p style={{ fontSize: 13, color: "#B45309", marginTop: 4 }}>Estamos a aguardar a confirmação do Multicaixa Express. Não repitas o pagamento.</p>
            </div>
          )}

          {paid && published && (
            <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 12, background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#15803D" }}>Campanha activa no Meta</p>
              <p style={{ fontSize: 13, color: "#16A34A", marginTop: 4 }}>Estado: {ps.label}</p>
            </div>
          )}

          <div style={{ height: 100 }} />
          <div style={{ position: "sticky", bottom: 0, background: "#FFF", paddingTop: 12, paddingBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: "#6B7280" }}>Estimativa de impressões</span>
              <strong style={{ fontSize: 13, color: "#111" }}>10 mil – 20 mil / dia</strong>
            </div>
            {!paid && !paymentPending ? (
              <WPillCTA
                label={`Pagar e criar anúncio · ${campaign.budget.toLocaleString("pt-AO")} Kz`}
                onClick={() => void run("pay", () => api.payCampaign(campaign.id, payMethod === "carteira" ? { method: "carteira" } : { method: "multicaixa", phone }))}
                loading={busy === "pay"}
                disabled={busy !== null || (payMethod === "multicaixa" && !/^9\d{8}$/.test(phone.replace(/\s/g, "")))} />
            ) : paymentPending ? null : !published ? (
              <WPillCTA label="Publicar no Meta"
                onClick={() => void run("publish", () => api.publishCampaign(campaign.id))}
                loading={busy === "publish"} disabled={busy !== null} />
            ) : null}
            <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
              Ao criar este anúncio, concordas com os Termos e Condições da Meta.
            </p>
          </div>
        </div>
      )}
      {targetingEditor && (
        <WTargetingSheet
          api={api}
          kind={targetingEditor}
          selectedLocation={aud.location}
          selectedInterests={selectedInterests}
          onClose={() => setTargetingEditor(null)}
          onSelectLocation={selectLocation}
          onToggleInterest={toggleInterest}
        />
      )}
    </div>
  );
}

// ─── Legacy publish flow (TikTok/Facebook/Instagram history) ──────────────────
const PUBLISH_LABEL: Record<CampaignPublishStatus, { label: string; color: string; bg: string }> = {
  nao_publicada: { label: "Não publicada", color: "#6B7280", bg: "#F3F4F6" },
  a_publicar:    { label: "A publicar…",   color: "#E65100", bg: "#FFF8E1" },
  em_revisao:    { label: "Em revisão",    color: "#E65100", bg: "#FFF8E1" },
  ativa:         { label: "Ativa",         color: "#1B5E20", bg: "#E8F5E9" },
  pausada:       { label: "Pausada",       color: "#E65100", bg: "#FFF8E1" },
  encerrada:     { label: "Encerrada",     color: "#6B7280", bg: "#F3F4F6" },
  rejeitada:     { label: "Rejeitada",     color: "#C62828", bg: "#FFEBEE" },
  erro:          { label: "Erro",          color: "#C62828", bg: "#FFEBEE" },
};

function StepCard({ n, title, done, active, children }: {
  n: number; title: string; done: boolean; active: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-3.5 space-y-2.5"
      style={{ background: C.white, border: `1px solid ${done ? "#A5D6A7" : C.border}`, opacity: active || done ? 1 : 0.55 }}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
          style={{ background: done ? C.green : C.bg, color: done ? "#fff" : C.text2, border: done ? "none" : `1px solid ${C.border}` }}>
          {done ? <Check size={13} /> : n}
        </div>
        <p className="text-[13px] font-semibold" style={{ color: C.text }}>{title}</p>
      </div>
      {(active || done) && children}
    </div>
  );
}

function LegacyPublishFlow({ api, campaign, onUpdate }: {
  api: ReturnType<typeof businessApi>;
  campaign: Campaign;
  onUpdate: (c: Campaign) => void;
}) {
  const [quote, setQuote] = useState<AdsQuote | null>(null);
  const [payMethod, setPayMethod] = useState<"carteira" | "multicaixa">("carteira");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getAdsQuote(campaign.budget).then(setQuote).catch(() => {});
  }, [api, campaign.budget]);

  // Poll while payment pending or creative generating or a_publicar
  const polling = campaign.paymentStatus === "pendente" || campaign.creativeStatus === "a_gerar" || campaign.publishStatus === "a_publicar";
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => {
      api.getCampaignById(campaign.id).then(({ campaign: c }) => onUpdate(c)).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [polling, api, campaign.id, onUpdate]);

  const run = async (key: string, fn: () => Promise<{ campaign: Campaign }>) => {
    setBusy(key); setErr(null);
    try { const { campaign: c } = await fn(); onUpdate(c); }
    catch (e) { setErr(e instanceof Error ? e.message : "Erro inesperado"); }
    finally { setBusy(null); }
  };

  const paid = campaign.paymentStatus === "pago";
  const creativeReady = campaign.creativeStatus === "pronto" && !!campaign.creativeJson;
  const published = ["em_revisao", "ativa", "pausada", "encerrada"].includes(campaign.publishStatus);
  const ps = PUBLISH_LABEL[campaign.publishStatus];
  const isTikTok = campaign.platform === "tiktok";
  const unsupported = campaign.platform === "google";

  return (
    <div className="space-y-3 px-4 py-3">
      {/* Status banner */}
      <div className="rounded-2xl px-3.5 py-3 flex items-center justify-between"
        style={{ background: ps.bg, border: `1px solid ${ps.color}22` }}>
        <div>
          <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: ps.color }}>Anúncio real</p>
          <p className="text-[15px] font-bold" style={{ color: ps.color }}>{ps.label}</p>
        </div>
        {quote?.simulated && published && (
          <span className="text-[10px] px-2 py-1 rounded-full font-semibold" style={{ background: "#FFF", color: "#E65100" }}>
            SIMULAÇÃO
          </span>
        )}
      </div>

      {campaign.publishError && (
        <div className="rounded-xl px-3.5 py-2.5 text-[12px]" style={{ background: "#FFEBEE", color: "#C62828" }}>
          {campaign.publishError}
        </div>
      )}
      {err && (
        <div className="rounded-xl px-3.5 py-2.5 text-[12px] flex items-start gap-2" style={{ background: "#FFEBEE", color: "#C62828" }}>
          <AlertCircle size={13} className="shrink-0 mt-0.5" /> {err}
        </div>
      )}

      {unsupported ? (
        <div className="rounded-2xl p-4 text-[13px]" style={{ background: C.white, border: `1px solid ${C.border}`, color: C.text2 }}>
          Google Ads ainda não está disponível para publicação automática. Cria uma campanha TikTok, Facebook ou Instagram.
        </div>
      ) : (
        <>
          {/* Step 1 — Pay */}
          <StepCard n={1} title="Pagar o orçamento em Kz" done={paid} active={!paid}>
            {!paid ? (
              <>
                {quote?.simulated && (
                  <div className="rounded-xl px-3 py-2 text-[12px] font-medium flex items-start gap-1.5"
                    style={{ background: "#FFF8E1", color: "#E65100", border: "1px solid #FFE082" }}>
                    <AlertCircle size={13} className="shrink-0 mt-0.5" />
                    Modo de teste: nenhum anúncio real será publicado. Não uses dinheiro real neste modo.
                  </div>
                )}
                <p className="text-[12px]" style={{ color: C.text2 }}>
                  Orçamento: <b style={{ color: C.text }}>{campaign.budget.toLocaleString("pt-AO")} Kz</b> · {campaign.durationDays} dias
                  {quote && quote.budgetUsd > 0 && (
                    <> · ≈ <b style={{ color: C.text }}>${quote.budgetUsd.toFixed(2)}</b> em anúncios (câmbio {quote.fxRateAoaPerUsd.toLocaleString("pt-AO")} Kz/USD)</>
                  )}
                </p>
                {quote && campaign.budget < quote.minBudgetAoa && (
                  <p className="text-[12px]" style={{ color: "#C62828" }}>
                    Orçamento mínimo: {quote.minBudgetAoa.toLocaleString("pt-AO")} Kz — edita a campanha.
                  </p>
                )}
                {campaign.paymentStatus === "pendente" ? (
                  <div className="flex items-center gap-2 text-[13px]" style={{ color: "#E65100" }}>
                    <Loader2 size={14} className="animate-spin" /> Aguarda a confirmação no Multicaixa Express…
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      {([["carteira", "Carteira", <Wallet key="w" size={13} />], ["multicaixa", "Multicaixa", <Smartphone key="m" size={13} />]] as const).map(([m, label, icon]) => (
                        <button key={m} onClick={() => setPayMethod(m)}
                          className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold rounded-xl py-2"
                          style={{
                            background: payMethod === m ? "#E8F5E9" : C.bg,
                            color: payMethod === m ? "#1B5E20" : C.text2,
                            border: `1px solid ${payMethod === m ? "#A5D6A7" : C.border}`,
                          }}>
                          {icon}{label}
                        </button>
                      ))}
                    </div>
                    {payMethod === "multicaixa" && (
                      <input value={phone} onChange={(e) => setPhone(e.target.value)}
                        placeholder="Telemóvel (9XXXXXXXX)" inputMode="tel"
                        className="w-full rounded-xl px-3 py-2 text-[14px] outline-none"
                        style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
                    )}
                    {campaign.paymentStatus === "falhado" && (
                      <p className="text-[12px]" style={{ color: "#C62828" }}>O pagamento anterior falhou — tenta de novo.</p>
                    )}
                    <button
                      onClick={() => run("pay", () => api.payCampaign(campaign.id,
                        payMethod === "carteira" ? { method: "carteira" } : { method: "multicaixa", phone }))}
                      disabled={busy !== null || (payMethod === "multicaixa" && !/^9\d{8}$/.test(phone.replace(/\s/g, "")))}
                      className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold rounded-full py-2.5"
                      style={{ background: C.green, color: "#fff", opacity: busy ? 0.7 : 1 }}>
                      {busy === "pay" ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
                      Pagar {campaign.budget.toLocaleString("pt-AO")} Kz
                    </button>
                  </>
                )}
              </>
            ) : (
              <p className="text-[12px]" style={{ color: C.text2 }}>
                Pago {campaign.paymentMethod === "carteira" ? "com a carteira" : "por Multicaixa Express"} · ≈ ${Number(campaign.budgetUsd ?? 0).toFixed(2)} (câmbio {Number(campaign.fxRateAoaPerUsd ?? 0).toLocaleString("pt-AO")} Kz/USD)
              </p>
            )}
          </StepCard>

          {/* Step 2 — Creative */}
          <StepCard n={2} title={isTikTok ? "Gerar vídeo do anúncio com IA" : "Gerar imagem do anúncio com IA"}
            done={creativeReady} active={paid}>
            {campaign.creativeStatus === "a_gerar" && (
              <div className="flex items-center gap-2 text-[13px]" style={{ color: "#E65100" }}>
                <Loader2 size={14} className="animate-spin" />
                {isTikTok ? "A gerar o vídeo… pode demorar 1-3 minutos" : "A gerar a imagem…"}
              </div>
            )}
            {campaign.creativeStatus === "erro" && (
              <p className="text-[12px] leading-relaxed" style={{ color: "#C62828", overflowWrap: "anywhere" }}>{readableCreativeError(campaign.creativeError)}</p>
            )}
            {creativeReady && campaign.creativeJson && (
              <div className="space-y-2">
                {campaign.creativeJson.mediaType === "video" ? (
                  <video src={campaign.creativeJson.mediaUrl} controls playsInline
                    className="w-full rounded-xl" style={{ maxHeight: 320, background: "#000" }} />
                ) : (
                  <img src={campaign.creativeJson.mediaUrl} alt="Criativo do anúncio" className="w-full rounded-xl" />
                )}
                <p className="text-[14px] font-semibold" style={{ color: C.text }}>{campaign.creativeJson.headline}</p>
                <p className="text-[13px]" style={{ color: C.text2 }}>{campaign.creativeJson.body}</p>
                {campaign.creativeJson.productNames.length > 0 && (
                  <p className="text-[11px]" style={{ color: C.text3 }}>
                    Produtos: {campaign.creativeJson.productNames.join(", ")}
                  </p>
                )}
              </div>
            )}
            {paid && campaign.creativeStatus !== "a_gerar" && !published && (
              <button
                onClick={() => run("creative", () => api.generateCampaignCreative(campaign.id))}
                disabled={busy !== null}
                className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold rounded-full py-2.5"
                style={{
                  background: creativeReady ? "#E8F5E9" : C.green,
                  color: creativeReady ? "#1B5E20" : "#fff",
                  border: creativeReady ? "1px solid #A5D6A7" : "none",
                  opacity: busy ? 0.7 : 1,
                }}>
                {busy === "creative" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {creativeReady ? "Regenerar criativo" : "Gerar criativo com IA"}
              </button>
            )}
          </StepCard>

          {/* Step 3 — Publish */}
          <StepCard n={3} title="Publicar o anúncio" done={published} active={paid && creativeReady}>
            {!published ? (
              <button
                onClick={() => run("publish", () => api.publishCampaign(campaign.id))}
                disabled={busy !== null || !paid || !creativeReady}
                className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold rounded-full py-2.5"
                style={{ background: "#111827", color: "#fff", opacity: busy || !paid || !creativeReady ? 0.6 : 1 }}>
                {busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                Publicar no {isTikTok ? "TikTok" : campaign.platform === "instagram" ? "Instagram" : "Facebook"}
              </button>
            ) : (
              <>
                {/* Real metrics */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Impressões", value: campaign.syncedImpressions.toLocaleString("pt-AO"), icon: <Eye size={13} /> },
                    { label: "Cliques", value: campaign.syncedClicks.toLocaleString("pt-AO"), icon: <MousePointerClick size={13} /> },
                    { label: "Gasto", value: `${campaign.totalSpend.toLocaleString("pt-AO")} Kz`, icon: <DollarSign size={13} /> },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl p-2.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                      <div className="flex items-center gap-1 mb-1" style={{ color: C.text3 }}>{s.icon}
                        <span className="text-[9px] uppercase tracking-wide">{s.label}</span></div>
                      <p className="text-[14px] font-bold" style={{ color: C.text }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {campaign.lastSyncAt && (
                  <p className="text-[11px]" style={{ color: C.text3 }}>
                    Atualizado {new Date(campaign.lastSyncAt).toLocaleString("pt-AO")}
                  </p>
                )}
                {/* Controls */}
                {["ativa", "pausada", "em_revisao"].includes(campaign.publishStatus) && (
                  <div className="flex gap-2">
                    {campaign.publishStatus === "ativa" ? (
                      <button onClick={() => run("ctl", () => api.controlCampaignAd(campaign.id, "pause"))}
                        disabled={busy !== null}
                        className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold rounded-full py-2"
                        style={{ background: "#FFF8E1", color: "#E65100", border: "1px solid #FFE082" }}>
                        <Pause size={12} /> Pausar
                      </button>
                    ) : campaign.publishStatus === "pausada" ? (
                      <button onClick={() => run("ctl", () => api.controlCampaignAd(campaign.id, "resume"))}
                        disabled={busy !== null}
                        className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold rounded-full py-2"
                        style={{ background: "#E8F5E9", color: "#1B5E20", border: "1px solid #A5D6A7" }}>
                        <Play size={12} /> Retomar
                      </button>
                    ) : null}
                    <button
                      onClick={() => { if (confirm("Encerrar o anúncio definitivamente?")) void run("ctl", () => api.controlCampaignAd(campaign.id, "end")); }}
                      disabled={busy !== null}
                      className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold rounded-full py-2"
                      style={{ background: "#FFEBEE", color: "#C62828", border: "1px solid #FFCDD2" }}>
                      <StopCircle size={12} /> Encerrar
                    </button>
                  </div>
                )}
              </>
            )}
          </StepCard>
        </>
      )}
    </div>
  );
}

// ─── Metrics dashboard ────────────────────────────────────────────────────────
function MetricsDashboard({ api, slug, metrics, campaign, onSpendUpdate }: {
  api: ReturnType<typeof businessApi>; slug: string;
  metrics: CampaignMetrics; campaign: Campaign; onSpendUpdate: (s: number) => void;
}) {
  const [editingSpend, setEditingSpend] = useState(false);
  const [spendInput, setSpendInput]     = useState(String(campaign.totalSpend));
  const [savingSpend, setSavingSpend]   = useState(false);

  const captationBaseUrl = `${import.meta.env.BASE_URL}e/${slug}/captacao`;
  const fullCaptationUrl = `${window.location.origin}${captationBaseUrl}?utm_source=${campaign.platform}&utm_medium=paid&utm_campaign=${campaign.utmSlug}`;

  const saveSpend = async () => {
    const spend = parseInt(spendInput, 10);
    if (isNaN(spend) || spend < 0) return;
    setSavingSpend(true);
    try { await api.updateCampaignStatus(campaign.id, { totalSpend: spend }); onSpendUpdate(spend); }
    finally { setSavingSpend(false); setEditingSpend(false); }
  };

  const statCards = [
    { label: "Leads",         value: metrics.totalLeads,                   color: "#4285F4", icon: <Users size={14} /> },
    { label: "Qualificados",  value: metrics.qualifiedLeads,               color: C.green,   icon: <BadgeCheck size={14} /> },
    { label: "% Qualific.",   value: `${metrics.qualificationRate}%`,       color: "#E65100", icon: <TrendingUp size={14} /> },
    { label: "Score médio",   value: metrics.avgScore ?? "–",              color: "#7B1FA2", icon: <TrendingUp size={14} /> },
  ];

  return (
    <div className="space-y-3 px-4 py-3">
      {/* Tracked link */}
      <div className="rounded-2xl p-3.5 space-y-2"
        style={{ background: "#E8F5E9", border: "1px solid #C8E6C9" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#2E7D32" }}>Link de captação rastreado</p>
        <div className="flex items-center gap-2">
          <p className="text-[12px] truncate flex-1" style={{ color: C.green }}>{fullCaptationUrl}</p>
          <CopyBtn text={fullCaptationUrl} label="Copiar" />
        </div>
        <p className="text-[11px]" style={{ color: "#2E7D32" }}>
          Usa este link nos teus anúncios. Cada lead fica atribuído a esta campanha.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-2xl p-3"
            style={{ background: C.white, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-1.5 mb-1.5" style={{ color: s.color }}>
              {s.icon}
              <span className="text-[10px] uppercase tracking-wide" style={{ color: C.text3 }}>{s.label}</span>
            </div>
            <p className="text-[22px] font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Spend tracker */}
      <div className="rounded-2xl p-3.5" style={{ background: C.white, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <DollarSign size={14} style={{ color: "#E65100" }} />
            <span className="text-[11px] uppercase tracking-wide" style={{ color: C.text3 }}>Gasto registado</span>
          </div>
          <button onClick={() => setEditingSpend(!editingSpend)}
            className="text-[12px] font-medium" style={{ color: C.green }}>
            {editingSpend ? "Cancelar" : "Editar"}
          </button>
        </div>
        {editingSpend ? (
          <div className="flex items-center gap-2">
            <input value={spendInput} onChange={(e) => setSpendInput(e.target.value.replace(/\D/g, ""))}
              className="flex-1 rounded-xl px-3 py-1.5 text-[14px] outline-none"
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
            <span className="text-[12px]" style={{ color: C.text3 }}>AOA</span>
            <button onClick={saveSpend} disabled={savingSpend}
              className="text-[13px] font-semibold" style={{ color: C.green }}>
              {savingSpend ? "…" : "OK"}
            </button>
          </div>
        ) : (
          <p className="text-[20px] font-bold" style={{ color: "#E65100" }}>
            {campaign.totalSpend.toLocaleString("pt-AO")} AOA
          </p>
        )}
        {metrics.costPerLead !== null && (
          <p className="text-[12px] mt-1" style={{ color: C.text2 }}>
            Custo por lead: <span style={{ color: C.text }}>{metrics.costPerLead.toLocaleString("pt-AO")} AOA</span>
            {metrics.costPerQualifiedLead && (
              <span> · por qualificado: <span style={{ color: C.text }}>{metrics.costPerQualifiedLead.toLocaleString("pt-AO")} AOA</span></span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function CampaignDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const slug = useBusinessSlug();
  const api = useMemo(() => (slug ? businessApi(slug) : null), [slug]);

  const [campaign, setCampaign]           = useState<Campaign | null>(null);
  const [metrics, setMetrics]             = useState<CampaignMetrics | null>(null);
  const [suggestions, setSuggestions]     = useState<string[] | null | false>(null);
  const [generating, setGenerating]       = useState(false);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [tab, setTab]                     = useState<"kit" | "publicar" | "metricas">("kit");
  const [changingStatus, setChangingStatus] = useState(false);
  const [duplicating, setDuplicating]     = useState(false);
  const [, navigate]                      = useLocation();

  useEffect(() => {
    if (!api) return;
    Promise.all([api.getCampaignById(id), api.getCampaignMetrics(id)])
              .then(([{ campaign: c }, { metrics: m }]) => {
                setCampaign(c);
                setMetrics(m);
                if (c.platform === "meta") setTab("publicar");
              })
      .catch(() => setError("Não foi possível carregar a campanha"))
      .finally(() => setLoading(false));
  }, [id, api]);

  const handleGenerate = useCallback(async () => {
    if (!api) return;
    setGenerating(true); setError(null);
    try {
      const { campaign: updated } = await api.generateCampaignKit(id);
      setCampaign(updated); setTab("kit");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao gerar kit"); }
    finally { setGenerating(false); }
  }, [id, api]);

  const handleLoadOptimizations = useCallback(async () => {
    if (!api) return;
    setSuggestions(false);
    try {
      const { suggestions: s } = await api.getCampaignOptimizations(id);
      setSuggestions(s.length > 0 ? s : ["Sem sugestões adicionais — os dados estão bons! 👍"]);
    } catch { setSuggestions(["Não foi possível gerar sugestões agora — tenta mais tarde."]); }
  }, [id, api]);

  const handleDuplicate = useCallback(async () => {
    if (!api) return;
    setDuplicating(true);
    try {
      const { campaign: copy } = await api.duplicateCampaign(id);
      navigate(`/e/${slug}/dono/campanhas/${copy.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao duplicar"); setDuplicating(false); }
  }, [id, navigate, api, slug]);

  const handleStatusToggle = useCallback(async () => {
    if (!campaign || !api) return;
    const next = STATUS_NEXT[campaign.status]; if (!next) return;
    setChangingStatus(true);
    try {
      const { campaign: updated } = await api.updateCampaignStatus(campaign.id, { status: next });
      setCampaign(updated);
    } finally { setChangingStatus(false); }
  }, [campaign, api]);

  if (!slug) return null;

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ background: C.bg }}>
      <Loader2 size={20} className="animate-spin" style={{ color: C.text3 }} />
    </div>
  );

  if (!campaign) return (
    <div className="flex flex-col items-center justify-center h-full gap-3" style={{ background: C.bg }}>
      <AlertCircle size={24} style={{ color: "#C62828" }} />
      <p className="text-[14px]" style={{ color: C.text }}>Campanha não encontrada</p>
      <Link href={`/e/${slug}/dono/campanhas`} className="text-[13px] font-medium" style={{ color: C.green }}>← Voltar</Link>
    </div>
  );

  const pm = PLATFORM_META[campaign.platform];
  const nextStatus = STATUS_NEXT[campaign.status];
  const isMetaWizard = campaign.platform === "meta" && tab === "publicar";

  return (
    <div className="flex flex-col h-full" style={{ background: C.bg }}>
      {!isMetaWizard && (
        <>
          {/* Header */}
          <AppHeader
            title={campaign.name}
            subtitle={pm.label}
            onBack={() => window.history.back()}
            leading={
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: pm.bg, color: pm.color }}>
              {pm.icon}
            </div>
            }
            actions={
              <>
                <AppIconButton label="Duplicar campanha" onClick={handleDuplicate} disabled={duplicating}>
                  {duplicating ? <Loader2 size={16} className="animate-spin" /> : <CopyPlus size={16} />}
                </AppIconButton>
                {nextStatus && (
                  <button
                    onClick={handleStatusToggle}
                    disabled={changingStatus}
                    className="app-status-badge"
                    style={{
                      color: nextStatus === "ativa" ? "#15803D" : "#B45309",
                      background: nextStatus === "ativa" ? "#DCFCE7" : "#FFFBEB",
                    }}
                  >
                    {changingStatus ? <Loader2 size={11} className="animate-spin" /> :
                      nextStatus === "ativa" ? <Play size={10} /> : <Pause size={10} />}
                    <span className="ml-1">{nextStatus === "ativa" ? "Ativar" : "Pausar"}</span>
                  </button>
                )}
              </>
            }
          />

          {/* Error */}
          {error && (
            <div className="mx-4 mt-3 flex items-center gap-2 text-[13px] rounded-xl px-3.5 py-2.5 shrink-0"
              style={{ background: "#FFEBEE", color: "#C62828", border: "1px solid #FFCDD2" }}>
              <AlertCircle size={13} className="shrink-0" /> {error}
            </div>
          )}

          {/* Tabs */}
          <div className="flex shrink-0" style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
            {([["kit", "🎯 Kit IA"], ["publicar", "🚀 Publicar"], ["metricas", "📊 Métricas"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className="flex-1 py-2.5 text-[13px] font-semibold"
                style={{
                  color: tab === key ? C.green : C.text3,
                  borderBottom: tab === key ? `2px solid ${C.green}` : "2px solid transparent",
                }}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className={isMetaWizard ? "flex-1 min-h-0" : "flex-1 overflow-y-auto"}>
        {/* Kit tab */}
        {tab === "kit" && (
          <>
            {!campaign.kitJson && (
              <div className="flex flex-col items-center justify-center py-12 gap-4 px-6 text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: "#E8F5E9" }}>
                  <Sparkles size={26} style={{ color: C.green }} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: C.text }}>Kit ainda não gerado</p>
                  <p className="text-[13px] mt-1 leading-relaxed" style={{ color: C.text2 }}>
                    A IA vai gerar copies, públicos, orçamento e brief criativo em segundos.
                  </p>
                </div>
                <button onClick={handleGenerate} disabled={generating}
                  className="flex items-center gap-2 text-[14px] font-semibold rounded-full px-5 py-2.5"
                  style={{ background: C.green, color: "#fff", opacity: generating ? 0.7 : 1 }}>
                  {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {generating ? "A gerar kit…" : "Gerar kit com IA"}
                </button>
              </div>
            )}
            {campaign.kitJson && (
              <>
                {/* Regenerate button */}
                <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                  <p className="text-[12px]" style={{ color: C.text3 }}>
                    Kit gerado pela IA · pode ser regenerado a qualquer momento
                  </p>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full transition-all"
                    style={{ background: "#E8F5E9", color: "#1B5E20", border: "1px solid #A5D6A7", opacity: generating ? 0.6 : 1 }}
                  >
                    {generating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {generating ? "A regenerar…" : "Regenerar"}
                  </button>
                </div>
                <KitView kit={campaign.kitJson as CampaignKit} />
              </>
            )}
          </>
        )}

        {/* Publish tab */}
        {tab === "publicar" && api && (
          campaign.platform === "meta"
             ? <MetaAdsWizard
                 api={api}
                 campaign={campaign}
                 onUpdate={setCampaign}
                 onExit={() => navigate(`/e/${slug}/dono/campanhas`)}
               />
            : <LegacyPublishFlow api={api} campaign={campaign} onUpdate={setCampaign} />
        )}

        {/* Metrics tab */}
        {tab === "metricas" && metrics && slug && (
          <>
            <MetricsDashboard
              api={api!} slug={slug} metrics={metrics} campaign={campaign}
              onSpendUpdate={(spend) => setCampaign((c) => c ? { ...c, totalSpend: spend } : c)}
            />
            {/* AI Suggestions */}
            <div className="px-4 pb-4">
              {suggestions === null && (
                <button onClick={handleLoadOptimizations}
                  className="w-full flex items-center justify-center gap-2 text-[13px] font-medium rounded-2xl py-3"
                  style={{ background: C.white, border: `1px solid ${C.border}`, color: C.text2 }}>
                  <Lightbulb size={15} style={{ color: "#E65100" }} /> Ver sugestões de otimização
                </button>
              )}
              {suggestions === false && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 size={18} className="animate-spin" style={{ color: C.text3 }} />
                </div>
              )}
              {Array.isArray(suggestions) && (
                <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                  <div className="px-4 py-2.5" style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.text2 }}>Sugestões de IA</p>
                  </div>
                  <ul className="divide-y px-4" style={{ background: C.white, borderColor: C.border }}>
                    {suggestions.map((s, i) => (
                      <li key={i} className="py-3 flex items-start gap-2 text-[13px] leading-relaxed"
                        style={{ color: C.text2 }}>
                        <span style={{ color: C.green }} className="shrink-0 mt-0.5">→</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {!isMetaWizard && <OwnerNav />}
    </div>
  );
}
