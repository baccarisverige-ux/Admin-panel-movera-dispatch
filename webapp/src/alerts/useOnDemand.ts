import { useMemo } from "react";
import { useRecords } from "../api/hooks";
import { isLiveData } from "../live/realData";
import { asRideChecks, type RideCheck } from "../safety/rideCheck";
import { alertIncidentsRead, rideCheckRowsRead } from "./reads";

/** What an SOS / ride-check alert needs of its case: who raised it, its zone, status and kind. */
export type AlertIncident = { id: string; zoneId: string; who: string; status: string; kind?: string };

/**
 * Q132: the open cases, read only where an alert needs them (the SOS take / solve buttons, the solved history's zone),
 * not by the alert bar on every page. Live: the open cases only (one small read, the same key as Safety and Dashboard).
 */
export function useAlertIncidents(enabled = true): AlertIncident[] {
  const read = alertIncidentsRead(isLiveData(), enabled);
  const rows = useRecords(read.list, undefined, read.options);
  return useMemo(() => (rows.data ?? []).map((row) => ({ id: row.id, zoneId: row.zoneId, who: row.name, status: row.status, ...(row.kind ? { kind: row.kind } : {}) })), [rows.data]);
}

/**
 * Q132: the ride checks behind an alert (live: need_help, plus the amber waiting / no-answer checks of trips going on,
 * both sides). Read by the bar only while a ride-check alert is in the list, and by the live maps that pin them.
 */
export function useRideCheckRows(enabled = true): { checks: RideCheck[]; loading: boolean } {
  const read = rideCheckRowsRead(isLiveData(), enabled);
  const rows = useRecords(read.list, undefined, read.options);
  const checks = useMemo(() => asRideChecks(rows.data), [rows.data]);
  return { checks, loading: rows.isLoading };
}
