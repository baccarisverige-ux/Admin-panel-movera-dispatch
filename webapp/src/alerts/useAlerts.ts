import { isLiveData } from "../live/realData";
import { useEffect, useMemo, useState } from "react";
import { useRecords, useSlice } from "../api/hooks";
import { useAdminApi } from "../api/AdminApiContext";
import { emptySafety, type SafetyBook } from "../safety/ops";
import { INCIDENT_OPS_KEY, emptyIncidentOps, normalizeIncidentOps, type IncidentOps } from "../safety/cases";
import { useSession } from "../auth/SessionContext";
import { can } from "../auth/permissions";
import { demoShift } from "../dashboard/scheduled";
import { DISPATCH_KEY, emptyDispatchBook, normalizeDispatchBook, type DispatchBook } from "../dispatch/rules";
import { emptyDriverOpsBook, type DriverOpsBook } from "../drivers/ops";
import { zoneAllowed } from "../markets/scope";
import { useMarketScope } from "../markets/useMarketScope";
import { money as formatMajor } from "../pricing/zonePricing";
import { useRidersData } from "../riders/useRidersData";
import { RIDE_CHECK_KEY, emptyRideCheckOps, normalizeRideCheckOps, type RideCheckOps } from "../safety/rideCheck";
import { ALERTS_KEY, alertsFromServer, computeAlerts, emptyAlertBook, normalizeAlertBook, openAlerts, splitOld, visibleTo, type AlertBook, type Facts, type OpenAlert } from "./engine";
import { alertFacts } from "./facts";
import { alertBarIncidentsRead, alertBarLoading, alertPolls, alertReadOptions } from "./reads";
import { useRideCheckRows } from "./useOnDemand";

/**
 * Every alert for the chosen country and zones, worked out once from the panel's data and shared by
 * the bell, the Alerts section, the Dashboard strip and Dispatch → Live, so the numbers always match.
 */
