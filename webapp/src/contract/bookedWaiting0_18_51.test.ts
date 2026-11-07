/**
 * Contract 0.18.51 §73 (contract.json#bookedRide0_18_51), admin trip page: the waiting box shows when the free waiting
 * starts (texts.adminWaitFrom, the server's waiting.waitFrom), Mark no-show follows the server's waiting.noShowAt (S7 R4,
 * #255) and Reassign on a held booked ride says it goes back to the list (L6). No new admin setting (owner "Fixed rule").
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { tripRecord } from "../live/liveAdminApi.ts";
import type { Trip } from "../live/types.ts";
import { nextStatus } from "../domain/contract.ts";
import { noShowBlock, reassignHelp, reassignTarget } from "../trips/present.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const SEK = (amountMinor: number) => ({ amountMinor, currency: "SEK" });

/** Booked 08:00, the driver arrived late at 08:07: free 08:07–08:22, no-show from 08:12 (wait 5) — fixtures/booked_waiting.json. */
const LATE: Trip = {
  tripId: "T-WF", status: "arrived", version: 5, kind: "scheduled", createdAt: "2099-01-01T06:00:00Z", updatedAt: "2099-01-01T08:07:00Z", scheduledAt: "2099-01-01T08:00:00Z",
  riderId: "R1", driverId: "D1", zoneId: "Z001", categoryId: "economy", pickup: { lat: 59.33, lng: 18.06 }, dropoff: { lat: 59.34, lng: 18.07 }, stops: [], fare: SEK(20000), paymentMethod: "cash",
  terms: { currency: "SEK", freeWaitMin: 15, waitPerMin: SEK(500), noShowAfterMin: 5, noShowFee: SEK(6000), noShowDriverSharePct: 80, cancelRule: null, cancelDriverSharePct: 100, cancelAfterArrivedIsNoShow: true, maxPickupMoveMeters: 200 },
  waiting: { arrivedAt: "2099-01-01T08:07:00Z", waitFrom: "2099-01-01T08:07:00Z", freeUntil: "2099-01-01T08:22:00Z", noShowAt: "2099-01-01T08:12:00Z", chargedSeconds: 0 },
} as Trip;

test("texts.adminWaitFrom: « Free waiting from » is the contract's text in sv, fr and en", () => {
  const texts = C.bookedRide0_18_51.texts.adminWaitFrom;
  assert.equal((en as Record<string, string>)["Free waiting from"], texts.en);
  assert.equal((sv as Record<string, string>)["Free waiting from"], texts.sv);
  assert.equal((fr as Record<string, string>)["Free waiting from"], texts.fr);
});

test("the trip facts keep the server's waiting.waitFrom (a late driver: from his Arrived, not the pickup time); none without it", () => {
  const facts = tripRecord(LATE).liveTrip!;
  assert.equal(facts.waiting?.waitFrom, "2099-01-01T08:07:00Z");
  const { waitFrom: _drop, ...older } = LATE.waiting!;
  void _drop;
  assert.equal(tripRecord({ ...LATE, waiting: older }).liveTrip!.waiting?.waitFrom, null, "an older server: no row, nothing guessed");
});

test("#255 check: on the trip page's own inputs, Mark no-show opens only at the server's waiting.noShowAt", () => {
  const facts = tripRecord(LATE).liveTrip!;
  // TripPage.tsx passes exactly these: the trip kind, pickup time, terms.noShowAfterMin and waiting.noShowAt.
  const block = (hhmm: string) => noShowBlock("arrived", { kind: facts.kind, pickupAt: LATE.scheduledAt, noShowAfterMin: facts.terms?.noShowAfterMin, noShowAt: facts.waiting?.noShowAt }, Date.parse(`2099-01-01T${hhmm}:00Z`));
  assert.notEqual(block("08:05"), null, "pickup + 5 min is reached, but the driver came at 08:07");
  assert.notEqual(block("08:11"), null);
  assert.equal(block("08:12"), null);
});

test("L6: Reassign on a held booked ride follows the contract row (requested) and says it goes back to the list", () => {
  for (const status of ["offered", "accepted", "driver_to_pickup", "arrived"]) for (const kind of ["live", "scheduled"] as const) {
    assert.equal(reassignTarget(status, kind), nextStatus(status, "reassign", "admin", kind), `${status} ${kind}`);
  }
  assert.match(reassignHelp("accepted", "scheduled"), /back in the Scheduled rides list/);
});
