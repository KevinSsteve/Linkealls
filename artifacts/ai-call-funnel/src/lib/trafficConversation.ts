import { loadCurrentVisitorAccess, visitorApi, type VisitorLeadOrigin } from "./visitorAccess";

export interface ResolvedTrafficCreative {
  slug: string;
}

const TRAFFIC_CLICK_KEY_PREFIX = "linkealls:traffic-click:v1:";
const TRAFFIC_CLICK_RETRY_MS = 15_000;
const TRAFFIC_CLICK_SETTLE_MS = 2_000;

async function getOrCreateTrafficClickKey(businessSlug: string, creativeSlug: string): Promise<string> {
  const storageKey = `${TRAFFIC_CLICK_KEY_PREFIX}${businessSlug}:${creativeSlug}`;
  try {
    const parseCurrent = (): { id: string; expiresAt: number } | null => {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { id?: unknown; expiresAt?: unknown };
      return typeof parsed.id === "string" &&
        /^[0-9a-f-]{36}$/i.test(parsed.id) &&
        typeof parsed.expiresAt === "number" &&
        parsed.expiresAt > Date.now()
        ? { id: parsed.id, expiresAt: parsed.expiresAt }
        : null;
    };
    const current = parseCurrent();
    if (current) return current.id;
    const created = crypto.randomUUID();
    localStorage.setItem(storageKey, JSON.stringify({
      id: created,
      expiresAt: Date.now() + TRAFFIC_CLICK_RETRY_MS,
    }));
    // Give a simultaneously opened tab time to publish its candidate. Both
    // tabs then use the final shared value even without the Web Locks API.
    await new Promise((resolve) => setTimeout(resolve, 75));
    return parseCurrent()?.id ?? created;
  } catch {
    return crypto.randomUUID();
  }
}

function settleTrafficClickKey(businessSlug: string, creativeSlug: string, clickKey: string): void {
  const storageKey = `${TRAFFIC_CLICK_KEY_PREFIX}${businessSlug}:${creativeSlug}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      id: clickKey,
      expiresAt: Date.now() + TRAFFIC_CLICK_SETTLE_MS,
    }));
    setTimeout(() => {
      try {
        const current = localStorage.getItem(storageKey);
        if (current && (JSON.parse(current) as { id?: unknown }).id === clickKey) {
          localStorage.removeItem(storageKey);
        }
      } catch {
        // Best-effort cleanup; an expired coordination record grants no access.
      }
    }, TRAFFIC_CLICK_SETTLE_MS);
  } catch {
    // Restricted storage simply loses retry deduplication for this tab.
  }
}

export function allowedTrafficOrigin(search: string, href: string): VisitorLeadOrigin {
  const params = new URLSearchParams(search);
  const value = (name: string) => params.get(name)?.slice(0, 200) || undefined;
  return {
    source: value("utm_source"),
    medium: value("utm_medium"),
    campaign: value("utm_campaign"),
    content: value("utm_content"),
    term: value("utm_term"),
    url: href,
  };
}

export async function startTrafficConversation(
  businessSlug: string,
  creative: ResolvedTrafficCreative,
  location: Pick<Location, "search" | "href">,
): Promise<string> {
  const target = `${import.meta.env.BASE_URL}e/${encodeURIComponent(businessSlug)}`;
  const start = async (): Promise<string> => {
    const existing = await restoreTrafficConversation(businessSlug).catch(() => null);
    if (existing?.session.trafficCreative?.slug === creative.slug) return target;
    const api = visitorApi(businessSlug);
    const clickKey = await getOrCreateTrafficClickKey(businessSlug, creative.slug);
    await api.createLeadSession(
      { ...allowedTrafficOrigin(location.search, location.href), trafficCreativeSlug: creative.slug },
      [],
      clickKey,
    );
    settleTrafficClickKey(businessSlug, creative.slug, clickKey);
    return target;
  };

  const lockName = `linkealls:traffic-start:${businessSlug}:${creative.slug}`;
  return navigator.locks?.request
    ? navigator.locks.request(lockName, start)
    : start();
}

export async function restoreTrafficConversation(businessSlug: string) {
  const api = visitorApi(businessSlug);
  const access = loadCurrentVisitorAccess(businessSlug) ?? await api.recoverLeadSession();
  if (!access) return null;
  const session = await api.getLeadSession(access.leadId);
  return { access, session };
}