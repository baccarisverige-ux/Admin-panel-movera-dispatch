import { tr } from "../i18n/index.ts";

/**
 * v0.18.143 (owner 2026-11-20 "must rider can change !!!!", contract.json#onTrip.routeChange.whileSearching): the lines
 * the Live route-change card adds for a change the rider made while the trip was searched (no driver yet): the event
 * text (texts.adminEvent) and the new pickup. Null for a change the driver was asked about (the card stays as before).
 */
export type SearchingChange = { reason?: string | null; pickup?: { address?: string; lat: number; lng: number } | null };

export function searchingChangeLines(change: SearchingChange): { title: string; pickup: string | null } | null {
  if (change.reason !== "rider_changed_route") return null;
  const pickup = change.pickup ? (change.pickup.address ?? `${change.pickup.lat}, ${change.pickup.lng}`) : null;
  return { title: tr("Rider changed the route while searching"), pickup };
}
