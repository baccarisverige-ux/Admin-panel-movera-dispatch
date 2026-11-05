import { isLiveWithDriver } from "../live/tripLive.ts";

/**
 * FIX JOB 7 B-k (contract v0.18.30, contract.json#smallFixes.adminLabels.liveCount): the Live tab said "Live 13" while
 * 20 trips were open, because it counted only the trips waiting for a driver. It now reads "Searching N · Live M":
 * N = the ride requests still looking for a driver (the same list the Live tab shows), M = trips with a driver
 * (accepted until the drop-off).
 */
export function liveTabCounts(searching: number, trips: readonly { status: string; driverId?: string | null }[]): { searching: number; withDriver: number } {
  return { searching, withDriver: trips.filter((trip) => isLiveWithDriver(trip.status, trip.driverId)).length };
}
