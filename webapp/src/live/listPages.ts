/**
 * The server list readers of liveAdminApi (moved here unchanged, L78-A A0 / S5 J2 first slice): all() reads every page
 * of a list (up to MAX_PAGES of PAGE_LIMIT rows), paged() reads a list page's own rows ("Load more").
 */
import type { LiveClient } from "./session.ts";
import type { Page } from "./types.ts";
import { NO_FILTER, type ZoneFilter } from "./zoneFilter.ts";
import { STATUS_PARAM, listQueryOf, sameListFilter, setListQuery, type LiveListName } from "./liveLists.ts";
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
    const page: Page<T> = await client.json<Page<T>>(`${path}?${query.toString()}`);
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

/** A list page's own rows: the server's search and status filter, as many pages as "Load more" asked for. */
export async function paged<T>(client: LiveClient, name: LiveListName, path: string, filter: ZoneFilter = NO_FILTER, signal?: AbortSignal, counting: ListCounting = "page"): Promise<T[]> {
  const query = listQueryOf(name);
  const items: T[] = [];
  let cursor: string | null = null;
  let total: number | undefined;
  for (let index = 0; index < query.pages; index += 1) {
    const params = new URLSearchParams({ limit: String(LIST_PAGE) });
    if (query.q) params.set("q", query.q);
    if (query.status) params.set(STATUS_PARAM[name], query.status);
    // v0.18.9 (G7): the Trips list "Flagged only" filter (GET /admin/trips?flagged=true).
    if (name === "trips" && query.flagged) params.set("flagged", "true");
    if (cursor) params.set("cursor", cursor);
    for (const [key, value] of filter.params) params.set(key, value);
    const page: Page<T> = await client.json<Page<T>>(`${path}?${params.toString()}`, signal ? { signal } : {});
    // Only the first page of this read counts (later pages may leave total out; the panel keeps the first one's).
    if (index === 0) total = countOf(page.total);
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  // The admin changed the filter while this read ran: its count belongs to the old filter, so it is not kept.
  const counted = counting !== "keep" && sameListFilter(query, listQueryOf(name));
  setListQuery(name, counted ? { hasMore: Boolean(cursor), loaded: items.length, total: counting === "page" ? total : undefined } : { hasMore: Boolean(cursor) });
  return items;
}
