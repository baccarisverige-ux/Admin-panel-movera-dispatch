/**
 * Contract 0.18.81 sync (movera-contracts v0.18.81, B1.34; owner Q94 "A) Yes", answers 2026-11-13: default 3, range
 * 1-50, per country standard, a zone may override it like minAheadMin): Dispatch › Reservations › Booking gets the
 * setting "Open booked rides per rider, at most", published as DriverAppConfig.reservations.maxOpenPerRider and read
 * back from the server document. The server refuses the next booked ride with 409 booked_rides_limit
 * (contract.json#bookLater.riderCap). 0.18.79 (support tickets without a zone, wording only) lands in the same copy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";
import { appConfigState, driverAppConfig } from "../config/appConfigs.ts";
import { liveRules, publish } from "../dispatch/rules.ts";
import { BOOKING_LIMITS, BOOKING_WINDOW_DEFAULT, completeBookingWindow } from "../dispatch/rules/model.ts";
import { reservationOfDriverDoc } from "../live/dispatchDoc.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const NOW = "2026-11-13T10:00:00Z";
const EN = en as Record<string, string>;
const FR = fr as Record<string, string>;
const SV = sv as Record<string, string>;
const cap = (doc: Record<string, unknown>) => (doc["reservations"] as Record<string, unknown>)["maxOpenPerRider"];

test("the admin pins the contract it carries (0.18.85; B1.34 landed in 0.18.81)", () => {
  assert.equal(C.version, "0.18.85");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("B1.34: 'open booked rides per rider' defaults to the contract's 3, limits 1-50", () => {
  assert.equal(C.configDefaults.reservations.maxOpenPerRider, 3);
  assert.equal(BOOKING_WINDOW_DEFAULT.maxOpenPerRider, C.configDefaults.reservations.maxOpenPerRider);
  assert.deepEqual(BOOKING_LIMITS.maxOpenPerRider, { min: 1, max: 50 });
  assert.equal(completeBookingWindow({}).maxOpenPerRider, 3);
  assert.equal(completeBookingWindow({ maxOpenPerRider: 7 }).maxOpenPerRider, 7);
  for (const bad of [0, 51, "5", null]) assert.equal(completeBookingWindow({ maxOpenPerRider: bad }).maxOpenPerRider, 3, String(bad));
});

test("B1.34: published in DriverAppConfig.reservations for every zone; a zone's own value goes to that zone only", () => {
  const base = appConfigState({ now: NOW });
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) assert.equal(cap(driverAppConfig(zoneId, base)), 3, zoneId);
  const zone = liveRules(base.dispatch, "Z001");
  const next = { ...zone, reservation: { ...zone.reservation, booking: { ...zone.reservation.booking, maxOpenPerRider: 5 } } };
  const published = publish(base.dispatch, { Z001: next }, {}, ["Z001"], "nora", "2026-11-13T09:30:00.000Z", "");
  assert.ok(!published.error, published.error ?? "");
  assert.equal(cap(driverAppConfig("Z001", { ...base, dispatch: published.book })), 5);
  assert.equal(cap(driverAppConfig("FR-PC", { ...base, dispatch: published.book })), 3, "only that zone");
});

test("B1.34: the server's value comes back on reload; a bad one keeps the admin's", () => {
  const zone = liveRules(appConfigState({ now: NOW }).dispatch, "Z001");
  assert.equal(reservationOfDriverDoc({ maxOpenPerRider: 9 }, zone.reservation, zone).booking.maxOpenPerRider, 9);
  assert.equal(reservationOfDriverDoc({ maxOpenPerRider: 99 }, zone.reservation, zone).booking.maxOpenPerRider, 3);
});

test("B1.34: the setting's texts are in sv, fr and en", () => {
  for (const key of ["Open booked rides per rider", "Open booked rides per rider, at most", "Example: at 3, a rider with 3 booked rides that have not ended must cancel one before booking another. Live rides do not count."]) {
    assert.equal(EN[key], key, key);
    assert.ok(FR[key] && FR[key] !== key, `fr ${key}`);
    assert.ok(SV[key] && SV[key] !== key, `sv ${key}`);
  }
});
