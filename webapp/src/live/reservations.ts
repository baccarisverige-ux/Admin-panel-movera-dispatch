import { marketOfZone } from "../markets/markets.ts";

/**
 * v0.18.17 Book later on live (contract.json#bookLater.admin; owner 2026-11-03): Admin › Reservations reads the server's
 * booked rides (GET /admin/trips?kind=scheduled) and each button calls the server. Pure functions, so node --test covers them.
 */

/** The parts of a server TripProjection (admin view) the Reservations list shows. */
export type ServerReservation = {
  tripId: string;
  status: string;
  version: number;
  kind: string;
  zoneId: string;
  categoryId: string;
  scheduledAt?: string;
  createdAt?: string;
  riderId?: string;
  driver?: { driverId: string; firstName?: string } | null;
  pickup?: { address?: string };
  dropoff?: { address?: string };
  fare?: { amountMinor: number; currency: string };
  reservation?: { mode: "now" | "list"; dispatchAt: string; freeChangeUntil: string; noDriver: boolean; overdue?: boolean; notStarted?: boolean; atRisk?: boolean; changeAsk?: { until: string; previousAt: string }; mustBeOnlineAt?: string };
  /** The rules the trip is charged by (TripProjection.terms); noShowAfterMin = the no-show wait after the pickup time. */
  terms?: { noShowAfterMin?: number };
};

export type ReservationAction = "dispatchNow" | "unassign" | "assign" | "offer" | "raise" | "noShow" | "contact" | "cancel" | "open";

const TERMINAL = new Set(["completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_by_admin", "cancelled_by_system", "no_show", "expired", "failed"]);
const NO_DRIVER = new Set(["requested", "searching", "offered"]);

/** The plain-words state of a booked ride (English key; the page translates it). */
export function reservationState(trip: ServerReservation): string {
  if (TERMINAL.has(trip.status)) return trip.status === "completed" ? "Done" : trip.status === "no_show" ? "No-show" : trip.status === "expired" ? "No driver found" : "Cancelled";
  if (trip.status === "requested") return "In Scheduled rides";
  if (NO_DRIVER.has(trip.status)) return "Sent to drivers";
  if (trip.status === "accepted") return trip.reservation?.changeAsk ? "Driver asked to keep the new time" : "Driver holds it";
  return "On the way";
}

/**
 * Supervisor S7 R4 (contract.json#bookLater.liveFixes.noShowTime): the server takes a booked ride's no-show only from
 * its pickup time + the trip's no-show wait (terms.noShowAfterMin; 409 no_show_too_early before). Without the pickup
 * time the server decides alone (true); without the wait, from the pickup time.
 */
export function bookedNoShowDue(scheduledAt: string | undefined, noShowAfterMin: number | undefined, now: number = Date.now()): boolean {
  const pickup = Date.parse(scheduledAt ?? "");
  if (!Number.isFinite(pickup)) return true;
  return now >= pickup + Math.max(0, noShowAfterMin ?? 0) * 60_000;
}

/** Which buttons a booked ride has now (the server checks again). */
export function reservationActions(trip: ServerReservation, now: number = Date.now()): ReservationAction[] {
  if (TERMINAL.has(trip.status)) return ["open"];
  const actions: ReservationAction[] = [];
  if (trip.status === "requested") actions.push("dispatchNow");
  if (trip.status === "accepted") actions.push("unassign");
  if (NO_DRIVER.has(trip.status)) actions.push("assign", "offer", "raise");
  if (["accepted", "driver_to_pickup", "arrived"].includes(trip.status) && (trip.kind !== "scheduled" || bookedNoShowDue(trip.scheduledAt, trip.terms?.noShowAfterMin, now))) actions.push("noShow");
  actions.push("contact", "cancel", "open");
  return actions;
}

/** Needs attention: no driver close to pickup (the server's no-driver flag, owner Q3). */
export const needsAttention = (trip: ServerReservation): boolean => Boolean(trip.reservation?.noDriver) && NO_DRIVER.has(trip.status);

export type View = "all" | "waiting" | "assigned" | "warning" | "cancelled" | "no_show";

