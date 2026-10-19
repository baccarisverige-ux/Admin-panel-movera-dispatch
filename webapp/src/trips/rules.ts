import { DRIVER_ASSIGNED_STATUSES, TERMINAL_STATUSES, nextStatus, statesFor, type TripStatus } from "../domain/contract.ts";

/*
 * Admin trip commands, derived from the shared transition table (contract.json#transitions, actor "admin").
 * Nothing here lists lifecycle states by hand except the two non-lifecycle edits (fare, waiting) and refunds.
 */

/** admin cancel: every non-terminal status. */
export const CANCEL_OK: readonly TripStatus[] = statesFor("cancel", "admin");
/** admin assign ("Offer to driver"): requested, searching, offered → offered. The driver still accepts. */
export const OFFER_OK: readonly TripStatus[] = statesFor("assign", "admin");
/** admin reassign: offered … arrived → searching (back to dispatch). */
export const REASSIGN_OK: readonly TripStatus[] = statesFor("reassign", "admin");
/** admin no-show: accepted, driver_to_pickup, arrived → no_show. */
export const NO_SHOW_OK: readonly TripStatus[] = statesFor("no_show", "admin");
/** admin complete: rider_onboard, in_trip, approaching_dropoff → completed. */
export const COMPLETE_OK: readonly TripStatus[] = statesFor("complete", "admin");
/** Fare edits while a driver is on the trip (contract driverAssigned). Not a transition. */
export const FARE_ADJUST_OK: readonly TripStatus[] = DRIVER_ASSIGNED_STATUSES;
/** Waiting-time corrections from arrival until the trip runs. Not a transition. */
export const WAITING_OK: readonly TripStatus[] = ["arrived", "rider_onboard", "in_trip"];
/**
 * Full refund: every terminal status except `expired`. An expired trip lapsed before any driver
 * accepted (quoted … offered), so its payment hold is released, never captured: there is nothing to refund.
 * The payment must also be captured (see trips/present.ts refundBlock).
 */
export const REFUND_TRIP_OK: readonly TripStatus[] = TERMINAL_STATUSES.filter((status) => status !== "expired");

export type Trip = {
  id: string;
  status: TripStatus;
  category: "economy" | "comfort" | "premium" | "priority" | "xl" | "electric" | "pet";
  fareOre: number;
  ruleVersion: string;
  driverId: string | null;
};

export type OfferDriver = {
  id: string;
  name: string;
  status: "active" | "suspended" | "on_hold";
  category: Trip["category"];
};

export type DispatchRules = { offerSeconds: number; radiusKm: number };

export const DEFAULT_DISPATCH: DispatchRules = { offerSeconds: 8.5, radiusKm: 30 };

function includes(list: readonly string[], status: string): boolean {
  return list.includes(status);
}

export function canCancel(status: string): boolean {
  return includes(CANCEL_OK, status);
}

export function canOffer(status: string): boolean {
  return includes(OFFER_OK, status);
}

export function canReassign(status: string): boolean {
  return includes(REASSIGN_OK, status);
}

export function canAdjustFare(status: string): boolean {
  return includes(FARE_ADJUST_OK, status);
}

export function canSetWaiting(status: string): boolean {
  return includes(WAITING_OK, status);
}

export function canRefundTrip(status: string): boolean {
  return includes(REFUND_TRIP_OK, status);
}

export function canNoShow(status: string): boolean {
  return includes(NO_SHOW_OK, status);
}

export function canComplete(status: string): boolean {
  return includes(COMPLETE_OK, status);
}

export function cancelTrip(trip: Trip, reason: string): { trip: Trip; error?: string } {
  if (!reason.trim()) return { trip, error: "A reason is required." };
  const to = nextStatus(trip.status, "cancel", "admin");
  if (!to) return { trip, error: `Cannot cancel a trip in ${trip.status}.` };
  return { trip: { ...trip, status: to, driverId: null } };
}

export function eligibleDrivers(trip: Trip, drivers: readonly OfferDriver[]): OfferDriver[] {
  return drivers.filter((driver) => driver.status === "active" && driver.category === trip.category && driver.id !== trip.driverId);
}

export function offerTrip(trip: Trip, driver: OfferDriver, drivers: readonly OfferDriver[]): { trip: Trip; error?: string } {
  const to = nextStatus(trip.status, "assign", "admin");
  if (!to) return { trip, error: "This trip can no longer be offered." };
  if (!eligibleDrivers(trip, drivers).some((item) => item.id === driver.id)) return { trip, error: "That driver is not eligible." };
  return { trip: { ...trip, driverId: driver.id, status: to } };
}

/** Takes the trip off its driver and sends it back to dispatch (searching). Offer it to someone with offerTrip. */
export function reassign(trip: Trip): { trip: Trip; error?: string } {
  const to = nextStatus(trip.status, "reassign", "admin");
  if (!to) return { trip, error: "This trip can no longer be reassigned." };
  return { trip: { ...trip, driverId: null, status: to } };
}

export function markNoShow(trip: Trip, reason: string): { trip: Trip; error?: string } {
  if (!reason.trim()) return { trip, error: "A reason is required." };
  const to = nextStatus(trip.status, "no_show", "admin");
  if (!to) return { trip, error: `No-show is not allowed while the trip is ${trip.status}.` };
  return { trip: { ...trip, status: to } };
}

export function completeTrip(trip: Trip, reason: string): { trip: Trip; error?: string } {
  if (!reason.trim()) return { trip, error: "A reason is required." };
  const to = nextStatus(trip.status, "complete", "admin");
  if (!to) return { trip, error: `Complete is only allowed once the rider is in the car, not while the trip is ${trip.status}.` };
  return { trip: { ...trip, status: to } };
}

export function adjustFare(trip: Trip, percent: number, maxPercent = 15): { trip: Trip; error?: string } {
  if (!canAdjustFare(trip.status)) {
    return { trip, error: `Fare adjustment is not allowed while the trip is ${trip.status}.` };
  }
  if (!Number.isFinite(percent) || percent === 0) return { trip, error: "Enter a non-zero fare adjustment." };
  if (Math.abs(percent) > maxPercent) return { trip, error: `Adjustment is limited to ${maxPercent}%.` };
  const next = Math.round(trip.fareOre * (1 + percent / 100));
  return { trip: { ...trip, fareOre: next } };
}

export function waitingMinutes(status: string, minutes: number): { minutes: number; error?: string } {
  if (!canSetWaiting(status)) return { minutes, error: `Waiting time cannot be changed while the trip is ${status}.` };
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 120) return { minutes, error: "Waiting time must be a whole number from 0 to 120 minutes." };
  return { minutes };
}

export function saveDispatch(current: DispatchRules, next: DispatchRules): { rules: DispatchRules; error?: string } {
  if (next.offerSeconds <= 0 || next.offerSeconds > 60) return { rules: current, error: "Offer window must be between 0 and 60 seconds." };
  if (next.radiusKm <= 0 || next.radiusKm > 100) return { rules: current, error: "Radius must be between 0 and 100 km." };
  return { rules: { ...next } };
}
