/**
 * Supervisor S7 (M1 + T1, 2026-11-07): a booked ride a driver holds for later (kind scheduled, accepted, pickup ahead)
 * is not a running trip: not in Trips › On the road, no ETA cell, not a live trip on the Live map, not counted as active.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { liveTabCounts } from "../dashboard/liveCounts.ts";
import { isHeldBookedRide, isLiveWithDriver } from "../live/tripLive.ts";
import { setLiveData } from "../live/realData.ts";
import { groupOf, listStats } from "./file.ts";
import { liveMarkers } from "./present.ts";

const held = { id: "T9", status: "accepted", driverId: "D1", zoneId: "Z001", name: "R", pickupAt: "2099-01-01T08:00:00Z", liveTrip: { kind: "scheduled", driverLocation: { lat: 59.3, lng: 18.0, measuredAt: "2026-11-07T10:00:00Z" }, pickup: { lat: 59.3, lng: 18.0 }, eta: null } } as never;
const started = { id: "T8", status: "driver_to_pickup", driverId: "D1", zoneId: "Z001", name: "R", pickupAt: "2099-01-01T08:00:00Z", liveTrip: { kind: "scheduled", driverLocation: { lat: 59.3, lng: 18.0, measuredAt: "2026-11-07T10:00:00Z" }, pickup: { lat: 59.3, lng: 18.0 }, eta: null } } as never;

test("T1 Trips groups: a held booked ride is not 'On the road'; a live accepted trip and a started booked ride are", () => {
  assert.notEqual(groupOf("accepted", "scheduled"), "live");
  assert.equal(groupOf("accepted", "live"), "live");
  assert.equal(groupOf("accepted"), "live");
  assert.equal(groupOf("driver_to_pickup", "scheduled"), "live");
  const stats = listStats([held, started]);
  assert.equal(stats.live, 1, "only the started booked ride is on the road");
});

test("T1 ETA cell: no live ETA row for a held booked ride", () => {
  assert.equal(isHeldBookedRide("accepted", "scheduled"), true);
  assert.equal(isLiveWithDriver("accepted", "D1", "scheduled"), false);
  assert.equal(isLiveWithDriver("accepted", "D1", "live"), true);
  assert.equal(isLiveWithDriver("driver_to_pickup", "D1", "scheduled"), true);
  assert.equal(isLiveWithDriver("accepted", "D1"), true, "kind unknown: unchanged");
});

test("M1 Live map: a held booked ride (pickup in 2099) is not drawn as a live trip and not counted with a driver", () => {
  setLiveData(true);
  try {
    const marks = liveMarkers([], [held, started]);
    assert.deepEqual(marks.filter((m) => m.kind === "trip").map((m) => m.id), ["T8"]);
  } finally {
    setLiveData(false);
  }
  assert.equal(liveTabCounts(0, [held, started]).withDriver, 1);
});

test("M1 Live map count and Trips page use the trip kind", () => {
  const live = readFileSync(new URL("../pages/LivePage.tsx", import.meta.url), "utf8");
  assert.match(live, /activeAll = \(trips\.data \?\? \[\]\)\.filter\(\(trip\) => isActiveOnRoad\(trip\)\)/);
  const trips = readFileSync(new URL("../pages/TripsPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(trips, /groupOf\(trip\.status\)/, "every groupOf call passes the trip kind");
  assert.match(trips, /isLiveWithDriver\(trip\.status, trip\.driverId, live\.kind\)/);
  const page = readFileSync(new URL("../pages/TripPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /isLiveWithDriver\(trip\.status, trip\.driverId\)/, "trip page ETA uses the kind");
});
