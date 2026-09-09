/**
 * UserProfile — /u/:handle
 * · Own profile (isOwn) → redirects straight to the owner panel.
 * · Public profile       → shows name, handle and a link to their business chat.
 */
import { useState, useEffect } from "react";
import { Link, useParams, Redirect } from "wouter";
import { Loader2, MessageSquare, Building2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getPublicUserProfile } from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PALETTES = [
  { bg: "#DFE5E7", text: "#54656F" },
  { bg: "#EEECFF", text: "#635BFF" },
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

// ─── Public profile ───────────────────────────────────────────────────────────
function PublicProfile({ handle, name }: { handle: string; name: string }) {
  const p = palette(name);
  return (
    <div
      className="flex flex-col items-center justify-center h-full px-6 text-center gap-6"
      style={{
        background: "#FFFFFF",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-[36px]"
        style={{ background: p.bg, color: p.text }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <div>
        <h1 className="text-[22px] font-bold mb-1" style={{ color: "#111B21" }}>{name}</h1>
        <p className="text-[14px] font-medium" style={{ color: "#635BFF" }}>@{handle}</p>
      </div>
      <p className="text-[14px] leading-relaxed" style={{ color: "#667781" }}>
        Membro do Linkealls — a plataforma de negócios angolanos com assistente IA.
      </p>
      <Link href={`/e/${handle}`}>
        <button
          className="flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-[15px]"
          style={{ background: "#635BFF", color: "#FFFFFF" }}
        >
          <MessageSquare size={16} /> Falar com o negócio
        </button>
      </Link>
      <Link href="/">
        <button
          className="flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-[14px]"
          style={{ background: "#F1F5F9", color: "#425466" }}
        >
          <Building2 size={14} /> Explorar negócios
        </button>
      </Link>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function UserProfile() {
  const params = useParams<{ handle?: string }>();
  const urlHandle = (params.handle ?? "").toLowerCase();
  const { user, isLoggedIn } = useAuth();

  // All hooks must come before any conditional return.
  const [pubName, setPubName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadingPub, setLoadingPub] = useState(false);

  const isOwn = isLoggedIn && user?.handle?.toLowerCase() === urlHandle;

  useEffect(() => {
    // Only fetch when viewing someone else's profile.
    if (isOwn || !urlHandle) return;
    setLoadingPub(true);
    setPubName(null);
    setNotFound(false);
    getPublicUserProfile(urlHandle)
      .then(({ name }) => setPubName(name))
      .catch(() => setNotFound(true))
      .finally(() => setLoadingPub(false));
  }, [urlHandle, isOwn]);

  // Own profile → skip the Conversas page entirely, go straight to owner panel.
  if (isOwn) return <Redirect to={`/e/${urlHandle}/dono`} />;

  if (!urlHandle) return <Redirect to="/" />;

  if (loadingPub) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: "#FFFFFF" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "#635BFF" }} />
      </div>
    );
  }

  if (notFound) return <Redirect to="/" />;
  if (pubName !== null) return <PublicProfile handle={urlHandle} name={pubName} />;
  return null;
}
