import type { DemoRecord } from "../api/seed.ts";
import { liveDriverOf } from "../live/realData.ts";
import type { SafetyBook } from "../safety/ops.ts";
import { caseOf, lateText, type IncidentOps } from "../safety/cases.ts";
import { liveDrivers } from "../dashboard/live.ts";
import { rideRequests } from "../dashboard/riders.ts";
import { demoShift } from "../dashboard/scheduled.ts";
import { driverFacts } from "../dispatch/demo.ts";
import { autoOfflineRows } from "../live/dispatchFacts.ts";
import { liveRules, type DispatchBook } from "../dispatch/rules.ts";
import { DRIVER_DOCUMENTS } from "../drivers/gate.ts";
import { driverOps, type DriverOpsBook } from "../drivers/ops.ts";
import { daysUntil, DRIVER_DOC_LABELS } from "../fleet/documents.ts";
import { localDay } from "../dashboard/time.ts";
import type { Market } from "../markets/markets.ts";
import { failureCause, failureHandled } from "../payments/failures.ts";
import type { RiderRow } from "../riders/segments.ts";
import { alertBy, alertTitle, followText, reasonText, shiftOf, shifted, worries, type RideCheck } from "../safety/rideCheck.ts";
import type { Facts } from "./engine.ts";
import { tr } from "../i18n/core.ts";

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** What the facts are built from: the bar's reads (empty lists when a read is off) and the live / demo switch. */
export type AlertFactsInput = {
  /** isLiveData(): live shows only the server's facts; the demo engine builds its own from the demo tables. */
  live: boolean;
  now: number;
  /** The admin API's demo flag (demo time shift). */
  demo: boolean;
  market: Market;
  zones: readonly { id: string; name: string }[];
  drivers: readonly DemoRecord[];
  vehicles: readonly DemoRecord[];
  trips: readonly DemoRecord[];
  incidents: readonly DemoRecord[];
  reservations: readonly DemoRecord[];
  payments: readonly DemoRecord[];
  payouts: readonly DemoRecord[];
  tickets: readonly DemoRecord[];
  zoneSupply: readonly DemoRecord[];
  riderRows: readonly RiderRow[];
  safety: SafetyBook;
  incidentOps: IncidentOps;
  dispatchBook: DispatchBook;
  driverOps: DriverOpsBook;
  rideChecks: readonly RideCheck[];
  money: (major: number) => string;
};

/**
 * The facts the demo alert engine (computeAlerts) works the alerts out from, built from the bar's reads. Pure, so
 * node --test covers it.
 *
 * Q132 round 3 (CI fix): moved out of useAlerts. There the online drivers were called `live`, which shadowed the
 * hook's live / demo flag, so Q132's `const liveData = live` read the drivers array (always truthy): the demo took the
 * live branch and lost every demo-only fact (documents, ratings, auto-offline, riders, system health, payment causes),
 * so the demo's "licence has expired" alert was gone (e2e alerts.spec.ts:45, :112). The flag is now `input.live`.
 */
