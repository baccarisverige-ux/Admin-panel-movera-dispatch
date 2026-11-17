// Admin lazy-load job (2026-11-16): the live list names live in this tiny file, so the alert reads (alerts/reads.ts,
// kept in the first load for safety) and the pages do not pull the whole live client (liveAdminApi.ts, its settings
// code and the zone maths) into the entry script or into a page's first open. liveAdminApi.ts re-exports them.
/** Step 39: list names the Dashboard and the driver page read from the server (the demo keeps "trips" / "drivers"). */
export const WAITING_TRIPS_LIST = "waitingTrips";
export const DRIVER_BY_ID_LIST = "driverById:";
/** C4 (A15 N15): the ride checks of one trip (GET /admin/ride-checks?tripId=…). */
export const RIDE_CHECKS_OF_TRIP_LIST = "rideChecksOfTrip:";
/** C4 (A15 N15): the checks behind ride-check alerts and the map (need_help, waiting, recent no_answer; both sides). */
export const RIDE_CHECK_ALERTS_LIST = "rideCheckAlerts";
/** C7 (A15 N12): the Dashboard counts: open tickets and not-yet-paid payouts, filtered by the server's status. */
export const OPEN_TICKETS_LIST = "openTickets";
