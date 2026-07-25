/**
 * UserProfile — página pessoal do utilizador em /u/:handle.
 *
 * Modelo: utilizador = negócio. O handle do utilizador é directamente o slug
 * do negócio em /e/:handle/dono/*. Não existe passo de vinculação.
 *
 * - Handle bate com utilizador autenticado → perfil privado (conversas + footer do dono).
 * - Outro visitante → perfil público simples.
 */
import { useState, useEffect, useRef } from "react";
import { Link, useParams, Redirect, useLocation } from "wouter";
import {
  MessageCircle, Building2, LogOut, ChevronRight,
  Search, Zap, Pencil, CheckCircle2, XCircle, Loader2, AtSign,
  Store, MessageSquare, Megaphone,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userLogout, checkHandleAvailability, setUserHandle } from "@/lib/api";
import { getVisited, type VisitedBusiness } from "@/lib/visitedBusinesses";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Business {
  id: number;
  slug: string;
  name: string;
  sector: string;
  description: string;
}

const API_BASE = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}api`
  : "/api";

// ─── Helpers ───────────────────────────────────────────────────────────────

const PALETTES = [
  { bg: "#1A3828", text: "#4ADE80" },
  { bg: "#1A2B45", text: "#60A5FA" },
  { bg: "#3A1A2B", text: "#F472B6" },
  { bg: "#2B1A3A", text: "#A78BFA" },
  { bg: "#3A2B1A", text: "#FB923C" },
  { bg: "#1A3A3A", text: "#22D3EE" },
];
function palette(name: string) {
  let h = 0;
  for (const c of name) h = h * 31 + c.charCodeAt(0);
  return PALETTES[Math.abs(h) % PALETTES.length]!;
}
function formatTime(iso: string) {
  const d = new Date(iso), now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3_600_000;
  if (diffH < 24) return d.toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" });
  if (diffH < 48) return "Ontem";
  return d.toLocaleDateString("pt-AO", { day: "2-digit", month: "short" });
}

const HANDLE_RE = /^[a-z0-9-]{3,30}$/;
type CheckState = "idle" | "checking" | "available" | "taken" | "invalid";

// ─── Owner footer nav ──────────────────────────────────────────────────────
// Uses the user's handle directly as the business slug — no separate link needed.

const OWNER_TABS = [
  { subPath: "",            icon: Store,         label: "Perfil",    exact: true  },
  { subPath: "/conversas",  icon: MessageSquare, label: "Conversas", exact: false },
  { subPath: "/assistente", icon: Zap,           label: "IA",        exact: false },
  { subPath: "/campanhas",  icon: Megaphone,     label: "Campanhas", exact: false },
] as const;

function OwnerFooterNav({ slug }: { slug: string }) {
  const [location] = useLocation();
  const base = `/e/${slug}/dono`;

  return (
    <nav
      className="shrink-0 flex items-stretch"
      style={{
        background: "#0A1420",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        paddingBottom: "env(safe-area-inset-bottom, 0)",
      }}
    >
      {OWNER_TABS.map(({ subPath, icon: Icon, label, exact }) => {
        const href   = `${base}${subPath}`;
        const active = exact
          ? location === href
          : location === href || location.startsWith(href + "/");
        return (
          <Link key={href} href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-[3px] py-2.5 transition-colors select-none ${
              active ? "text-[#00BFA5]" : "text-[#3E576F] hover:text-[#7A9BB5]"
            }`}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            <span className="text-[10px] font-medium tracking-wide leading-none">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function ConversaRow({ business, lastAt }: { business: Business; lastAt: string }) {
  const p = palette(business.name);
  return (
    <Link href={`/e/${business.slug}`}>
      <div
        className="flex items-center gap-3 px-4 py-3.5 active:bg-white/5 cursor-pointer transition-colors"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
          style={{ background: p.bg, color: p.text }}>
          {business.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-[#EAF0F7] truncate text-[15px]">{business.name}</span>
            <span className="shrink-0 text-[12px] text-[#4A6B80]">{formatTime(lastAt)}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Zap size={10} style={{ color: "#00A884" }} fill="#00A884" />
            <span className="text-[13px] text-[#7B96B2] truncate">{business.sector} · Assistente IA</span>
          </div>
        </div>
        <ChevronRight size={15} className="shrink-0 text-[#3E576F]" />
      </div>
    </Link>
  );
}

// ─── Inline handle editor ──────────────────────────────────────────────────

function HandleEditor({ currentHandle, token, onSaved }: {
  currentHandle: string;
  token: string;
  onSaved: (h: string) => void;
}) {
  const [raw, setRaw]       = useState(currentHandle);
  const [check, setCheck]   = useState<CheckState>("idle");
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");
  const debounceRef         = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handle = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!handle) { setCheck("idle"); return; }
    if (!HANDLE_RE.test(handle)) { setCheck("invalid"); return; }
    if (handle === currentHandle) { setCheck("available"); return; }

    setCheck("checking");
    debounceRef.current = setTimeout(async () => {
      try {
        const { available } = await checkHandleAvailability(handle);
        setCheck(available ? "available" : "taken");
      } catch { setCheck("idle"); }
    }, 400);
  }, [handle, currentHandle]);

  async function save() {
    if (check !== "available" || saving) return;
    setSaving(true); setErr("");
    try {
      const { user } = await setUserHandle(handle, token);
      onSaved(user.handle ?? handle);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally { setSaving(false); }
  }

  const borderColor =
    check === "available" ? "#4ADE8040" :
    check === "taken"     ? "#F8717140" : "rgba(255,255,255,0.12)";

  return (
    <div className="flex flex-col gap-1 mt-2">
      <div className="flex items-center gap-2 rounded-xl px-3"
        style={{ background: "rgba(255,255,255,0.04)", border: `1.5px solid ${borderColor}`, height: 42 }}>
        <AtSign size={13} style={{ color: "#4A6B80" }} />
        <input
          type="text" value={raw} onChange={(e) => setRaw(e.target.value)}
          maxLength={30} autoFocus
          className="flex-1 bg-transparent outline-none text-[14px]"
          style={{ color: "#EAF0F7", caretColor: "#00A884" }}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onSaved(currentHandle); }}
        />
        {check === "checking"  && <Loader2 size={13} className="animate-spin" style={{ color: "#4A6B80" }} />}
        {check === "available" && <CheckCircle2 size={13} style={{ color: "#4ADE80" }} />}
        {(check === "taken" || check === "invalid") && <XCircle size={13} style={{ color: "#F87171" }} />}
      </div>
      {err && <p className="text-[11px] px-1" style={{ color: "#F87171" }}>{err}</p>}
      {check === "invalid" && <p className="text-[11px] px-1" style={{ color: "#FBBF24" }}>3-30 letras, números ou hífens</p>}
      {check === "taken"   && <p className="text-[11px] px-1" style={{ color: "#F87171" }}>Já está a ser usado</p>}
      <div className="flex gap-2 mt-1">
        <button onClick={save} disabled={check !== "available" || saving}
          className="flex-1 py-2 rounded-lg text-[13px] font-semibold transition-opacity"
          style={{ background: "#00A884", color: "#050D14", opacity: check === "available" && !saving ? 1 : 0.4 }}>
          {saving ? "A guardar…" : "Guardar"}
        </button>
        <button onClick={() => onSaved(currentHandle)}
          className="px-4 py-2 rounded-lg text-[13px]"
          style={{ background: "rgba(255,255,255,0.06)", color: "#7B96B2" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Private profile ────────────────────────────────────────────────────────

function PrivateProfile({ handle }: { handle: string }) {
  const { user, token, logout, setHandle: ctxSetHandle } = useAuth();
  const [editing, setEditing]       = useState(false);
  const [liveHandle, setLiveHandle] = useState(handle);
  const [enriched, setEnriched]     = useState<{ business: Business; lastAt: string }[]>([]);
  const [loading, setLoading]       = useState(true);
  const [query, setQuery]           = useState("");

  function handleSaved(newHandle: string) {
    ctxSetHandle(newHandle);
    setLiveHandle(newHandle);
    setEditing(false);
    window.history.replaceState(null, "", `/u/${newHandle}`);
  }

  useEffect(() => {
    const visited: VisitedBusiness[] = getVisited();
    if (!visited.length) { setLoading(false); return; }
    fetch(`${API_BASE}/businesses`)
      .then((r) => r.json())
      .then(({ businesses: all }: { businesses: Business[] }) => {
        const map = new Map(all.map((b) => [b.slug, b]));
        setEnriched(
          visited
            .map((v) => { const b = map.get(v.slug); return b ? { business: b, lastAt: v.lastAt } : null; })
            .filter((x): x is { business: Business; lastAt: string } => x !== null),
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = query.trim()
    ? enriched.filter((e) =>
        e.business.name.toLowerCase().includes(query.toLowerCase()) ||
        e.business.sector.toLowerCase().includes(query.toLowerCase()),
      )
    : enriched;

  const doLogout = async () => {
    if (token) await userLogout(token).catch(() => {});
    logout();
  };

  const p = palette(user?.name ?? "U");

  return (
    <div className="flex flex-col h-full" style={{ background: "#060C14" }}>
      {/* Header */}
      <header className="shrink-0 px-4 py-4"
        style={{ background: "#0D1826", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center font-bold text-[18px]"
              style={{ background: p.bg, color: p.text }}>
              {(user?.name ?? "U").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-[15px] text-[#EAF0F7] leading-tight">{user?.name}</p>
              {!editing ? (
                <button onClick={() => setEditing(true)} className="flex items-center gap-1 mt-0.5" title="Alterar link">
                  <span className="text-[12px] font-medium" style={{ color: "#00A884" }}>@{liveHandle}</span>
                  <Pencil size={11} style={{ color: "#4A6B80" }} />
                </button>
              ) : (
                <HandleEditor currentHandle={liveHandle} token={token!} onSaved={handleSaved} />
              )}
            </div>
          </div>
          <button onClick={doLogout}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium"
            style={{ background: "#141E2E", color: "#7B96B2", border: "1px solid rgba(255,255,255,0.06)" }}>
            <LogOut size={12} /> Sair
          </button>
        </div>
      </header>

      {/* Search */}
      {enriched.length > 0 && (
        <div className="shrink-0 px-4 py-3" style={{ background: "#0D1826" }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "#141E2E", border: "1px solid rgba(255,255,255,0.06)" }}>
            <Search size={14} className="text-[#4A6B80] shrink-0" />
            <input type="text" placeholder="Pesquisar..." value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-[14px] text-[#EAF0F7] placeholder-[#4A6B80] outline-none" />
          </div>
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="py-2">
            {[1,2,3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="w-12 h-12 rounded-full shrink-0" style={{ background: "#141E2E" }} />
                <div className="flex-1">
                  <div className="h-4 rounded mb-2" style={{ background: "#141E2E", width: "50%" }} />
                  <div className="h-3 rounded" style={{ background: "#141E2E", width: "70%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="py-1">
            {filtered.map((e) => <ConversaRow key={e.business.slug} business={e.business} lastAt={e.lastAt} />)}
          </div>
        ) : enriched.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "#00A88415", border: "1px solid #00A88430" }}>
              <MessageCircle size={28} style={{ color: "#00A884" }} />
            </div>
            <div>
              <p className="font-semibold text-[#EAF0F7] mb-1">Ainda sem conversas</p>
              <p className="text-[13px] text-[#4A6B80] leading-relaxed">
                Encontra um negócio e inicia uma conversa com o assistente IA.
              </p>
            </div>
            <Link href="/">
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-[14px] text-white"
                style={{ background: "linear-gradient(135deg, #00A884 0%, #007A62 100%)" }}>
                <Building2 size={15} /> Explorar negócios
              </button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-[#3E576F]">
            <Search size={32} className="mb-3 opacity-40" />
            <p className="text-[14px]">Nenhum resultado para "{query}"</p>
          </div>
        )}
      </div>

      {/* Owner footer nav — handle IS the business slug */}
      <OwnerFooterNav slug={liveHandle} />
    </div>
  );
}

// ─── Public profile ─────────────────────────────────────────────────────────

function PublicProfile({ handle, name }: { handle: string; name: string }) {
  const p = palette(name);
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-6"
      style={{ background: "#060C14" }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-[30px]"
        style={{ background: p.bg, color: p.text }}>
        {name.charAt(0).toUpperCase()}
      </div>
      <div>
        <h1 className="text-[20px] font-bold text-[#EAF0F7] mb-1">{name}</h1>
        <p className="text-[13px]" style={{ color: "#00A884" }}>@{handle}</p>
      </div>
      <p className="text-[14px] leading-relaxed" style={{ color: "#4A6B80" }}>
        Membro do Linkealls — a plataforma de negócios angolanos com assistente IA.
      </p>
      <Link href="/">
        <button className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-[14px] text-white"
          style={{ background: "linear-gradient(135deg, #00A884 0%, #007A62 100%)" }}>
          <Building2 size={15} /> Explorar negócios
        </button>
      </Link>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function UserProfile() {
  const params                      = useParams<{ handle?: string }>();
  const urlHandle                   = (params.handle ?? "").toLowerCase();
  const { user, isLoggedIn }        = useAuth();
  const [pubName, setPubName]       = useState<string | null>(null);
  const [notFound, setNotFound]     = useState(false);
  const [loadingPub, setLoadingPub] = useState(false);

  const isOwn = isLoggedIn && user?.handle?.toLowerCase() === urlHandle;

  useEffect(() => {
    if (isOwn || !urlHandle) return;
    setLoadingPub(true);
    fetch(`${API_BASE}/user-auth/handle/check?handle=${encodeURIComponent(urlHandle)}`)
      .then((r) => {
        if (!r.ok) throw new Error("server error");
        return r.json() as Promise<{ available: boolean; reason?: string }>;
      })
      .then((data) => {
        if (data.available || data.reason) setNotFound(true);
        else setPubName(urlHandle);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingPub(false));
  }, [urlHandle, isOwn]);

  if (!urlHandle) return <Redirect to="/" />;
  if (isOwn) return <PrivateProfile handle={urlHandle} />;

  if (loadingPub) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: "#060C14" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "#00A884" }} />
      </div>
    );
  }

  if (notFound) return <Redirect to="/" />;
  if (pubName !== null) return <PublicProfile handle={urlHandle} name={pubName} />;
  return null;
}
