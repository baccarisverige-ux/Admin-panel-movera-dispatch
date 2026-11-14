/**
 * A6 (contract v0.18.83 adminListFilters.total.onlyWhenAsked, G34 fix plan P4-B; owner 2026-11-13 12:24 UTC
 * "Yes (Rec.)"): a read of one of the 10 counted admin lists that does not show the count sends total=false, so the
 * server runs no COUNT (proof sup3 P4: every live reload re-counted page 1). A read that wants the count sends no
 * total key at all (absent = counted, any server copy). A server before v0.18.83 answers total with 400
 * invalid_request reason unknown_filter: then this session (one client) never sends total again and the read is made
 * once more without it, the same way A2 falls back for scheduledBefore (waitingTrips.ts). Any other error is the
 * page's normal error.
 */
import { ApiError, type ApiRequestInit } from "../api/httpClient.ts";
import type { LiveClient } from "./session.ts";

/** contract.json adminListFilters.total.lists: the routes that take `total`. Other routes never get it. */
export const COUNTED_LIST_ROUTES: ReadonlySet<string> = new Set([
  "/admin/trips", "/admin/riders", "/admin/drivers", "/admin/fleets", "/admin/vehicles",
  "/admin/payments", "/admin/refunds", "/admin/payouts", "/admin/tickets", "/admin/incidents",
]);

/** Per session (one live client): false once the server said it has no total key. */
const totalKey = new WeakMap<object, boolean>();

/** GET `path` (with its own query) without a count: + total=false on a counted list of a server that takes it. */
export async function readUncounted<T>(client: LiveClient, path: string, init: ApiRequestInit = {}): Promise<T> {
  const [route = "", search = ""] = path.split("?");
  if (!COUNTED_LIST_ROUTES.has(route) || totalKey.get(client) === false) return client.json<T>(path, init);
  const params = new URLSearchParams(search);
  params.set("total", "false");
  try {
    const answer = await client.json<T>(`${route}?${params.toString()}`, init);
    totalKey.set(client, true);
    return answer;
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 400 && error.reason === "unknown_filter")) throw error;
    totalKey.set(client, false);
  }
  return client.json<T>(path, init);
}