export function alertFacts(input: AlertFactsInput): Facts {
  const { now, zones, market, incidentOps, dispatchBook, rideChecks, money } = input;
  const onlineDrivers = liveDrivers(input.drivers, input.vehicles, input.trips, input.incidents, 0);
  const online = new Set(onlineDrivers.map((driver) => driver.id));
  const requests = rideRequests(input.trips, [], (id) => online.has(id));
  const freeByZone: Record<string, number> = {};
  for (const driver of onlineDrivers) if (driver.state === "free") freeByZone[driver.zoneId] = (freeByZone[driver.zoneId] ?? 0) + 1;
  const opsOf = (row: { id: string; name: string; fleetId?: string | null; status: string; kind?: string }) => driverOps(input.driverOps, { id: row.id, name: row.name, fleetId: row.fleetId ?? null, status: row.status, kind: row.kind });
  const activeDrivers = (input.drivers).filter((row) => row.status === "active");
  const shift = demoShift(now, input.demo);
  const day = localDay(now, market.timeZone);
  const zoneName = (id: string) => market.zones.find((zone) => zone.id === id)?.name ?? id;
  const hour = Math.floor(now / 3_600_000);
  // Live (owner rule, part 3): only facts the server sends; local demo stores and hashes give nothing.
  const liveData = input.live;
  return {
    now,
    day,
    zones: zones.map((zone) => ({ id: zone.id, name: zone.name })),
    incidents: (input.incidents).map((row) => {
      const record = input.safety.incidents[row.id];
      return { id: row.id, zoneId: row.zoneId, who: row.name, status: row.status, owner: record?.owner ?? null, takenAt: record?.events.find((event) => event.kind === "take")?.at ?? null, createdAt: row.createdAt ?? null, late: lateText(caseOf(row, input.safety, incidentOps, now), incidentOps.settings, now), kind: row.kind };
    }),
    rideChecks: rideChecks.flatMap((check) => {
      const row = check.incidentId ? (input.incidents).find((item) => item.id === check.incidentId) : undefined;
      const first = alertBy(check);
      if (!row || !first) return [];
      const opened = caseOf(row, input.safety, incidentOps, now).openedAt;
      const said = worries(check).map((item) => followText(item.follow));
      return [{
        id: check.id,
        incidentId: row.id,
        zoneId: check.zoneId,
        status: row.status,
        title: tr("Ride check: {0}", [alertTitle(check)]),
        detail: [...(said.length ? said : [reasonText(check)]), zoneName(check.zoneId), check.tripId].join(" · "),
        since: shifted(first.answer.at, shiftOf(check, opened, shift)),
      }];
    }),
    requests: requests.map((request) => ({ tripId: request.tripId, rider: request.rider, zoneId: request.zoneId, waitingMin: request.waitingMin, searching: request.status === "searching" })),
    freeByZone,
    ...(liveData ? { supplyByZone: Object.fromEntries((input.zoneSupply).filter((row) => row.supply).map((row) => [row.zoneId, { free: row.supply!.free, waiting: row.supply!.waiting }])) } : {}),
    dispatch: (zoneId) => {
      const alerts = liveRules(dispatchBook, zoneId).alerts;
      const pick = (id: "long_wait" | "few_drivers" | "no_driver") => {
        const item = alerts.find((entry) => entry.id === id);
        return { on: Boolean(item?.on), limit: item?.limit ?? 5 };
      };
      return { long_wait: pick("long_wait"), few_drivers: pick("few_drivers"), no_driver: pick("no_driver") };
    },
    lateRides: (input.reservations)
      .filter((row) => row.pickupAt && (row.status === "waiting" || row.status === "booked") && !row.driverId)
      .map((row) => ({ id: row.id, rider: row.name, zoneId: row.zoneId, minutesLeft: Math.round((Date.parse(row.pickupAt!) + shift - now) / 60_000) }))
      .filter((row) => row.minutesLeft >= 0 && row.minutesLeft <= 180),
    documents: liveData ? [] : activeDrivers.flatMap((row) => {
      const ops = opsOf(row);
      return DRIVER_DOCUMENTS.filter((id) => !(row.fleetId && id === "company_registration")).flatMap((id) => {
        const doc = ops.documents[id];
        const days = doc ? daysUntil(doc.expiresAt, now, market.timeZone) : null;
        return days === null ? [] : [{ driverId: row.id, driver: row.name, zoneId: row.zoneId, doc: DRIVER_DOC_LABELS[id] ?? id, days }];
      });
    }),
    ratings: liveData
      ? activeDrivers.flatMap((row) => {
        const rating = liveDriverOf(row)?.rating ?? null;
        return rating === null ? [] : [{ driverId: row.id, driver: row.name, zoneId: row.zoneId, rating }];
      })
      : activeDrivers.map((row) => ({ driverId: row.id, driver: row.name, zoneId: row.zoneId, rating: opsOf(row).ratings.stars })),
    // Owner 2026-11-04 (real driver facts): no alert from a null fact (autoOfflineRows); on live the server raises
    // auto-offline itself (it sets the driver offline), so the panel invents nothing here.
    offline: liveData ? [] : autoOfflineRows(driverFacts(onlineDrivers, () => ({ rating: 4.7, acceptancePct: 80, cancelPct: 5, categories: [] }), null), (zoneId) => {
      const rule = liveRules(dispatchBook, zoneId).autoOffline;
      return rule.on ? rule.after : null;
    }),
    payments: (input.payments)
      .filter((row) => row.status === "failed" && !failureHandled(row))
      .map((row) => {
        const cause = liveData ? { kind: "rider" as const, reason: "Not connected yet" } : failureCause(row);
        return { id: row.id, zoneId: row.zoneId, rider: row.name, amount: (row.fareOre ?? 0) / market.minorUnits, system: cause.kind === "system", reason: cause.reason, ...(row.createdAt ? { at: row.createdAt } : {}) };
      }),
    // A2 leftovers (owner Q1 "One admin always"): no refund waits for a second admin.
    refunds: [],
    payouts: (input.payouts).filter((row) => row.status === "scheduled").map((row) => ({ id: row.id, driver: (input.drivers).find((item) => item.id === row.driverId)?.name ?? row.name, zoneId: row.zoneId, amount: (row.fareOre ?? 0) / market.minorUnits })),
    riders: liveData ? [] : input.riderRows.filter((row) => row.profile.country === market.id).map((row) => ({ id: row.rider.id, name: row.rider.name, flags: row.profile.fraudFlags, cancelRate: row.profile.cancelRate, rides: row.profile.completed + row.profile.cancelled + row.profile.noShows })),
    tickets: (input.tickets).filter((row) => row.status === "open").map((row) => ({ id: row.id, name: row.name, zoneId: row.zoneId, ...(row.openedBy ? { openedBy: row.openedBy } : {}) })),
    // Demo health: the map tiles are slow now and then; the backend reports real health later.
    system: liveData ? [] : [
      { id: "api", name: "Admin API", state: "ok", detail: "" },
      { id: "maps", name: "Map tiles", state: hash(`maps:${hour}`) % 4 === 0 ? "slow" : "ok", detail: "Answers take over 2 seconds" },
      { id: "payments", name: "Payment provider", state: hash(`pay:${hour}`) % 9 === 0 ? "slow" : "ok", detail: "Card payments take longer than usual" },
      { id: "push", name: "Driver app notifications", state: "ok", detail: "" },
    ],
    money,
  };
}
