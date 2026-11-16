import { followsIncident, type KindId } from "./engine.ts";
import { OPEN_INCIDENTS_LIST } from "../live/incidents.ts";
import { RIDE_CHECK_ALERTS_LIST } from "../live/liveAdminApi.ts";

/**
 * Q132 (owner W2 answer A, 2026-11-15): what the shared alert bar (useAlerts, mounted on every page) reads.
 *
 * Live: the server finds every alert (v0.18.20, GET /admin/alerts/book); the panel only shows them. So the bar reads
 * the alert list, who owns each SOS (safetyOps) and the ride-check banner's "opened" book; it reads the ride checks
 * behind an alert only while the list holds a ride-check alert the viewer may see (the red banner needs the check id).
 * No table (drivers, trips, payments ...) is read to build alerts in the browser on live. What one alert needs (the
 * SOS take / solve, the history's zone, the map's ride checks) is read on demand where it is shown.
 *
 * Demo: the panel's own engine (computeAlerts) still works the alerts out from its tables, unchanged.
 */
export type AlertRead =
  | "alerts" | "safetyOps" | "rideCheckOps" | "rideChecks"
  | "incidentOps" | "dispatch" | "driverOps" | "drivers" | "zoneSupply" | "trips" | "incidents"
  | "reservations" | "payments" | "payouts" | "vehicles" | "tickets" | "riders";

export type AlertReadInput = { live: boolean; canSafety: boolean; canRideCheck: boolean; found: readonly { kind: KindId; state?: "open" | "solved" }[] | undefined };

export function alertReads({ live, canSafety, canRideCheck, found }: AlertReadInput): Record<AlertRead, boolean> {
  const demo = !live;
  return {
    alerts: true,
    safetyOps: canSafety,
    rideCheckOps: canRideCheck,
    // Live: only while a ride-check alert is in the list (its check id for the red banner); demo: as before.
    rideChecks: demo || (canRideCheck && Boolean(found?.some((alert) => alert.kind === "ride_check"))),
    incidentOps: demo && canSafety,
    dispatch: demo,
    driverOps: demo,
    drivers: demo,
    zoneSupply: demo,
    trips: demo,
    // Round 2 (SF-1, safety): live, the open cases stay read while an SOS / car-lost / ride-check / SOS-slow alert is
    // open, for a role that may read cases, so the alert row's Take / Solved buttons never wait for a read (same list
    // and key as useAlertIncidents: one shared cache entry, not a second read). A role without incidents.read never.
    incidents: demo || (canSafety && Boolean(found?.some((alert) => alert.state !== "solved" && followsIncident(alert.kind)))),
    reservations: demo,
    payments: demo,
    payouts: demo,
    vehicles: demo,
    tickets: demo,
    riders: demo,
  };
}

/** The poll times of the bar's reads (unchanged numbers; a read that is off is not polled). */
export function alertPolls(live: boolean): Partial<Record<AlertRead, number>> {
  return {
    ...(live ? { alerts: 15_000 } : {}),
    rideChecks: 10_000,
    drivers: 15_000,
    zoneSupply: 15_000,
    trips: 15_000,
    incidents: 10_000,
    reservations: 30_000,
    payments: 30_000,
    tickets: 30_000,
  };
}

/** What one read is given: on or off, and its poll time (none when it has no timer). */
export type ReadOptions = { enabled: boolean; refetchMs?: number };

/** Round 2 (SF-2): the options useAlerts passes to each of its reads, from the plan and the poll times. */
export function alertReadOptions(input: AlertReadInput): Record<AlertRead, ReadOptions> {
  const on = alertReads(input);
  const polls = alertPolls(input.live);
  const out = {} as Record<AlertRead, ReadOptions>;
  for (const name of Object.keys(on) as AlertRead[]) {
    const refetchMs = polls[name];
    out[name] = { enabled: on[name], ...(refetchMs ? { refetchMs } : {}) };
  }
  return out;
}

/** The open cases behind an alert (useAlertIncidents, and the bar's warm read): live the open cases only. */
export function alertIncidentsRead(live: boolean, enabled: boolean): { list: string; options: ReadOptions } {
  return { list: live ? OPEN_INCIDENTS_LIST : "incidents", options: { refetchMs: alertPolls(live).incidents, enabled } };
}

/** The ride checks behind an alert (useRideCheckRows): live only those behind an alert. */
export function rideCheckRowsRead(live: boolean, enabled: boolean): { list: string; options: ReadOptions } {
  return { list: live ? RIDE_CHECK_ALERTS_LIST : "rideChecks", options: { refetchMs: alertPolls(live).rideChecks, enabled } };
}

/**
 * Where each kind comes from on live. "server": the server's detector raises it (movera-server
 * src/alerts/detector.ts). Anything else is a named server gap: the panel does not make it on live either, so it is
 * never shown on live until the server makes it (the demo engine still shows it).
 */
export const LIVE_KIND_SOURCE: Record<KindId, "server" | { gap: string }> = {
  sos: "server",
  car_lost: "server",
  ride_check: "server",
  sos_slow: "server",
  long_wait: "server",
  few_drivers: "server",
  no_driver: "server",
  late_reservation: "server",
  booked_at_risk: "server",
  booked_late: "server",
  booked_not_started: "server",
  booked_taken_back: "server",
  no_driver_nearby: "server",
  booked_no_driver_ended: "server",
  doc_expiring: "server",
  low_rating: "server",
  auto_offline: "server",
  payment_failed: "server",
  refund_approval: "server",
  payout_big: "server",
  rider_cancels: "server",
  ticket_open: "server",
  system_health: "server",
  rule: "server",
  rider_fraud: { gap: "The server has no fraud signal yet (detector.ts riderCauses); the panel showed none on live either." },
};
