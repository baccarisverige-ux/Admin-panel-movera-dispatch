/**
 * v0.18.78 (L78-A, contract.json#adminListFilters.incidentsByPerson; owner 2026-11-12 item 5): one driver's or one
 * rider's cases, every status (GET /admin/incidents?driverId= / ?riderId=, every page; indexed on the server), instead
 * of every case. A server before v0.18.78 answers these keys with 400 invalid_request reason unknown_filter: then this
 * session reads every case as before (the detail page's own driver / rider filter narrows it) and never asks again.
 * Any other error is the page's normal error line.
 */
import { ApiError } from "../api/httpClient.ts";
import type { ServerIncident } from "./incidents.ts";
import { all } from "./listPages.ts";
import type { LiveClient } from "./session.ts";
import type { ZoneFilter } from "./zoneFilter.ts";

/** Per admin API (one session): false once the server said it has no person filter. */
export type PersonFilterMemo = { personFilter?: boolean };

export async function readPersonIncidents(client: LiveClient, kind: "driverId" | "riderId", id: string, filter: ZoneFilter, memo: PersonFilterMemo): Promise<ServerIncident[]> {
  if (!id) return [];
  if (memo.personFilter !== false) {
    try {
      const rows = await all<ServerIncident>(client, "/admin/incidents", filter, { [kind]: id });
      memo.personFilter = true;
      return rows;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 400 && error.reason === "unknown_filter")) throw error;
      memo.personFilter = false;
    }
  }
  return all<ServerIncident>(client, "/admin/incidents", filter);
}
