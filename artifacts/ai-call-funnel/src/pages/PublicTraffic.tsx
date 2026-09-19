import { useEffect, useMemo, useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { Redirect, useParams } from "wouter";
import { ChatLayout } from "../components/ChatLayout";
import { getPublicTrafficCreative, type TrafficContext } from "../lib/api";
import { visitorApi, type VisitorLeadOrigin } from "../lib/visitorAccess";

const DEFAULT_MESSAGE = "Quero saber mais sobre isto";

function allowedOrigin(): VisitorLeadOrigin {
  const params = new URLSearchParams(window.location.search);
  const value = (name: string) => params.get(name)?.slice(0, 200) || undefined;
  return {
    source: value("utm_source"),
    medium: value("utm_medium"),
    campaign: value("utm_campaign"),
    content: value("utm_content"),
    term: value("utm_term"),
    url: window.location.href,
  };
}

export function PublicTraffic() {
  const { businessSlug, publicSlug } = useParams<{ businessSlug: string; publicSlug: string }>();
  const [creative, setCreative] = useState<TrafficContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessSlug || !publicSlug) return;
    let cancelled = false;
    getPublicTrafficCreative(businessSlug, publicSlug)
      .then(({ creative: resolved }) => {
        if (!cancelled) setCreative(resolved);
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível carregar este anúncio. O link pode estar pausado.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessSlug, publicSlug]);

  const mediaUrl = useMemo(() => {
    if (!creative) return "";
    if (import.meta.env.DEV && creative.mediaUrl.startsWith("/api/")) {
      return `${import.meta.env.BASE_URL}${creative.mediaUrl.slice(1)}`;
    }
    return creative.mediaUrl;
  }, [creative]);

  const startConversation = async () => {
    if (!businessSlug || !creative || starting) return;
    setStarting(true);
    setError(null);
    try {
      await visitorApi(businessSlug).createLeadSession(
        { ...allowedOrigin(), trafficCreativeSlug: creative.slug },
        [],
      );
      const target = `${import.meta.env.BASE_URL}e/${encodeURIComponent(businessSlug)}?message=${encodeURIComponent(DEFAULT_MESSAGE)}`;
      window.location.assign(target);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a conversa.");
      setStarting(false);
    }
  };

  if (!businessSlug || !publicSlug) return <Redirect to="/" />;

  return (
    <ChatLayout businessSlug={businessSlug}>
      <main className="flex h-full flex-col overflow-y-auto bg-[var(--bg)]">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 size={32} className="animate-spin text-[var(--green)]" />
          </div>
        ) : !creative ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink-soft)]">
              <Megaphone size={30} />
            </div>
            <h1 className="text-lg font-bold text-[var(--ink)]">Anúncio indisponível</h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--ink-soft)]">{error}</p>
          </div>
        ) : (
          <>
            <div className="flex aspect-video w-full items-center justify-center bg-black">
              {creative.mediaType === "video" ? (
                <video src={mediaUrl} controls playsInline className="h-full w-full object-contain" />
              ) : (
                <img src={mediaUrl} alt="Anúncio do negócio" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex flex-1 flex-col justify-between gap-6 p-5">
              <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-[var(--ink)]">
                {creative.description}
              </p>
              <div>
                {error && (
                  <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={startConversation}
                  disabled={starting}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--green)] px-5 text-[15px] font-bold text-white disabled:opacity-60"
                >
                  {starting ? <Loader2 size={18} className="animate-spin" /> : <Megaphone size={18} />}
                  {starting ? "A abrir conversa..." : "Falar com o assistente"}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </ChatLayout>
  );
}