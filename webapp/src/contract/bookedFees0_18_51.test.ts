/**
 * Contract 0.18.51 §73 "Booked fees" (contract.json#bookedRide0_18_51.fees), admin trip page: for a booked ride a rider
 * cancel after the driver arrived is the booking fee (feeKind cancel), never the no-show fee, whatever the zone's
 * cancelAfterArrivedIsNoShow says (server src/trips/ride/cancel.ts: `trip.kind !== "scheduled" && … cancelAfterArrivedIsNoShow`).
 * The server still sends terms.cancelAfterArrivedIsNoShow (the zone's switch) on a booked ride, so the admin must not
 * read it there. The fee amounts on the page are the server's (waiting.noShowFee, terms.noShowFee, cancellation.fee).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { tripRecord } from "../live/liveAdminApi.ts";
import { feeKindOf } from "../live/tripLive.ts";
import type { Trip } from "../live/types.ts";
import { cancelAfterArrivedText } from "../trips/present.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const KEY = C.bookedRide0_18_51.texts.cancelAfterArrived.en as string;
const SEK = (amountMinor: number) => ({ amountMinor, currency: "SEK" });

test("a booked ride: « Cancel after the driver arrived » is the contract's booked-ride text, not « counts as a no-show »", () => {
  assert.equal(cancelAfterArrivedText("scheduled", true), KEY);
  assert.equal(cancelAfterArrivedText("scheduled", false), KEY);
  assert.equal(cancelAfterArrivedText("live", true), "counts as a no-show", "live rides keep the zone's switch");
  assert.equal(cancelAfterArrivedText("live", false), "normal cancel fee");
});

test("texts.cancelAfterArrived is the contract's exact text in sv, fr and en", () => {
  const texts = C.bookedRide0_18_51.texts.cancelAfterArrived;
  assert.equal((en as Record<string, string>)[KEY], texts.en);
  assert.equal((sv as Record<string, string>)[KEY], texts.sv);
  assert.equal((fr as Record<string, string>)[KEY], texts.fr);
});

/** fixtures/booked_waiting.json#fees: booked-cancel-arrived-after-free-wait-booking-fee and booked-no-show-booking-fee: booking fee 50 kr (not the 65 kr no-show fee); driver share 80 % = 40 kr. */
const BOOKED = (over: Partial<Trip>): Trip => ({
  tripId: "T-BF", status: "arrived", version: 5, kind: "scheduled", createdAt: "2099-01-01T06:00:00Z", updatedAt: "2099-01-01T08:10:00Z", scheduledAt: "2099-01-01T08:00:00Z",
  riderId: "R1", driverId: "D1", zoneId: "Z001", categoryId: "economy", pickup: { lat: 59.33, lng: 18.06 }, dropoff: { lat: 59.34, lng: 18.07 }, stops: [], fare: SEK(40000), paymentMethod: "cash",
  terms: { currency: "SEK", freeWaitMin: 15, waitPerMin: SEK(500), noShowAfterMin: 15, noShowFee: SEK(5000), noShowDriverSharePct: 80, cancelRule: { freeMin: 60, fee: SEK(5000) }, cancelDriverSharePct: 100, cancelAfterArrivedIsNoShow: true, maxPickupMoveMeters: 200 },
  waiting: { arrivedAt: "2099-01-01T07:50:00Z", waitFrom: "2099-01-01T08:00:00Z", freeUntil: "2099-01-01T08:15:00Z", noShowAt: "2099-01-01T08:15:00Z", chargedSeconds: 0, noShowFee: SEK(5000), noShowDriverShare: SEK(4000) },
  ...over,
} as Trip);

test("the admin shows the server's booked fees: no-show = booking fee (feeKind no_show, 80 %), rider cancel after arrival = booking fee (feeKind cancel)", () => {
  const arrived = tripRecord(BOOKED({})).liveTrip!;
  assert.deepEqual([arrived.waiting?.noShowFeeMinor, arrived.waiting?.noShowDriverShareMinor, arrived.terms?.noShowFeeMinor, arrived.terms?.noShowDriverSharePct], [5000, 4000, 5000, 80]);
  const noShow = tripRecord(BOOKED({ status: "no_show", cancellation: { actor: "driver", reasonCode: "rider_no_show", at: "2099-01-01T08:16:00Z", fee: SEK(5000), feeStatus: "owed", feeKind: "no_show", driverShare: SEK(4000) } })).liveTrip!;
  assert.equal(feeKindOf(noShow.cancellation), "no_show");
  assert.deepEqual([noShow.cancellation?.feeMinor, noShow.cancellation?.driverShareMinor], [5000, 4000]);
  const cancel = tripRecord(BOOKED({ status: "cancelled_by_rider", cancellation: { actor: "rider", reasonCode: "plans_changed", at: "2099-01-01T08:20:00Z", fee: SEK(5000), feeStatus: "owed", feeKind: "cancel", driverShare: SEK(5000) } })).liveTrip!;
  assert.equal(feeKindOf(cancel.cancellation), "cancel");
  assert.deepEqual([cancel.cancellation?.feeMinor, cancel.cancellation?.driverShareMinor], [5000, 5000]);
});
