/**
 * Server-side list controls for the demo list pages in a live build: per server list (drivers, fleets, vehicles,
 * trips) the search text, the status filter and how many pages are loaded ("Load more"). liveAdminApi reads them
 * when it lists, and remembers whether the server has a next page.
 */
// B1.26b: "incidents" is the Incidents page's case history (pages of 50, "Load more"; owner item 109).
export type LiveListName = "drivers" | "fleets" | "vehicles" | "trips" | "riders" | "payments" | "incidents";
// L78-A (v0.18.78 adminListFilters.total): `loaded` = server rows read so far, `total` = the first page's count
// (absent = not counted); the list shows "{loaded} of {total}".
export type LiveListQuery = { q: string; status: string; pages: number; hasMore: boolean; flagged?: boolean; loaded?: number; total?: number };

const EMPTY: LiveListQuery = { q: "", status: "", pages: 1, hasMore: false };
const state = new Map<LiveListName, LiveListQuery>();
const listeners = new Set<() => void>();

export function listQueryOf(name: LiveListName): LiveListQuery {
  return state.get(name) ?? EMPTY;
}

export function setListQuery(name: LiveListName, patch: Partial<LiveListQuery>): void {
  const current = listQueryOf(name);
  const next = { ...current, ...patch };
  // A new search / status / flagged filter: the old count never shows next to it while the new page loads.
  if (!sameListFilter(current, next)) {
    if (!("total" in patch)) delete next.total;
    if (!("loaded" in patch)) delete next.loaded;
  }
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  state.set(name, next);
  listeners.forEach((listener) => listener());
}

/** Do two list queries ask the server the same (search, status, flagged)? */
export function sameListFilter(a: LiveListQuery, b: LiveListQuery): boolean {
  return a.q === b.q && a.status === b.status && Boolean(a.flagged) === Boolean(b.flagged);
}

export function subscribeLists(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A6 (v0.18.83 adminListFilters.total.onlyWhenAsked): the server counts a list only when the list page asks: when it
 * opens (askListCount) and when its filter changes (a filter key that is not the last counted one). Every other read
 * sends total=false and the list keeps the number it shows. Not part of LiveListQuery: asking redraws nothing.
 */
const countAsked = new Set<LiveListName>();
const countedKey = new Map<LiveListName, string>();

/** The list page opened: its next first-page read is counted (once). */
export function askListCount(name: LiveListName): void {
  countAsked.add(name);
}

/** Should this read of the list be counted? It uses the page's ask; the key is the read's whole filter. */
export function takeListCount(name: LiveListName, key: string): boolean {
  const asked = countAsked.delete(name);
  return asked || countedKey.get(name) !== key;
}

/** The read with this filter key was counted (or the list's count is not kept: null forgets it). */
export function setCountedKey(name: LiveListName, key: string | null): void {
  if (key === null) countedKey.delete(name);
  else countedKey.set(name, key);
}

/** Forget every filter (sign-out, tests). */
export function resetLists(): void {
  state.clear();
  countAsked.clear();
  countedKey.clear();
  listeners.forEach((listener) => listener());
}

/** The query-string name of the status filter of each server list. */
export const STATUS_PARAM: Record<LiveListName, string> = { drivers: "accountStatus", fleets: "status", vehicles: "status", trips: "status", riders: "status", payments: "status", incidents: "status" };