export function inView(trip: ServerReservation, view: View): boolean {
  if (view === "all") return true;
  if (view === "waiting") return NO_DRIVER.has(trip.status);
  if (view === "assigned") return trip.status === "accepted" || trip.status === "driver_to_pickup" || trip.status === "arrived";
  if (view === "warning") return needsAttention(trip);
  if (view === "no_show") return trip.status === "no_show";
  return trip.status.startsWith("cancelled") || trip.status === "expired";
}

/** Soonest pickup first; ended rides last. */
export function sortReservations(trips: readonly ServerReservation[]): ServerReservation[] {
  return [...trips].sort((a, b) => Number(TERMINAL.has(a.status)) - Number(TERMINAL.has(b.status)) || Date.parse(a.scheduledAt ?? "") - Date.parse(b.scheduledAt ?? "") || a.tripId.localeCompare(b.tripId));
}

/** The server call of a button: path and body (the admin's reason is required for unassign and cancel). */
export function reservationCall(action: Exclude<ReservationAction, "open">, trip: ServerReservation, input: { reason?: string; driverId?: string; amountMinor?: number } = {}): { path: string; body: Record<string, unknown> } {
  const id = encodeURIComponent(trip.tripId);
  const reason = (input.reason ?? "").trim();
  if (action === "dispatchNow") return { path: `/admin/trips/${id}/reservation/dispatch-now`, body: { expectedVersion: trip.version, ...(reason ? { reason } : {}) } };
  if (action === "unassign") {
    if (!reason) throw new Error("Write why the driver is taken off.");
    return { path: `/admin/trips/${id}/reservation/unassign`, body: { expectedVersion: trip.version, reason } };
  }
  if (action === "assign") {
    const driverId = (input.driverId ?? "").trim();
    if (!driverId) throw new Error("Pick a driver.");
    return { path: `/admin/trips/${id}/assign`, body: { expectedVersion: trip.version, driverId, ...(reason ? { note: reason } : {}) } };
  }
  if (action === "offer") {
    const ids = (input.driverId ?? "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean).slice(0, 10);
    if (!ids.length) throw new Error("Pick a driver.");
    return { path: `/admin/trips/${id}/radar-group`, body: { expectedVersion: trip.version, driverIds: ids, ...(reason ? { note: reason } : {}) } };
  }
  if (action === "raise") {
    const amount = input.amountMinor ?? 0;
    if (!(amount > 0)) throw new Error("Write how much to add.");
    return { path: `/admin/trips/${id}/driver-bonus`, body: { expectedVersion: trip.version, amount: { amountMinor: amount, currency: trip.fare?.currency ?? marketOfZone(trip.zoneId)?.currency ?? "SEK" }, ...(reason ? { note: reason } : {}) } };
  }
  if (action === "noShow") {
    if (!reason) throw new Error("Write why it is a no-show.");
    return { path: `/admin/trips/${id}/no-show`, body: { expectedVersion: trip.version, note: reason } };
  }
  if (action === "contact") {
    if (!reason) throw new Error("Write what was said.");
    return { path: `/admin/trips/${id}/notes`, body: { text: reason } };
  }
  if (!reason) throw new Error("Write why the ride is cancelled.");
  return { path: `/admin/trips/${id}/cancel`, body: { expectedVersion: trip.version, reasonCode: "admin_other", note: reason } };
}

/** The list's query: every booked ride of the admin's zones (contract.json#adminListFilters, kind=scheduled). */
export const RESERVATIONS_PATH = "/admin/trips?kind=scheduled&limit=200";

/** Owner BL-Q7: the pickup time passed with no driver; an admin handles it (it keeps going out as Exclusive). */
export const isOverdue = (trip: ServerReservation): boolean => Boolean(trip.reservation?.overdue) && NO_DRIVER.has(trip.status);

/** Checker M5: a driver holds it but did not start at its pickup time. */
export const notStarted = (trip: ServerReservation): boolean => Boolean(trip.reservation?.notStarted) && trip.status === "accepted";

/** Owner leave on time: the driver may be late for a held booked ride. */
export const atRisk = (trip: ServerReservation): boolean => Boolean(trip.reservation?.atRisk) && trip.status === "accepted";
