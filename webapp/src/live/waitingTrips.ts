/**
 * A2 (contract v0.18.83 adminListFilters.scheduledBefore; owner 2026-11-13 12:24 UTC "Exact contract filter (Rec.)";
 * proof sup3 P6b): the Dashboard's waiting requests are one read,
 * GET /admin/trips?status=requested&status=searching&status=offered&scheduledBefore=<now>: a live trip always passes,
 * a booked ride only once its pickup time is reached (a late send stays on the Dashboard), so booked rides that are
 * not due are never read. A server before v0.18.83 answers scheduledBefore with 400 invalid_request reason
 * unknown_filter: then this session reads as before (the three statuses, every page; the Dashboard's own due rule
 * `scheduledNotDue` narrows it) and never asks again. Any other error is the page's normal error line.
 */
import { ApiError } from "../api/httpClient.ts";
import { WAITING_STATUSES } from "../dashboard/riders.ts";
import { all } from "./listPages.ts";
import type { LiveClient } from "./session.ts";
import type { Trip } from "./types.ts";
import type { ZoneFilter } from "./zoneFilter.ts";

/** Per admin API (one session): false once the server said it has no scheduledBefore filter. */
export type ScheduledBeforeMemo = { scheduledBefore?: boolean };

export async function readWaitingTrips(client: LiveClient, filter: ZoneFilter, memo: ScheduledBeforeMemo, now: number = Date.now()): Promise<Trip[]> {
  const statuses = WAITING_STATUSES.map((status) => ["status", status] as [string, string]);
  if (memo.scheduledBefore !== false) {
    try {
      const rows = await all<Trip>(client, "/admin/trips", filter, [...statuses, ["scheduledBefore", new Date(now).toISOString()]]);
      memo.scheduledBefore = true;
      return rows;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 400 && error.reason === "unknown_filter")) throw error;
      memo.scheduledBefore = false;
    }
  }
  return all<Trip>(client, "/admin/trips", filter, statuses);
}
