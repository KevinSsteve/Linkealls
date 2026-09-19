import { useEffect, useRef, useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { Redirect, useParams } from "wouter";
import { ChatLayout } from "../components/ChatLayout";
import { getPublicTrafficCreative, type TrafficContext } from "../lib/api";
import { startTrafficConversation } from "../lib/trafficConversation";

export function PublicTraffic() {
  const { businessSlug, publicSlug } = useParams<{ businessSlug: string; publicSlug: string }>();
  const [creative, setCreative] = useState<TrafficContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedCreativeSlug = useRef<string | null>(null);

  useEffect(() => {
    if (!businessSlug || !publicSlug) return;
    let cancelled = false;
    getPublicTrafficCreative(businessSlug, publicSlug)
      .then(({ creative: resolved }) => {
        if (!cancelled) {
          setStarting(true);
          setCreative(resolved);
        }
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

  useEffect(() => {
    if (!businessSlug || !creative || startedCreativeSlug.current === creative.slug) return;
    startedCreativeSlug.current = creative.slug;
    setStarting(true);
    setError(null);
    void startTrafficConversation(businessSlug, creative, window.location)
      .then((target) => window.location.assign(target))
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a conversa.");
        setStarting(false);
        startedCreativeSlug.current = null;
      });
  }, [businessSlug, creative]);

  if (!businessSlug || !publicSlug) return <Redirect to="/" />;

  return (
    <ChatLayout businessSlug={businessSlug}>
      <main className="flex h-full flex-col bg-[var(--bg)]">
        {loading || starting ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <Loader2 size={32} className="animate-spin text-[var(--green)]" />
              <p className="text-sm font-medium text-[var(--ink-soft)]">
                A iniciar conversa com o assistente...
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink-soft)]">
              <Megaphone size={30} />
            </div>
            <h1 className="text-lg font-bold text-[var(--ink)]">
              {creative ? "Não foi possível abrir a conversa" : "Anúncio indisponível"}
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--ink-soft)]">{error}</p>
            {creative && (
              <button
                type="button"
                onClick={() => {
                  setStarting(true);
                  setCreative({ ...creative });
                }}
                className="mt-5 min-h-12 rounded-xl bg-[var(--green)] px-5 text-[15px] font-bold text-white"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}
      </main>
    </ChatLayout>
  );
}