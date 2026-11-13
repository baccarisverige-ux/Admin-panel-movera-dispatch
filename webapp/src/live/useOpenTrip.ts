import { useEffect } from "react";
import { openTrip } from "./adminEvents";

/**
 * Admin fix A1 (GM condition): while a screen shows one trip (the trip page, the assign panel), a trip.changed for
 * that trip reloads its lists after 1 s, never behind the 5 s busy gap of the other trips.
 */
export function useOpenTrip(tripId: string | null | undefined): void {
  useEffect(() => (tripId ? openTrip(tripId) : undefined), [tripId]);
}
