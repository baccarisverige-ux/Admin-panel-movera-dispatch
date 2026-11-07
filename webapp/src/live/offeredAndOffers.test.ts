/**
 * Supervisor S7 (2026-11-07): M2 the Live map hid offered trips (and booked rides the server already searches for);
 * E1 the trip page's offers/status read (["assign-offers", id]) was not refreshed by trip.changed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { keyMatches } from "./adminEvents.ts";
import { setLiveData } from "./realData.ts";
import { isOpenRequest, liveMarkers } from "../trips/present.ts";

const NOW = Date.parse("2026-11-07T10:00:00Z");

test("M2: an offered trip and a booked ride the server is searching for are open requests on the Live map", () => {
  assert.equal(isOpenRequest({ status: "offered", pickupAt: undefined } as never, NOW), true, "offered trip disappears while offered");
  assert.equal(isOpenRequest({ status: "searching", pickupAt: "2099-01-01T08:00:00Z" } as never, NOW), true, "searching booked ride hidden");
  assert.equal(isOpenRequest({ status: "offered", pickupAt: "2099-01-01T08:00:00Z" } as never, NOW), true);
  assert.equal(isOpenRequest({ status: "requested", pickupAt: "2099-01-01T08:00:00Z" } as never, NOW), false, "a booking in Scheduled rides is not open yet");
  assert.equal(isOpenRequest({ status: "requested", pickupAt: undefined } as never, NOW), true);
  assert.equal(isOpenRequest({ status: "accepted", pickupAt: undefined } as never, NOW), false);
  setLiveData(true);
  try {
    const offered = { id: "T7", status: "offered", driverId: null, zoneId: "Z001", name: "R", liveTrip: { kind: "live", pickup: { lat: 59.3, lng: 18.0 }, driverLocation: null, eta: null } } as never;
    assert.deepEqual(liveMarkers([], [offered], NOW).filter((m) => m.kind === "request").map((m) => m.id), ["req-T7"]);
  } finally {
    setLiveData(false);
  }
});

test("E1: trip.changed refreshes the trip page's offers/status read", () => {
  assert.equal(keyMatches({ type: "trip.changed" }, ["assign-offers", "T1"]), true);
  assert.equal(keyMatches({ type: "driver.status" }, ["assign-offers", "T1"]), false);
});
