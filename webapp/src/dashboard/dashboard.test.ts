import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeed, SEED_NOW } from "../api/seed.ts";
import { marketZoneIds } from "../markets/markets.ts";
import { change, earningsReport } from "./earnings.ts";
import { countStates, liveDrivers } from "./live.ts";
import { bucketStarts, parsePeriod, periodParams, periodWindow } from "./period.ts";
import { rideCounts, scheduledRides } from "./scheduled.ts";
import { ON_THE_WAY_MAX_MIN, onTheWayRequests, rideRequests } from "./riders.ts";

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
    assert.ok((trip!.etaMin ?? 0) >= 1);
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

test("rides a driver just accepted stay listed as on the way for 15 minutes, never as waiting", () => {
  const db = createSeed();
  const now = Date.parse(SEED_NOW);
  const searching = db.trips.filter((row) => row.status === "searching");
  const accepted = { ...searching[0], status: "accepted", driverId: db.drivers[0].id, acceptedAt: new Date(now - 4 * 60_000).toISOString() };
  const old = { ...searching[1], status: "driver_to_pickup", driverId: db.drivers[1].id, acceptedAt: new Date(now - (ON_THE_WAY_MAX_MIN + 1) * 60_000).toISOString() };
  const seeded = db.trips.filter((row) => row.status === "accepted" && !row.acceptedAt);
  const trips = [accepted, old, ...seeded];
  const names = (id: string) => db.drivers.find((row) => row.id === id)?.name;
  const items = onTheWayRequests(trips, db.riders, names, now);
  assert.deepEqual(items.map((item) => item.tripId), [accepted.id], "only a recent accept from the assign tool");
  assert.equal(items[0].driverName, db.drivers[0].name);
  assert.equal(items[0].status, "offered");
  assert.equal(rideRequests([accepted, old], db.riders).length, 0, "never counted as waiting");
  // Once the driver arrived (or the rider is on board) it leaves the list.
  assert.equal(onTheWayRequests([{ ...accepted, status: "arrived" }], db.riders, names, now).length, 0);
});

// Owner G3-R4 (2026-10-30, contract v0.18.4): "Real numbers only". Riders online come from the server
// (LiveDriverList.ridersOnline per zone); no invented 5 % of the active riders "browsing".
test("G3-R4: riders online are the server's per-zone numbers, never 5 % of the active riders", async () => {
  const riders = await import("./riders.ts");
  const active = Array.from({ length: 100 }, (_, index) => ({ id: `R${index}`, name: "", phone: "", zoneId: "Z001", status: "active" }));
  assert.equal(riders.riderCounts([], [], active).online, 0, "no request, no trip: nobody is invented");
  const { ridersOnlineRecords, ridersOnlineIn } = riders;
  const rows = ridersOnlineRecords({ items: [], staleAfterSeconds: 120, serverTime: "2026-10-30T10:00:00Z", ridersOnline: [{ zoneId: "Z001", count: 3 }, { zoneId: "Z002", count: 0 }, { zoneId: "FR-PC", count: 2 }], ridersOnlineWindowSeconds: 120 });
  assert.deepEqual(rows.map((row) => [row.zoneId, row.count]), [["Z001", 3], ["Z002", 0], ["FR-PC", 2]]);
  assert.equal(ridersOnlineIn(rows, ["Z001", "Z002"]), 3, "only the zones in view");
  assert.equal(ridersOnlineIn(rows, []), 5, "no zone picked: all the admin's zones");
  assert.equal(ridersOnlineIn([], ["Z001"]), null, "an older server without ridersOnline: no number, not a guess");
  assert.equal(riders.riderCounts([], [], active, 4).online, 4, "the server's number wins");
});

// Owner G3-D5 (2026-10-30, "Fix it", contract v0.18.4 LiveDriverList.zoneSupply): every online driver counts in his
// zone, also without a fresh position; the alert only when free drivers are short; alert and rows same numbers.
test("G3-D5: supply rows count every online driver in his zone and the shortage alert uses the same rows", async () => {
  const insights = await import("./insights.ts");
  const base = { name: "", zoneName: "", lat: 0, lng: 0, lastSeenMin: 0, vehicle: null, plate: null, route: null, progress: 0 };
  const drivers = [
    { ...base, id: "D1", zoneId: "Z001", state: "free" as const, tripId: null },
    { ...base, id: "D2", zoneId: "Z001", state: "stale" as const, tripId: null, lastSeenMin: 14 },
    { ...base, id: "D3", zoneId: "Z001", state: "trip" as const, tripId: "T9" },
  ];
  const waiting = (id: string, zoneId: string) => ({ tripId: id, zoneId, status: "searching" }) as never;
  const rows = insights.supplyDemand("SE", ["Z001"], [waiting("T1", "Z001"), waiting("T2", "Z001")], drivers);
  assert.deepEqual([rows[0].online, rows[0].free, rows[0].busy, rows[0].waiting, rows[0].level], [3, 2, 1, 2, "tight"], "the driver without a fresh fix is online and free in Z001");
  assert.deepEqual(insights.shortageZones(rows), [], "2 waiting, 2 free: tight, no shortage alert");

  // Live: the server's zoneSupply rows are the rows, the alert and the surge counts.
  const records = insights.zoneSupplyRecords({ items: [], staleAfterSeconds: 120, serverTime: "2026-10-30T10:00:00Z", zoneSupply: [
    { zoneId: "Z001", online: 4, free: 1, busy: 3, waiting: 3, level: "short", shortage: true },
    { zoneId: "Z002", online: 2, free: 2, busy: 0, waiting: 0, level: "ok", shortage: false },
  ] });
  const live = insights.serverSupply("SE", [], records);
  assert.deepEqual(live.map((row) => [row.zoneId, row.online, row.free, row.waiting, row.level]), [["Z001", 4, 1, 3, "short"], ["Z002", 2, 2, 0, "ok"]]);
  assert.deepEqual(insights.shortageZones(live).map((row) => [row.zoneId, row.waiting, row.free]), [["Z001", 3, 1]], "alert = the short rows, same numbers");
  assert.deepEqual(insights.serverSupply("SE", ["Z002"], records).map((row) => row.zoneId), ["Z002"], "only the zones in view");
  assert.deepEqual(insights.serverSupply("SE", [], insights.zoneSupplyRecords({ items: [] })), [], "older server: no rows, never a guess");
  assert.deepEqual(insights.activeBoosts([], live).map((row) => [row.zoneId, row.kind, row.detail]), [["Z001", "Surge suggested", "3 waiting · 1 free"]]);
});
