import assert from "node:assert/strict";
import test from "node:test";
import { tripRecord, driverRecord } from "./liveAdminApi.ts";
import { remember, setLiveData } from "./realData.ts";
import { isOnline } from "../api/presence.ts";
import { cashFigures, isCashTrip } from "../trips/cash.ts";
import { callsOf, chatOf, moneySplit, offersOf, routeOf } from "../trips/file.ts";
import { categoryOf, fareBreakdown, liveMarkers, pinVerified, ratingLabel, riderIdFor, startedAt, stopsOf, timelineOf } from "../trips/present.ts";
import { formatMoney } from "../domain/money.ts";
import type { Driver, Trip } from "./types.ts";

const SEK = (amountMinor: number) => ({ amountMinor, currency: "SEK" });
const TRIP: Trip = {
  tripId: "trp_7", status: "completed", version: 2, kind: "live", createdAt: "2026-10-25T08:00:00Z", updatedAt: "2026-10-25T08:40:00Z", acceptedAt: "2026-10-25T08:02:00Z",
  riderId: "rdr_7", driverId: "drv_7", zoneId: "Z001", categoryId: "xl",
  pickup: { address: "Sergels torg 1", lat: 59.332, lng: 18.064 }, dropoff: { lat: 59.65, lng: 17.92 }, stops: [],
  fare: SEK(30000), fareLines: [{ code: "base", amount: SEK(5000) }, { code: "distance", amount: SEK(25000) }], driverEarnings: SEK(24000), commission: SEK(6000),
  paymentMethod: "cash", paymentStatus: "captured", ratingStatus: "none",
};

test("live: a trip page reads only server facts (places, times, category, fare lines, money)", () => {
  setLiveData(true);
  const trip = tripRecord(TRIP);
  remember([trip]);
  assert.equal(categoryOf("trp_7").id, "xl");
  assert.equal(startedAt("trp_7"), "2026-10-25T08:00:00Z");
  assert.equal(riderIdFor(trip), "rdr_7");
  assert.deepEqual(stopsOf(trip).map((stop) => stop.label), ["Sergels torg 1", "59.65000, 17.92000"]);
  assert.deepEqual(timelineOf(trip).map((step) => [step.code, step.at]), [["requested", "2026-10-25T08:00:00Z"], ["accepted", "2026-10-25T08:02:00Z"], ["completed", "2026-10-25T08:40:00Z"]]);
  const fare = fareBreakdown(trip);
  assert.equal(fare.live, true);
  assert.equal(fare.chargedOre, 30000);
  assert.deepEqual(fare.lines.map((line) => line.code), ["base", "distance"]);
  const route = routeOf(trip);
  assert.equal(route.stops.length, 2);
  assert.ok(Number.isNaN(route.km) && Number.isNaN(route.minutes), "distance and minutes are not on the trip");
  const split = moneySplit(trip, null, true, []);
  assert.deepEqual([split.price, split.commission, split.driverGets, split.moveraKeeps], [30000, 6000, 24000, 6000]);
  assert.ok(Number.isNaN(split.tip) && Number.isNaN(split.promo) && Number.isNaN(split.fleet), "no invented tip, promotion or fleet share");
  assert.equal(isCashTrip(trip, "SE"), true);
  assert.deepEqual(cashFigures(split), { collected: 30000, owed: 6000, driverKeeps: 24000 });
  assert.equal(chatOf(trip), null);
  assert.equal(callsOf(trip), null);
  assert.deepEqual(offersOf(trip, ["drv_1", "drv_2"]), []);
  assert.equal(pinVerified("trp_7"), "Not connected yet");
  assert.equal(ratingLabel(trip), "Not rated yet");
  assert.equal(formatMoney({ amountMinor: Number.NaN, currency: "SEK" }), "Not connected yet");
  setLiveData(false);
});

