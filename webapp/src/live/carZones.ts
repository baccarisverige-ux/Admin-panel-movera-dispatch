import { ApiError } from "../api/httpClient.ts";
import { paged, type ListCounting } from "./listPages.ts";
import { setListQuery } from "./liveLists.ts";
import type { LiveClient } from "./session.ts";
import { NO_FILTER, type ZoneFilter } from "./zoneFilter.ts";

/** v0.18.161: lists whose rows with no zone are in no zone (never passed through a zone filter). */
export const ZONED_LISTS: ReadonlySet<string> = new Set(["vehicles", "fleets", "fleetOwners"]);

/** Split from liveAdminApi.ts (Rule 25, file size). */
export function createCarZoneReads(client: LiveClient) {
  /**
   * v0.18.161 (contract.json#adminListFilters.carZones; owner 2026-11-25 "Yes, fix it"): GET /admin/vehicles and GET
   * /admin/fleets take the top bar's zoneId / zoneIds / country and count under it (the old note: the count was kept
   * only for All zones, REMINDERS 60). An older server (before v0.18.161) ignores these keys and sends rows without
   * zoneId (review S1: the admin goes live before the server): then the rows are the whole scope, the count is not kept,
   * and list() filters them here with the old zoneless pass (its zones are the old guess). A 400 unknown_filter is
   * handled the same way (read without the filter for the rest of the session).
   */
  const carZoneFilter: { unsupported?: boolean; oldRows?: Set<string> } = { oldRows: new Set() };
  async function scoped<T extends { zoneId?: string | null }>(name: "vehicles" | "fleets", path: string, filter: ZoneFilter, counting: ListCounting): Promise<T[]> {
    let rows: T[];
    if (carZoneFilter.unsupported || !filter.params.length) rows = await paged<T>(client, name, path, NO_FILTER, undefined, filter.params.length ? "none" : counting);
    else {
      try {
        rows = await paged<T>(client, name, path, filter, undefined, counting);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 400 && error.reason === "unknown_filter")) throw error;
        carZoneFilter.unsupported = true;
        rows = await paged<T>(client, name, path, NO_FILTER, undefined, "none");
      }
    }
    const old = rows.some((row) => row.zoneId === undefined);
    if (old) carZoneFilter.oldRows!.add(name);
    else carZoneFilter.oldRows!.delete(name);
    // An older server's count under a zone pick is the whole scope: never shown.
    if (old && filter.params.length) setListQuery(name, { total: undefined });
    return rows;
  }
  /** Whether the last read of this list came from a server before v0.18.161 (rows without zoneId). */
  const oldCarRows = (name: string) => carZoneFilter.oldRows!.has(name === "fleetOwners" ? "fleets" : name);
  return { scoped, oldCarRows };
}
