/**
 * Older Safety helpers kept because the live admin has no equivalent yet (C-21): the rider-facing incident view
 * without the PIN and the impossible-travel check. Taking and resolving an incident is safety/ops.ts.
 */
export type Incident = {
  id: string;
  state: "queued" | "taken" | "resolved";
  locationAt: string;
  accuracyM: number;
  ownerId: string | null;
};

export const IMPOSSIBLE_TRAVEL_MPS = 55;

export function publicIncident(incident: Incident): { id: string; state: string; locationAt: string; accuracyM: number } {
  return { id: incident.id, state: incident.state, locationAt: incident.locationAt, accuracyM: incident.accuracyM };
}

export function impossibleTravel(distanceM: number, seconds: number): boolean {
  if (seconds <= 0) return false;
  return distanceM / seconds > IMPOSSIBLE_TRAVEL_MPS;
}
