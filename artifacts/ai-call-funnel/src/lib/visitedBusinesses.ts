/**
 * visitedBusinesses — lightweight localStorage store for tracking which
 * businesses the current device has started a conversation with.
 * Used by the UserConversas page to show recent chats.
 */

const STORAGE_KEY = "lk_visited_businesses";
const MAX_ENTRIES = 50;

export interface VisitedBusiness {
  slug: string;
  lastAt: string; // ISO timestamp of last interaction
}

/** Record (or refresh) a visit for the given business slug. */
export function recordVisit(slug: string): void {
  if (!slug) return;
  const list = getVisited();
  const idx = list.findIndex((v) => v.slug === slug);
  const entry: VisitedBusiness = { slug, lastAt: new Date().toISOString() };
  if (idx >= 0) list.splice(idx, 1);
  list.unshift(entry);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore storage errors (e.g. private mode)
  }
}

/** Return all visited businesses, most recent first. */
export function getVisited(): VisitedBusiness[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as VisitedBusiness[];
  } catch {
    return [];
  }
}
