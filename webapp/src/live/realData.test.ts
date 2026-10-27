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