test("live: online means the server's onlineStatus; the map shows only server positions", () => {
  setLiveData(true);
  const base = { accountStatus: "active", firstName: "Al", zoneIds: ["Z001"], categoryIds: [], documents: [], version: 1 } as unknown as Driver;
  const online = driverRecord({ ...base, driverId: "drv_a", onlineStatus: "online", location: { lat: 59.33, lng: 18.06, measuredAt: "2026-10-26T09:00:00Z" } });
  const offline = driverRecord({ ...base, driverId: "drv_b", onlineStatus: "offline" });
  assert.equal(isOnline(online), true);
  assert.equal(isOnline(offline), false);
  assert.equal(isOnline({ id: "D0001", status: "active" }), false, "no hash in live");
  const marks = liveMarkers([online, offline], [tripRecord({ ...TRIP, status: "in_trip" })]);
  assert.deepEqual(marks.map((mark) => [mark.id, mark.lat, mark.lng]), [["drv_a", 59.33, 18.06]]);
  setLiveData(false);
  assert.equal(typeof isOnline({ id: "D0001", status: "active" }), "boolean");
});

test("live: every listed demo source answers with server facts or Not connected, never a seed", async () => {
  const care = await import("../riders/care.ts");
  assert.equal("driverReports" in care, false, "driver reports on riders are removed (owner, part 3)");
  assert.equal("blockedByDrivers" in care, false, "blocked by drivers is removed (owner, part 3)");
  const { offerLogFromServer } = await import("../trips/offerLog.ts");
  const { signalsOf } = await import("../safety/risk.ts");
  const { reviewsOf, emptyReviewOps } = await import("../growth/reviews.ts");
  const { earningsReport } = await import("../dashboard/earnings.ts");
  const { airportQueues, cancellations, ratings } = await import("../dashboard/insights.ts");
  const { firstSeen, rulePreview } = await import("../alerts/engine.ts");
  const { zoneResults, cancelRecords } = await import("../dispatch/demo.ts");
  const { failureCause, failureHandled } = await import("../payments/failures.ts");
  const { paySplit } = await import("../payments/desk.ts");
  const { riderBookings, riderProfile } = await import("../riders/profile.ts");
  const { periodWindow } = await import("../dashboard/period.ts");
  setLiveData(true);
  const trip = tripRecord(TRIP);
  remember([trip]);
  const log = offerLogFromServer([{ offerId: "o1", tripId: "trp_7", driverId: "drv_1", driverName: "Anna", kind: "assigned", status: "declined", source: "admin", version: 2, sentAt: "", expiresAt: "2026-10-25T08:00:30Z", currency: "SEK", fareMinor: 30000, driverEarningsMinor: 24000, driverBonusMinor: 0, priority: false, by: "" }]);
  assert.deepEqual(log.map((step) => [step.kind, step.at, step.detail]), [["exclusive", "2026-10-25T08:00:30Z", "Anna · Declined"]]);
  assert.deepEqual(signalsOf({ id: "D0001", name: "x", phone: "", zoneId: "Z001", status: "active" }, "driver"), {});
  assert.deepEqual(reviewsOf([trip], [], emptyReviewOps(), Date.now()), []);
  const report = earningsReport("SE", ["Z001"], periodWindow({ kind: "today" }, Date.now(), "Europe/Stockholm", "en"));
  assert.ok(Number.isNaN(report.totals.trips) && Number.isNaN(report.totals.commissionMinor) && report.series.length === 0, "no modelled earnings");
  assert.equal(airportQueues("SE", [], 1), null);
  assert.equal(cancellations(report.totals), null);
  assert.equal(ratings(report.totals, "x"), null);
  assert.equal(rulePreview({ metric: "free_drivers", op: "below", value: 3, forMin: 10, zoneId: "Z001" }, { zones: [] } as never), null);
  assert.equal(firstSeen("a1", 1000), 1000);
  assert.equal(firstSeen("a1", 5000), 1000, "an alert keeps the time it was first seen");
  assert.equal(zoneResults("Z001", {} as never), null);
  assert.deepEqual(cancelRecords("SE", [{ id: "Z001", name: "N", center: [59, 18] }], [], Date.now()), []);
  assert.deepEqual(failureCause({ id: "PAY1" }), { kind: "rider", reason: "Not connected yet" });
  assert.equal(failureHandled({ id: "PAY1" }), false);
  const split = paySplit(30000, "SE", "trp_7");
  assert.deepEqual([split.commission, split.driver], [6000, 24000]);
  assert.ok(Number.isNaN(split.vat));
  const rider = { id: "rdr_7", name: "Ida", phone: "", zoneId: "", status: "active" };
  const bookings = riderBookings(rider, Date.now());
  assert.deepEqual(bookings.map((booking) => [booking.id, booking.status, booking.fareMinor, booking.payment]), [["trp_7", "completed", 30000, "cash"]]);
  const profile = riderProfile(rider, bookings, Date.now());
  assert.ok(Number.isNaN(profile.completed) && Number.isNaN(profile.joinedAt) && Number.isNaN(profile.score));
  assert.deepEqual([profile.fraudFlags, profile.devices, profile.trustedContacts], [[], [], []]);
  setLiveData(false);
});

