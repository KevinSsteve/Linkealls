/**
 * UserProfile — WhatsApp Business light theme.
 * /u/:handle — private (own) or public profile.
 */
import { useState, useEffect, useRef } from "react";
import { Link, useParams, Redirect, useLocation } from "wouter";
import {
  MessageCircle, Building2, LogOut, ChevronRight,
  Search, Zap, Pencil, CheckCircle2, XCircle, Loader2, AtSign,
  Store, MessageSquare, Megaphone,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { userLogout, checkHandleAvailability, setUserHandle, getPublicUserProfile } from "@/lib/api";
import { getVisited, type VisitedBusiness } from "@/lib/visitedBusinesses";

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PALETTES = [
  { bg: "#DFE5E7", text: "#54656F" },
  { bg: "#D9FDD3", text: "#25D366" },
  { bg: "#FFE8CC", text: "#F97316" },
  { bg: "#E8D9FD", text: "#7C3AED" },
  { bg: "#D9F0FD", text: "#0EA5E9" },
  { bg: "#FDD9E8", text: "#EC4899" },
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

// ─── Owner footer nav ────────────────────────────────────────────────────────

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
        background: "#FFFFFF",
        borderTop: "1px solid #E9EDEF",
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
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 select-none"
          >
            {/* Active pill */}
            <div
              className="flex items-center justify-center rounded-full transition-all"
              style={{
                width: active ? 56 : 32,
                height: 30,
                background: active ? "#D8F3EA" : "transparent",
              }}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.5 : 1.8}
                style={{ color: active ? "#0B3D2E" : "#54656F" }}
              />
            </div>
            <span
              className="text-[10px] tracking-wide leading-none"
              style={{
                color: active ? "#111B21" : "#8696A0",
                fontWeight: active ? 700 : 500,
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Conversation row ─────────────────────────────────────────────────────────

function ConversaRow({ business, lastAt }: { business: Business; lastAt: string }) {
  const p = palette(business.name);
  return (
    <Link href={`/e/${business.slug}`}>
      <div className="flex items-center gap-3 px-4 py-3 active:bg-[#F5F5F5] cursor-pointer transition-colors">
        <div
          className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-[20px] font-bold shrink-0"
          style={{ background: p.bg, color: p.text }}
        >
          {business.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 py-1 border-b" style={{ borderColor: "#E9EDEF" }}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-[16px] truncate" style={{ color: "#111B21" }}>{business.name}</span>
            <span className="shrink-0 text-[12px]" style={{ color: "#8696A0" }}>{formatTime(lastAt)}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Zap size={10} style={{ color: "#25D366" }} fill="#25D366" />
            <span className="text-[14px] truncate" style={{ color: "#667781" }}>
              {business.sector} · Assistente IA
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Inline handle editor ─────────────────────────────────────────────────────

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
    check === "available" ? "#25D366" :
    check === "taken"     ? "#EF4444" : "#E9EDEF";

  return (
    <div className="flex flex-col gap-1 mt-2">
      <div
        className="flex items-center gap-2 rounded-xl px-3"
        style={{ background: "#F0F2F5", border: `2px solid ${borderColor}`, height: 42, transition: "border-color 0.2s" }}
      >
        <AtSign size={13} style={{ color: "#8696A0" }} />
        <input
          type="text" value={raw} onChange={(e) => setRaw(e.target.value)}
          maxLength={30} autoFocus
          className="flex-1 bg-transparent outline-none text-[14px]"
          style={{ color: "#111B21", caretColor: "#25D366" }}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onSaved(currentHandle); }}
        />
        {check === "checking"  && <Loader2 size={13} className="animate-spin" style={{ color: "#8696A0" }} />}
        {check === "available" && <CheckCircle2 size={13} style={{ color: "#25D366" }} />}
        {(check === "taken" || check === "invalid") && <XCircle size={13} style={{ color: "#EF4444" }} />}
      </div>
      {err && <p className="text-[11px] px-1" style={{ color: "#EF4444" }}>{err}</p>}
      {check === "invalid" && <p className="text-[11px] px-1" style={{ color: "#F59E0B" }}>3-30 letras, números ou hífens</p>}
      {check === "taken"   && <p className="text-[11px] px-1" style={{ color: "#EF4444" }}>Já está a ser usado</p>}
      <div className="flex gap-2 mt-1">
        <button onClick={save} disabled={check !== "available" || saving}
          className="flex-1 py-2 rounded-xl text-[13px] font-semibold transition-opacity"
          style={{ background: "#25D366", color: "#FFFFFF", opacity: check === "available" && !saving ? 1 : 0.4 }}>
          {saving ? "A guardar…" : "Guardar"}
        </button>
        <button onClick={() => onSaved(currentHandle)}
          className="px-4 py-2 rounded-xl text-[13px]"
          style={{ background: "#F0F2F5", color: "#667781" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Private profile ──────────────────────────────────────────────────────────

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
    <div className="flex flex-col h-full" style={{ background: "#FFFFFF" }}>

      {/* Top App Bar */}
      <header style={{ background: "#075E54", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center justify-between px-4 h-14">
          <span className="font-bold text-[20px] text-white">Conversas</span>
          <button onClick={doLogout}
            className="flex items-center gap-1.5 text-[13px] font-medium rounded-full px-3 py-1"
            style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)" }}>
            <LogOut size={13} /> Sair
          </button>
        </div>
      </header>

      {/* Profile strip */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3" style={{ background: "#F0F2F5" }}>
        <div
          className="w-[52px] h-[52px] rounded-full flex items-center justify-center font-bold text-[20px] shrink-0"
          style={{ background: p.bg, color: p.text }}
        >
          {(user?.name ?? "U").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[15px] leading-tight" style={{ color: "#111B21" }}>{user?.name}</p>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1 mt-0.5">
              <span className="text-[13px] font-medium" style={{ color: "#25D366" }}>@{liveHandle}</span>
              <Pencil size={11} style={{ color: "#8696A0" }} />
            </button>
          ) : (
            <HandleEditor currentHandle={liveHandle} token={token!} onSaved={handleSaved} />
          )}
        </div>
      </div>

      {/* Search */}
      {enriched.length > 0 && (
        <div className="shrink-0 px-4 py-2" style={{ background: "#FFFFFF" }}>
          <div
            className="flex items-center gap-3 px-4 rounded-full"
            style={{ background: "#F0F2F5", height: 44 }}
          >
            <Search size={16} style={{ color: "#8696A0" }} className="shrink-0" />
            <input
              type="text"
              placeholder="Pesquisar…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-[15px] outline-none"
              style={{ color: "#111B21" }}
            />
          </div>
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ background: "#FFFFFF" }}>
        {loading ? (
          <div className="py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-[52px] h-[52px] rounded-full shrink-0" style={{ background: "#F0F2F5" }} />
                <div className="flex-1">
                  <div className="h-4 rounded mb-2" style={{ background: "#F0F2F5", width: "50%" }} />
                  <div className="h-3 rounded" style={{ background: "#F0F2F5", width: "70%" }} />
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
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "#D9FDD3" }}
            >
              <MessageCircle size={28} style={{ color: "#25D366" }} />
            </div>
            <div>
              <p className="font-semibold mb-1" style={{ color: "#111B21" }}>Ainda sem conversas</p>
              <p className="text-[14px] leading-relaxed" style={{ color: "#667781" }}>
                Encontra um negócio e inicia uma conversa com o assistente IA.
              </p>
            </div>
            <Link href="/">
              <button
                className="flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-[14px]"
                style={{ background: "#25D366", color: "#FFFFFF" }}
              >
                <Building2 size={15} /> Explorar negócios
              </button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <Search size={32} className="mb-3" style={{ color: "#8696A0" }} />
            <p className="text-[14px]" style={{ color: "#667781" }}>Nenhum resultado para "{query}"</p>
          </div>
        )}
      </div>

      {/* Owner nav */}
      <OwnerFooterNav slug={liveHandle} />
    </div>
  );
}

// ─── Public profile ───────────────────────────────────────────────────────────

function PublicProfile({ handle, name }: { handle: string; name: string }) {
  const p = palette(name);
  return (
    <div
      className="flex flex-col items-center justify-center h-full px-8 text-center gap-6"
      style={{ background: "#FFFFFF" }}
    >
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-[36px]"
        style={{ background: p.bg, color: p.text }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <div>
        <h1 className="text-[22px] font-bold mb-1" style={{ color: "#111B21" }}>{name}</h1>
        <p className="text-[14px] font-medium" style={{ color: "#25D366" }}>@{handle}</p>
      </div>
      <p className="text-[14px] leading-relaxed" style={{ color: "#667781" }}>
        Membro do Linkealls — a plataforma de negócios angolanos com assistente IA.
      </p>
      <Link href={`/e/${handle}`}>
        <button
          className="flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-[15px]"
          style={{ background: "#25D366", color: "#FFFFFF" }}
        >
          <MessageSquare size={16} /> Falar com o negócio
        </button>
      </Link>
      <Link href="/">
        <button
          className="flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-[14px]"
          style={{ background: "#F0F2F5", color: "#667781" }}
        >
          <Building2 size={14} /> Explorar negócios
        </button>
      </Link>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

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
    getPublicUserProfile(urlHandle)
      .then(({ name }) => setPubName(name))
      .catch(() => setNotFound(true))
      .finally(() => setLoadingPub(false));
  }, [urlHandle, isOwn]);

  if (!urlHandle) return <Redirect to="/" />;
  if (isOwn) return <PrivateProfile handle={urlHandle} />;

  if (loadingPub) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: "#FFFFFF" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "#25D366" }} />
      </div>
    );
  }

  if (notFound) return <Redirect to="/" />;
  if (pubName !== null) return <PublicProfile handle={urlHandle} name={pubName} />;
  return null;
}
