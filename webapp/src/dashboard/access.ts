import { createContext, useContext } from "react";
import type { DemoRecord } from "../api/seed.ts";
import { can, type Role } from "../auth/permissions.ts";
import type { LiveTrip } from "./liveTrip.ts";
import type { RideRequest } from "./riders.ts";
import type { ScheduledRide } from "./scheduled.ts";

/**
 * What the Dashboard may show about people. A role with only `overview.read` (content, finance, config)
 * gets the counts, the map and the money, but no rider or driver names, phones or links it cannot open.
 */
export type DashboardAccess = { drivers: boolean; riders: boolean; trips: boolean };

export const FULL_ACCESS: DashboardAccess = { drivers: true, riders: true, trips: true };
export const HIDDEN_RIDER = "Rider";
export const HIDDEN_DRIVER = "Driver";

export function dashboardAccess(role: Role): DashboardAccess {
  return { drivers: can(role, "drivers.read"), riders: can(role, "riders.read"), trips: can(role, "trips.read") };
}

/** Components shared with full pages default to full access; the Dashboard provides the viewer's own. */
export const DashboardAccessContext = createContext<DashboardAccess>(FULL_ACCESS);

export function useDashboardAccess(): DashboardAccess {
  return useContext(DashboardAccessContext);
}

export function maskDrivers(rows: readonly DemoRecord[], access: DashboardAccess): readonly DemoRecord[] {
  return access.drivers ? rows : rows.map((row) => ({ ...row, name: HIDDEN_DRIVER, phone: "" }));
}

export function maskRiders(rows: readonly DemoRecord[], access: DashboardAccess): readonly DemoRecord[] {
  return access.riders ? rows : rows.map((row) => ({ ...row, name: HIDDEN_RIDER, phone: "" }));
}

/** Trips and reservations carry the rider's name and phone too. */
export function maskBookings(rows: readonly DemoRecord[], access: DashboardAccess): readonly DemoRecord[] {
  return access.riders ? rows : rows.map((row) => ({ ...row, name: HIDDEN_RIDER, phone: "" }));
}

export function maskRequests(rows: readonly RideRequest[], access: DashboardAccess): RideRequest[] {
  return rows.map((row) => ({
    ...row,
    rider: access.riders ? row.rider : HIDDEN_RIDER,
    riderId: access.riders ? row.riderId : null,
  }));
}

export function maskRides(rows: readonly ScheduledRide[], access: DashboardAccess): ScheduledRide[] {
  return rows.map((row) => ({
    ...row,
    rider: access.riders ? row.rider : HIDDEN_RIDER,
    driver: access.drivers || !row.driver ? row.driver : HIDDEN_DRIVER,
  }));
}

export function maskTrip(trip: LiveTrip | null, access: DashboardAccess): LiveTrip | null {
  if (!trip) return null;
  const riders = access.riders;
  const drivers = access.drivers;
  return {
    ...trip,
    rider: riders ? trip.rider : HIDDEN_RIDER,
    riderId: riders ? trip.riderId : null,
    riderPhone: riders ? trip.riderPhone : "",
    next: trip.next ? { ...trip.next, rider: riders ? trip.next.rider : HIDDEN_RIDER, link: access.trips ? trip.next.link : null } : null,
    waybill: {
      ...trip.waybill,
      rider: riders ? trip.waybill.rider : HIDDEN_RIDER,
      driver: drivers ? trip.waybill.driver : HIDDEN_DRIVER,
      licence: drivers ? trip.waybill.licence : "—",
    },
  };
}
