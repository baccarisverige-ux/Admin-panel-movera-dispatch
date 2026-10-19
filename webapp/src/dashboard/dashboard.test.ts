import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeed, SEED_NOW } from "../api/seed.ts";
import { marketZoneIds } from "../markets/markets.ts";
import { change, earningsReport } from "./earnings.ts";
import { countStates, liveDrivers } from "./live.ts";
import { bucketStarts, parsePeriod, periodParams, periodWindow } from "./period.ts";
import { rideCounts, scheduledRides } from "./scheduled.ts";

const NOW = Date.parse("2026-10-10T14:30:00Z");
const STOCKHOLM = "Europe/Stockholm";

test("periods follow the country's calendar", () => {
  const today = periodWindow({ kind: "today" }, NOW, STOCKHOLM);
  assert.equal(new Date(today.start).toISOString(), "2026-10-09T22:00:00.000Z", "Stockholm midnight");
  assert.equal(today.end, NOW);
  assert.equal(today.bucket, "hour");
  const week = periodWindow({ kind: "week" }, NOW, STOCKHOLM);
  assert.equal(new Date(week.start).toISOString(), "2026-10-04T22:00:00.000Z", "weeks start on Monday");
  assert.equal(week.prevEnd - week.prevStart, week.end - week.start, "compares the same elapsed time");
  assert.equal(new Date(periodWindow({ kind: "year" }, NOW, "Africa/Tunis").start).toISOString(), "2025-12-31T23:00:00.000Z");
  const day = periodWindow({ kind: "date", on: "2026-10-03" }, NOW, "Europe/Paris");
  assert.equal(day.end - day.start, 24 * 3_600_000);
  assert.equal(periodWindow({ kind: "range", from: "2026-01-01", to: "2026-09-30" }, NOW, STOCKHOLM).bucket, "month");
  assert.equal(bucketStarts(week.start, week.spanEnd, "day", STOCKHOLM).length, 7);
  assert.equal(bucketStarts(Date.parse("2026-10-24T22:00:00Z"), Date.parse("2026-10-25T23:00:00Z"), "hour", STOCKHOLM).length, 25, "the DST change day has 25 hours");
});

test("the period travels in the URL", () => {
  assert.deepEqual(parsePeriod(new URLSearchParams("period=date&on=2026-10-03")), { kind: "date", on: "2026-10-03" });
  assert.deepEqual(parsePeriod(new URLSearchParams("period=range&from=2026-10-09&to=2026-10-01")), { kind: "today" }, "a reversed range is refused");
  assert.equal(periodParams({ kind: "week" }, new URLSearchParams("country=FR&on=x")).toString(), "country=FR&period=week");
});

test("earnings are repeatable, add up and stay in the past", () => {
  const window = periodWindow({ kind: "week" }, NOW, STOCKHOLM);
  const a = earningsReport("SE", marketZoneIds("SE"), window);
  const b = earningsReport("SE", marketZoneIds("SE"), window);
  assert.deepEqual(a.totals, b.totals);
  assert.ok(a.totals.trips > 0 && a.totals.grossMinor > 0);
  assert.ok(Math.abs(a.totals.netMinor - (a.totals.commissionMinor - a.totals.refundsMinor)) <= 2);
  const summed = a.series.filter((point) => Number.isFinite(point.current)).reduce((sum, point) => sum + point.current, 0);
  assert.ok(Math.abs(summed - a.totals.grossMinor) <= a.series.length, "chart and total agree");
  assert.ok(Math.abs(a.byZone.reduce((sum, row) => sum + row.minor, 0) - a.totals.grossMinor) <= a.byZone.length);
  const one = earningsReport("SE", ["Z001"], window);
  assert.ok(one.totals.grossMinor < a.totals.grossMinor, "a zone filter narrows the numbers");
  const future = earningsReport("FR", marketZoneIds("FR"), periodWindow({ kind: "date", on: "2026-12-24" }, NOW, "Europe/Paris"));
  assert.equal(future.totals.grossMinor, 0, "no earnings in the future");
  assert.equal(change(110, 100), 10);
  assert.equal(change(5, 0), null);
});

test("live map and scheduled rides read the scoped records", () => {
  const seed = createSeed();
  const tunis = new Set(marketZoneIds("TN"));
  const rows = (list: typeof seed.drivers) => list.filter((row) => tunis.has(row.zoneId));
  const live = liveDrivers(rows(seed.drivers), rows(seed.vehicles), rows(seed.trips), rows(seed.incidents), 0);
  assert.ok(live.length > 0 && live.every((row) => tunis.has(row.zoneId)));
  assert.equal(countStates(live).sos, 1, "the queued Tunis SOS flags one driver");
  assert.ok(live.every((row) => Math.abs(row.lat - 36.84) < 0.3 && Math.abs(row.lng - 10.22) < 0.3), "drivers sit around Tunis");
  const shift = NOW - Date.parse(SEED_NOW);
  const rides = scheduledRides(rows(seed.reservations), seed.drivers, NOW, shift);
  const counts = rideCounts(rides, NOW);
  assert.ok(counts.upcoming > 0 && counts.completed > 0, "past and upcoming rides");
  assert.ok(counts.noShow > 0, "past no-shows are counted");
  const sweden = new Set(marketZoneIds("SE"));
  assert.ok(seed.reservations.some((row) => sweden.has(row.zoneId) && row.status === "no_show"), "Stockholm has no-shows too");
  assert.ok(rides.every((ride, index) => index === 0 || rides[index - 1].pickupAt <= ride.pickupAt), "sorted by pickup");
  assert.ok(rides.some((ride) => ride.warning === "red"), "an unassigned ride inside the hour is flagged");
});

