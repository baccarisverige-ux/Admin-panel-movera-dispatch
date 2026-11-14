/**
 * The server list readers of liveAdminApi (moved here unchanged, L78-A A0 / S5 J2 first slice): all() reads every page
 * of a list (up to MAX_PAGES of PAGE_LIMIT rows), paged() reads a list page's own rows ("Load more").
 */
import type { LiveClient } from "./session.ts";
import type { Page } from "./types.ts";
import { NO_FILTER, type ZoneFilter } from "./zoneFilter.ts";
import { STATUS_PARAM, askListCount, listQueryOf, sameListFilter, setCountedKey, setListQuery, takeListCount, type LiveListName } from "./liveLists.ts";
import { readUncounted } from "./listTotalParam.ts";

export { readUncounted };
import { formatNumber, tr } from "../i18n/index.ts";

export const PAGE_LIMIT = 100;
/** One server page of a list page; "Load more" asks for the next one. */
export const LIST_PAGE = 50;
const MAX_PAGES = 20;

export async function all<T>(client: LiveClient, path: string, filter: ZoneFilter = NO_FILTER, extra: Record<string, string> | [string, string][] = {}): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let index = 0; index < MAX_PAGES; index += 1) {
    // Step 39: a repeated key (status=requested&status=searching) comes as entries.
    const query = new URLSearchParams([["limit", String(PAGE_LIMIT)], ...(Array.isArray(extra) ? extra : Object.entries(extra)), ...(cursor ? [["cursor", cursor] as [string, string]] : [])]);
    for (const [key, value] of filter.params) query.set(key, value);
    // A6 (v0.18.83): these reads never show a count, so a counted list is asked with total=false.
    const page: Page<T> = await readUncounted<Page<T>>(client, `${path}?${query.toString()}`);
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return items;
}

/** v0.18.78 (L78-A): the page's `total` when it is a whole number >= 0; anything else is "not counted". */
function countOf(total: unknown): number | undefined {
  return typeof total === "number" && Number.isSafeInteger(total) && total >= 0 ? total : undefined;
}

/** "50 of 1,240": the rows read so far of the rows the server counted, in the admin's language (the panel's own text). */
export function listCountText(loaded: number, total: number): string {
  return tr("{0} of {1}", [formatNumber(loaded), formatNumber(total)]);
}

/**
 * How paged() keeps the server's count (v0.18.78 adminListFilters.total): "page" = the first page's total (absent
 * clears it), "none" = never (the server counts something else than the page shows), "keep" = leave it as it is
 * (a command's own read, not the list page's).
 */
export type ListCounting = "page" | "none" | "keep";

/**
 * A list page's own rows: the server's search and status filter, as many pages as "Load more" asked for.
 * A6 (v0.18.83 total.onlyWhenAsked): the server counts only when the list page asks (it opened, askListCount, or the
 * filter differs from the last counted read); every other read (live reload, Load more) sends total=false and the
 * list keeps the number it shows. "none" / "keep" reads never count.
 */
export async function paged<T>(client: LiveClient, name: LiveListName, path: string, filter: ZoneFilter = NO_FILTER, signal?: AbortSignal, counting: ListCounting = "page"): Promise<T[]> {
  const query = listQueryOf(name);
  const items: T[] = [];
  let cursor: string | null = null;
  let total: number | undefined;
  const countKey = JSON.stringify([query.q, query.status, Boolean(name === "trips" && query.flagged), filter.params]);
  const count = counting === "page" && takeListCount(name, countKey);
  try {
    for (let index = 0; index < query.pages; index += 1) {
      const params = new URLSearchParams({ limit: String(LIST_PAGE) });
      if (query.q) params.set("q", query.q);
      if (query.status) params.set(STATUS_PARAM[name], query.status);
      // v0.18.9 (G7): the Trips list "Flagged only" filter (GET /admin/trips?flagged=true).
      if (name === "trips" && query.flagged) params.set("flagged", "true");
      if (cursor) params.set("cursor", cursor);
      for (const [key, value] of filter.params) params.set(key, value);
      const url = `${path}?${params.toString()}`;
      const init = signal ? { signal } : {};
      const page: Page<T> = index === 0 && count ? await client.json<Page<T>>(url, init) : await readUncounted<Page<T>>(client, url, init);
      // Only the first page of a counted read counts (later pages may leave total out; the panel keeps the first one's).
      if (index === 0 && count) total = countOf(page.total);
      items.push(...page.items);
      cursor = page.nextCursor;
      if (!cursor) break;
    }
  } catch (error) {
    // A counted read that failed: the next read asks for the count again.
    if (count) askListCount(name);
    throw error;
  }
  // The admin changed the filter while this read ran: its count belongs to the old filter, so it is not kept.
  const counted = counting !== "keep" && sameListFilter(query, listQueryOf(name));
  if (!counted) {
    setListQuery(name, { hasMore: Boolean(cursor) });
  } else if (count) {
    setCountedKey(name, countKey);
    setListQuery(name, { hasMore: Boolean(cursor), loaded: items.length, total });
  } else if (counting === "page") {
    // Not counted: the number the list shows stays (rows added since show in the next counted read).
    setListQuery(name, { hasMore: Boolean(cursor), loaded: items.length });
  } else {
    // "none": the count is not kept; a later "page" read counts again.
    setCountedKey(name, null);
    setListQuery(name, { hasMore: Boolean(cursor), loaded: items.length, total: undefined });
  }
  return items;
}
