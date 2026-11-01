/**
 * Server-side list controls for the demo list pages in a live build: per server list (drivers, fleets, vehicles,
 * trips) the search text, the status filter and how many pages are loaded ("Load more"). liveAdminApi reads them
 * when it lists, and remembers whether the server has a next page.
 */
export type LiveListName = "drivers" | "fleets" | "vehicles" | "trips" | "riders" | "payments";
export type LiveListQuery = { q: string; status: string; pages: number; hasMore: boolean; flagged?: boolean };

const EMPTY: LiveListQuery = { q: "", status: "", pages: 1, hasMore: false };
const state = new Map<LiveListName, LiveListQuery>();
const listeners = new Set<() => void>();

export function listQueryOf(name: LiveListName): LiveListQuery {
  return state.get(name) ?? EMPTY;
}

export function setListQuery(name: LiveListName, patch: Partial<LiveListQuery>): void {
  const current = listQueryOf(name);
  const next = { ...current, ...patch };
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  state.set(name, next);
  listeners.forEach((listener) => listener());
}

export function subscribeLists(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Forget every filter (sign-out, tests). */
export function resetLists(): void {
  state.clear();
  listeners.forEach((listener) => listener());
}

/** The query-string name of the status filter of each server list. */
export const STATUS_PARAM: Record<LiveListName, string> = { drivers: "accountStatus", fleets: "status", vehicles: "status", trips: "status", riders: "status", payments: "status" };
