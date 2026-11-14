import { canAdjustFare } from "./rules.ts";

/**
 * BQ-A28 (owner "Add jobs" 2026-11-14, owner rule "screens must be simple"): the trip page shows ONE driver pay box, the
 * one that works now, never both.
 * - "set": during the trip (a driver has it, not ended) — J6a "Driver pay", the admin types the whole pay (POST …/adjust).
 * - "change": after the end, with a driver — "Change the driver's pay", + or − (POST …/driver-pay).
 * - null: no box (no driver yet, or ended without a driver).
 */
export type DriverPayBox = "set" | "change" | null;

/** The ended trip states (contract.json#tripStatus terminal states); the +/− change works only on these. */
export const TRIP_ENDED: readonly string[] = ["completed", "cancelled_by_rider", "cancelled_by_driver", "cancelled_by_admin", "cancelled_by_system", "no_show", "expired", "failed"];

export function driverPayBox(status: string, hasDriver: boolean): DriverPayBox {
  if (canAdjustFare(status)) return "set";
  if (hasDriver && TRIP_ENDED.includes(status)) return "change";
  return null;
}