test("live KPIs: a total only when every zone-day is there; tips, refunds and wait stay Not connected", async () => {
  const { daysOf, totalsOf, kpiReport } = await import("./kpis.ts");
  const { liveReviewsOf } = await import("../growth/reviews.ts");
  const { ratingRecord, ticketRecord } = await import("./liveAdminApi.ts");
  const { ratingTagLabel, RATING_TAGS } = await import("./ratingTags.ts");
  const { payoutLineLabel } = await import("./LivePayouts.tsx").catch(() => ({ payoutLineLabel: (code: string) => code }));
  const day = (date: string, zoneId: string, gross: number) => ({ date, zoneId, source: "summary" as const, currency: "SEK", completedTrips: 2, cancelledTrips: 1, noShows: 1, gross, commission: gross / 5, driverEarnings: gross - gross / 5, pickupPay: 0, driverBonus: 100, cashCollected: 0, walletApplied: 0, newRiders: 1, newDrivers: 0 });
  const tz = "Europe/Stockholm";
  assert.deepEqual(daysOf(Date.parse("2026-10-25T23:00:00Z"), Date.parse("2026-10-27T23:00:00Z"), tz), ["2026-10-26", "2026-10-27"]);
  const both = totalsOf([day("2026-10-26", "Z001", 1000), day("2026-10-26", "Z002", 500)], ["Z001", "Z002"], ["2026-10-26"]);
  assert.deepEqual([both.trips, both.cancelled, both.grossMinor, both.commissionMinor, both.driverMinor, both.newRiders], [4, 4, 1500, 300, 1400, 2]);
  assert.ok(Number.isNaN(both.tipsMinor) && Number.isNaN(both.refundsMinor) && Number.isNaN(both.waitMinTotal));
  const gap = totalsOf([day("2026-10-26", "Z001", 1000)], ["Z001", "Z002"], ["2026-10-26"]);
  assert.ok(Number.isNaN(gap.grossMinor), "a missing zone-day makes the total Not connected, not smaller");
  const report = kpiReport([day("2026-10-26", "Z001", 1000)], ["Z001"], { start: Date.parse("2026-10-25T23:00:00Z"), end: Date.parse("2026-10-26T21:00:00Z"), spanEnd: 0, prevStart: Date.parse("2026-10-24T22:00:00Z"), prevEnd: Date.parse("2026-10-25T23:00:00Z"), bucket: "hour", label: "", compareLabel: "" } as never, tz, "en");
  assert.equal(report.totals.grossMinor, 1000);
  assert.ok(Number.isNaN(report.previous.grossMinor));
  assert.deepEqual(report.byZone.map((row) => [row.id, row.minor]), [["Z001", 1000]]);
  const reviews = liveReviewsOf([ratingRecord({ tripId: "T1", from: "rider", stars: 2, tags: ["clean_car"], comment: "Late", at: "2026-10-25T08:00:00Z", riderId: "R1", riderName: "Ida", driverId: "D1", driverName: "Anna", zoneId: "Z001", hidden: true })]);
  assert.deepEqual(reviews.map((row) => [row.id, row.byName, row.aboutName, row.stars, row.text, row.hidden]), [["T1~rider", "Ida", "Anna", 2, "Late", true]]);
  assert.equal(ticketRecord({ ticketId: "K1", openedBy: "rider", category: "help", subject: "Hi", status: "open", createdAt: "2026-10-25T08:00:00Z", updatedAt: "2026-10-25T08:00:00Z" }).status, "open");
  assert.deepEqual([...RATING_TAGS.aboutDriver, ...RATING_TAGS.aboutRider].map(ratingTagLabel), ["Clean car", "Friendly", "Safe driving", "Good music", "Knew the way", "On time", "Polite", "Clear pickup"]);
  assert.equal(typeof payoutLineLabel, "function");
});