test("drivers on a trip move along their route and carry trip details and a waybill", async () => {
  const { liveTrip } = await import("./liveTrip.ts");
  const { lengthKm } = await import("./route.ts");
  const seed = createSeed();
  const rows = (list: typeof seed.drivers) => list.filter((row) => marketZoneIds("FR").includes(row.zoneId));
  const live = liveDrivers(rows(seed.drivers), rows(seed.vehicles), rows(seed.trips), rows(seed.incidents), 3);
  const moving = live.filter((row) => row.state === "trip" || row.state === "pickup");
  assert.ok(moving.length > 0, "some French drivers are on a trip");
  for (const driver of moving) {
    assert.ok(driver.route && driver.route.path.length > 10, "a trip has a path");
    assert.ok(lengthKm(driver.route!.path) > 0.5, "the path has a real length");
    const trip = liveTrip(driver, { trips: seed.trips, reservations: seed.reservations, vehicles: seed.vehicles, fleets: seed.fleets, riders: seed.riders }, NOW);
    assert.ok(trip, "a moving driver has a current trip");
    assert.equal(trip!.phase, driver.state === "pickup" ? "to_pickup" : "on_trip");
    assert.ok(trip!.etaMin >= 1);
    assert.match(trip!.waybill.number, /^WB-FR-\d{8}-\d{4}$/);
    assert.equal(trip!.waybill.operator, "Movera France SAS");
    assert.match(trip!.fare, /€/);
  }
  const later = liveDrivers(rows(seed.drivers), rows(seed.vehicles), rows(seed.trips), rows(seed.incidents), 4).find((row) => row.id === moving[0].id)!;
  assert.notDeepEqual([later.lat, later.lng], [moving[0].lat, moving[0].lng], "the driver moves on the next tick");
  const free = live.find((row) => row.state === "free");
  if (free) assert.equal(liveTrip(free, { trips: [], reservations: [], vehicles: [], fleets: [], riders: [] }, NOW), null, "a free driver has no trip");
});

test("UI-06: roles without rider, driver or trip access get counts, not names or links", async () => {
  const { dashboardAccess, maskBookings, maskDrivers, maskRequests, maskRiders, maskRides, maskTrip, HIDDEN_DRIVER, HIDDEN_RIDER } = await import("./access.ts");
  const { rideRequests } = await import("./riders.ts");
  const { liveTrip } = await import("./liveTrip.ts");
  const seed = createSeed();
  for (const role of ["content", "finance", "config"] as const) {
    const access = dashboardAccess(role);
    assert.equal(access.drivers, false, `${role} cannot open drivers`);
    assert.equal(access.trips, false, `${role} cannot open trips`);
  }
  const content = dashboardAccess("content");
  const drivers = maskDrivers(seed.drivers, content);
  assert.ok(drivers.every((row) => row.name === HIDDEN_DRIVER && !row.phone), "no driver names or phones");
  assert.equal(drivers.length, seed.drivers.length, "the counts stay");
  const riders = maskRiders(seed.riders, content);
  const trips = maskBookings(seed.trips, content);
  const requests = maskRequests(rideRequests(trips, riders, () => true), content);
  assert.ok(requests.every((row) => row.rider === HIDDEN_RIDER && row.riderId === null), "waiting riders have no name and no link");
  const rides = maskRides(scheduledRides(maskBookings(seed.reservations, content), drivers, NOW), content);
  assert.ok(rides.every((ride) => ride.rider === HIDDEN_RIDER && (ride.driver === null || ride.driver === HIDDEN_DRIVER)), "scheduled rides hide both names");
  const busy = liveDrivers(seed.drivers, seed.vehicles, seed.trips, seed.incidents, 0).find((row) => row.tripId);
  if (busy) {
    const trip = maskTrip(liveTrip(busy, { trips: seed.trips, reservations: seed.reservations, vehicles: seed.vehicles, fleets: seed.fleets, riders: seed.riders }, NOW), content);
    if (trip) assert.ok(trip.rider === HIDDEN_RIDER && trip.riderId === null && !trip.riderPhone && trip.waybill.driver === HIDDEN_DRIVER, "the live trip card and waybill hide people");
  }
  const ops = dashboardAccess("ops");
  assert.deepEqual(maskRiders(seed.riders, ops), seed.riders, "ops still sees names");
});
