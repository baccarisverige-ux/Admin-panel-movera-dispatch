import assert from "node:assert/strict";
import test from "node:test";
import { raiseAmountMinor, reservationCall, type ServerReservation } from "./reservations.ts";

/**
 * BQ-A30 follow-up (money, reachable on live: Admin › Reservations "Raise the driver's fare"): the typed amount goes to
 * minor units with the trip currency's own decimals (SEK öre ×100, TND millimes ×1000), never × 100 for every currency.
 * More decimals than the currency has is refused, never rounded.
 */
const trip = (over: Partial<ServerReservation> = {}): ServerReservation => ({ tripId: "trp_1", status: "searching", version: 4, kind: "scheduled", zoneId: "Z001", categoryId: "economy", ...over });
const tnd = trip({ zoneId: "TN-TC", fare: { amountMinor: 25_000, currency: "TND" } });
const sek = trip({ fare: { amountMinor: 30_000, currency: "SEK" } });

test("A30 TND: a raise of 5 DT sends 5000 millimes", () => {
  assert.equal(raiseAmountMinor("5", tnd), 5000);
  assert.equal(raiseAmountMinor("5,250", tnd), 5250);
  const call = reservationCall("raise", tnd, { amountMinor: raiseAmountMinor("5", tnd) ?? 0 });
  assert.deepEqual(call.body.amount, { amountMinor: 5000, currency: "TND" });
  // No fare on the row: the zone's currency decides (Tunis → TND).
  assert.equal(raiseAmountMinor("5", trip({ zoneId: "TN-TC" })), 5000);
});

test("A30 SEK: a raise of 5 kr sends 500 öre", () => {
  assert.equal(raiseAmountMinor("5", sek), 500);
  assert.equal(raiseAmountMinor("12,50", sek), 1250);
  assert.deepEqual(reservationCall("raise", sek, { amountMinor: raiseAmountMinor("5", sek) ?? 0 }).body.amount, { amountMinor: 500, currency: "SEK" });
});

test("A30: extra decimals, zero or text are refused, never rounded", () => {
  assert.equal(raiseAmountMinor("5.2501", tnd), null);
  assert.equal(raiseAmountMinor("5.255", sek), null);
  assert.equal(raiseAmountMinor("0", sek), null);
  assert.equal(raiseAmountMinor("", sek), null);
  assert.equal(raiseAmountMinor("abc", tnd), null);
});