export function useAlerts() {
  const api = useAdminApi();
  const { agent } = useSession();
  const scope = useMarketScope();
  const market = scope.market;
  const live = isLiveData();
  // v0.18.20: on live the book carries the server's alerts; read again every 15 s (and on each alert.changed event).
  // Only read what the role may read: a refused read is retried and slows every save.
  const canSafety = Boolean(agent && can(agent.role, "incidents.read"));
  // Ride check alerts go to the safety team and to dispatchers.
  const canRideCheck = Boolean(agent && (can(agent.role, "incidents.read") || can(agent.role, "trips.intervene")));
  const slice = useSlice<AlertBook>(ALERTS_KEY, emptyAlertBook(), { refetchMs: alertPolls(live).alerts });
  const book = useMemo(() => normalizeAlertBook(slice.value), [slice.value]);
  // Q132 (owner W2 A): live, the bar reads only the server's alert list (+ the SOS owner and the ride-check banner's
  // book); no table is read to build alerts in the browser. Demo: the panel's own engine reads its tables as before.
  // Round 2 (SF-1): an open SOS / car-lost / ride-check alert keeps the open cases read on (Take / Solved never wait).
  const readInput = { live, canSafety, canRideCheck, found: book.found };
  const reads = alertReadOptions(readInput);
  const safety = useSlice<SafetyBook>("safetyOps", emptySafety(), reads.safetyOps);
  const incidentSlice = useSlice<IncidentOps>(INCIDENT_OPS_KEY, emptyIncidentOps(), reads.incidentOps);
  const incidentOps = useMemo(() => normalizeIncidentOps(incidentSlice.value), [incidentSlice.value]);
  const dispatchSlice = useSlice<DispatchBook>(DISPATCH_KEY, emptyDispatchBook(), reads.dispatch);
  const dispatchBook = useMemo(() => normalizeDispatchBook(dispatchSlice.value), [dispatchSlice.value]);
  const driverStore = useSlice<DriverOpsBook>("driverOps", emptyDriverOpsBook(), reads.driverOps);
  const drivers = useRecords("drivers", undefined, reads.drivers);
  // G3-D5: live, the server's supply per zone (every online driver counted in his zone, position or not).
  const zoneSupply = useRecords("zoneSupply", undefined, reads.zoneSupply);
  const trips = useRecords("trips", undefined, reads.trips);
  // B1.26b: live, the open cases only (one small read), not every page of the case history.
  // SF-A X1: the warm read comes from the plan (alerts/reads.ts, tested), the same cache entry as the alert row's.
  const incidentRead = alertBarIncidentsRead(readInput);
  const incidents = useRecords(incidentRead.list, undefined, incidentRead.options);
  const reservations = useRecords("reservations", undefined, reads.reservations);
  const payments = useRecords("payments", undefined, reads.payments);
  const payouts = useRecords("payouts", undefined, reads.payouts);
  const vehicles = useRecords("vehicles", undefined, reads.vehicles);
  const tickets = useRecords("tickets", undefined, reads.tickets);
  const riders = useRidersData("month", undefined, reads.riders);
  // C4 (A15 N15): live, only the checks behind an alert (need_help, both sides of those trips), never every check;
  // Q132: and only while the list holds a ride-check alert this admin may see.
  const { checks: rideChecks } = useRideCheckRows(reads.rideChecks.enabled);
  const rideSlice = useSlice<RideCheckOps>(RIDE_CHECK_KEY, emptyRideCheckOps(), reads.rideCheckOps);
  const rideOps = useMemo(() => normalizeRideCheckOps(rideSlice.value), [rideSlice.value]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 30_000) * 30_000);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 30_000) * 30_000), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const access = useMemo(() => agent?.scope ?? { zones: "all" as const }, [agent?.scope]);
  const zones = useMemo(() => market.zones.filter((zone) => zoneAllowed(access, zone.id) && (!scope.zones.length || scope.zones.includes(zone.id))), [market, access, scope.zones]);
  // Contract v0.18.59 §81: the dinar with a dot and a space between thousands ("1 250.500 DT"), in every language;
  // GM item 13: always the currency's own decimals, with the one formatter (C-23).
  const money = (major: number) => formatMajor(major, market.id);

  // Q132 round 3: the facts are built by a pure function (alerts/facts.ts); `live` here is the live / demo flag.
  const facts = useMemo((): Facts => alertFacts({
    live, now, demo: api.demo, market, zones,
    drivers: drivers.data ?? [], vehicles: vehicles.data ?? [], trips: trips.data ?? [], incidents: incidents.data ?? [],
    reservations: reservations.data ?? [], payments: payments.data ?? [], payouts: payouts.data ?? [], tickets: tickets.data ?? [],
    zoneSupply: zoneSupply.data ?? [], riderRows: riders.rows, safety: safety.value, incidentOps, dispatchBook,
    driverOps: driverStore.value, rideChecks, money,
  }),
  // money depends only on the market, which is already a dependency.
  [live, now, zones, drivers.data, vehicles.data, trips.data, incidents.data, reservations.data, payments.data, payouts.data, tickets.data, riders.rows, safety.value, incidentOps, dispatchBook, driverStore.value, market, api.demo, rideChecks, zoneSupply.data]);

  // v0.18.20 server-side alerts: on live the server finds every alert (owner A1–A3); the panel only reads them. The
  // panel's own engine stays for the demo (demo removal is its own job).
  const liveFound = live;
  const all = useMemo(
    () => (liveFound
      ? alertsFromServer(book.found ?? [], zones, (incidentId) => rideChecks.find((check) => check.incidentId === incidentId)?.id)
      : computeAlerts(facts, book.settings, book.rules.filter((rule) => rule.country === market.id))),
    [liveFound, book.found, zones, rideChecks, facts, book.settings, book.rules, market.id],
  );
  const sosOwner = (incidentId: string) => safety.value.incidents[incidentId]?.owner ?? null;
  const viewer = agent ? { id: agent.id, role: agent.role, can: (permission: string) => can(agent.role, permission) } : null;
  const listed: OpenAlert[] = useMemo(() => openAlerts(all, book, now, (id) => safety.value.incidents[id]?.owner ?? null).filter((alert) => (viewer ? visibleTo(alert, book, viewer, now) : false)), [all, book, now, safety.value, viewer?.id, viewer?.role]);
  // v0.18.31 owner Q-Bj: old SOS / safety cases (trip ended + 24 h) leave the open list for the Old tab; never closed by themselves.
  const { open, old } = useMemo(() => splitOld(listed), [listed]);
  // Owner A2: a green (solved by itself) alert stays in the list but no longer counts or rings.
  const active = open.filter((alert) => alert.status !== "snoozed" && !alert.muted && !alert.solved);
  // The red banner: ride check alerts nobody has opened yet.
  const unopened = rideSlice.loading ? [] : open.filter((alert) => alert.kind === "ride_check" && alert.rideCheckId && !rideOps.opened[alert.rideCheckId]);
  return {
    book,
    slice,
    safety,
    facts,
    all,
    open,
    old,
    active,
    zones,
    market,
    money,
    now,
    sosOwner,
    rideCheck: { checks: rideChecks, ops: rideOps, loading: rideSlice.loading, unopened, demoShift: demoShift(now, api.demo) },
    // Round 2 / SF-A X2: live, the alert list only; the warm read of the open cases never holds back the alert sound.
    loading: alertBarLoading(readInput, { alerts: slice.loading, incidents: incidents.isLoading, trips: trips.isLoading }),
    counts: {
      critical: active.filter((alert) => alert.level === "critical").length,
      important: active.filter((alert) => alert.level === "important").length,
      info: active.filter((alert) => alert.level === "info").length,
      mine: open.filter((alert) => alert.owner === agent?.id).length,
      notTaken: active.filter((alert) => alert.status === "new").length,
      solved: open.filter((alert) => alert.solved).length,
    },
  };
}
