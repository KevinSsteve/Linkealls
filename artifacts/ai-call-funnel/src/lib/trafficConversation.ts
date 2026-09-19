import { loadCurrentVisitorAccess, visitorApi, type VisitorLeadOrigin } from "./visitorAccess";

export interface ResolvedTrafficCreative {
  slug: string;
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
  await visitorApi(businessSlug).createLeadSession(
    { ...allowedTrafficOrigin(location.search, location.href), trafficCreativeSlug: creative.slug },
    [],
  );
  return `${import.meta.env.BASE_URL}e/${encodeURIComponent(businessSlug)}?message=${encodeURIComponent("Quero saber mais sobre isto")}`;
}

export async function restoreTrafficConversation(businessSlug: string) {
  const access = loadCurrentVisitorAccess(businessSlug);
  if (!access) return null;
  const session = await visitorApi(businessSlug).getLeadSession(access.leadId);
  return { access, session };
}