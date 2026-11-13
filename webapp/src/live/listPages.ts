/**
 * The server list readers of liveAdminApi (moved here unchanged, L78-A A0 / S5 J2 first slice): all() reads every page
 * of a list (up to MAX_PAGES of PAGE_LIMIT rows), paged() reads a list page's own rows ("Load more").
 */
import type { LiveClient } from "./session.ts";
import type { Page } from "./types.ts";
import { NO_FILTER, type ZoneFilter } from "./zoneFilter.ts";
import { STATUS_PARAM, listQueryOf, setListQuery, type LiveListName } from "./liveLists.ts";

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

/** A list page's own rows: the server's search and status filter, as many pages as "Load more" asked for. */
export async function paged<T>(client: LiveClient, name: LiveListName, path: string, filter: ZoneFilter = NO_FILTER, signal?: AbortSignal): Promise<T[]> {
  const query = listQueryOf(name);
  const items: T[] = [];
  let cursor: string | null = null;
  for (let index = 0; index < query.pages; index += 1) {
    const params = new URLSearchParams({ limit: String(LIST_PAGE) });
    if (query.q) params.set("q", query.q);
    if (query.status) params.set(STATUS_PARAM[name], query.status);
    // v0.18.9 (G7): the Trips list "Flagged only" filter (GET /admin/trips?flagged=true).
    if (name === "trips" && query.flagged) params.set("flagged", "true");
    if (cursor) params.set("cursor", cursor);
    for (const [key, value] of filter.params) params.set(key, value);
    const page: Page<T> = await client.json<Page<T>>(`${path}?${params.toString()}`, signal ? { signal } : {});
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  setListQuery(name, { hasMore: Boolean(cursor) });
  return items;
}