test("live Reports › Money (contract v0.10.3): per currency apart, net = Movera earnings − refunds, a missing day is Not connected", async () => {
  const { moneyGroups, totalsOf } = await import("./kpis.ts");
  const day = (date: string, zoneId: string, currency: string, gross: number, extra: Record<string, number> = { tips: 200, refunds: 100, fees: 400, moveraEarnings: 2500 }) => ({ date, zoneId, source: "summary" as const, currency, completedTrips: 2, cancelledTrips: 0, noShows: 0, gross, commission: 2000, driverEarnings: 8000, pickupPay: 500, driverBonus: 0, cashCollected: 0, walletApplied: 0, newRiders: 0, newDrivers: 0, ...extra });
  const dates = ["2026-10-26", "2026-10-27"];
  const groups = moneyGroups([day("2026-10-26", "Z001", "SEK", 10000), day("2026-10-27", "Z001", "SEK", 10000), day("2026-10-26", "FR-PC", "EUR", 3000), day("2026-10-27", "FR-PC", "EUR", 3000, { tips: 0, refunds: 0, fees: 0, moveraEarnings: -100 })], dates);
  assert.deepEqual(groups.map((g) => [g.currency, g.missing, g.total.bookings, g.total.moveraEarnings, g.total.driverEarnings, g.total.tips, g.total.refunds, g.total.net]), [["EUR", false, 6000, 2400, 17000, 200, 100, 2300], ["SEK", false, 20000, 5000, 17000, 400, 200, 4800]]);
  const gap = moneyGroups([day("2026-10-26", "Z001", "SEK", 10000)], dates)[0]!;
  assert.ok(gap.missing && Number.isNaN(gap.total.bookings) && Number.isNaN(gap.days[1]!.bookings));
  assert.equal(gap.days[0]!.bookings, 10000);
  const old = moneyGroups([day("2026-10-26", "Z001", "SEK", 10000, {})], ["2026-10-26"])[0]!;
  assert.ok(Number.isNaN(old.total.tips) && Number.isNaN(old.total.net) && old.total.bookings === 10000, "an older server without the money lines: Not connected, never 0");
  const totals = totalsOf([day("2026-10-26", "Z001", "SEK", 10000)], ["Z001"], ["2026-10-26"]);
  assert.deepEqual([totals.tipsMinor, totals.refundsMinor, totals.netMinor], [200, 100, 2400]);
});

test("G2 R10: no Not connected yet badge on the live driver, onboarding, fleet owner and vehicle pages", async () => {
  const { connectionOf } = await import("./connection.ts");
  for (const id of ["drivers", "onboarding", "fleets", "vehicles"]) assert.equal(connectionOf(id).state, "connected", id);
  assert.equal(connectionOf("reports").state, "partly");
});
