import { liveTripOf } from "../live/realData.ts";
import { isLiveWithDriver } from "../live/tripLive.ts";

/**
 * FIX JOB 7 B-k (contract v0.18.30, contract.json#smallFixes.adminLabels.liveCount): the Live tab said "Live 13" while
 * 20 trips were open, because it counted only the trips waiting for a driver. It now reads "Searching N · Live M":
 * N = the ride requests still looking for a driver (the same list the Live tab shows), M = trips with a driver
 * (accepted until the drop-off).
 */
export function liveTabCounts(searching: number, trips: readonly { id?: string; status: string; driverId?: string | null }[]): { searching: number; withDriver: number } {
  // S7 M1: a booked ride a driver holds for later is not a trip with a driver on the road yet.
  const kind = (trip: { id?: string }) => (trip.id ? liveTripOf({ ...trip, id: trip.id })?.kind : undefined);
  return { searching, withDriver: trips.filter((trip) => isLiveWithDriver(trip.status, trip.driverId, kind(trip))).length };
}
