import assert from "node:assert/strict";
import test from "node:test";
import { raiseAmountMinor, reservationCall, reservationCurrency, type ServerReservation } from "./reservations.ts";
import { walletCreditMinor } from "./walletCredit.ts";

/**
 * BQ-A30b S2 (A30 supervisor): a booked ride with no fare and a zone the admin does not know has no known currency.
 * reservationCurrency returns null (it fell back to "SEK", so a TND trip went out in SEK and the server answered
 * 400 currency_mismatch), and the raise is refused, so Confirm stays disabled (LiveReservations.tsx: raiseAmountMinor null).
 * LiveWalletCredit (Rider › Movera wallet, live): extra decimals and "1e3" are refused, never rounded (parseMinor).
 */
const trip = (over: Partial<ServerReservation> = {}): ServerReservation => ({ tripId: "trp_1", status: "searching", version: 4, kind: "scheduled", zoneId: "Z001", categoryId: "economy", ...over });

test("A30b S2: no fare and an unknown zone gives no currency, not SEK", () => {
  const unknown = trip({ zoneId: "ZZ-unknown" });
  assert.equal(reservationCurrency(unknown), null);
  // SEK-style and TND-style amounts are both refused: Confirm stays disabled.
  assert.equal(raiseAmountMinor("5", unknown), null);
  assert.equal(raiseAmountMinor("12,50", unknown), null);
  assert.equal(raiseAmountMinor("5,250", unknown), null);
  assert.throws(() => reservationCall("raise", unknown, { amountMinor: 500 }));
});

test("A30b S2: the fare or the zone still decides (SEK 2 decimals, TND 3)", () => {
  assert.equal(reservationCurrency(trip({ fare: { amountMinor: 30_000, currency: "SEK" } })), "SEK");
  assert.equal(reservationCurrency(trip({ zoneId: "TN-TC" })), "TND");
  assert.equal(raiseAmountMinor("5", trip({ zoneId: "ZZ-unknown", fare: { amountMinor: 25_000, currency: "TND" } })), 5000);
  assert.equal(raiseAmountMinor("5", trip({ zoneId: "ZZ-unknown", fare: { amountMinor: 30_000, currency: "SEK" } })), 500);
});

test("A30b wallet SEK: whole amounts and 2 decimals are öre; extra decimals and 1e3 are refused", () => {
  assert.equal(walletCreditMinor("200", "SEK"), 20_000);
  assert.equal(walletCreditMinor("12,50", "SEK"), 1250);
  assert.equal(walletCreditMinor("12.505", "SEK"), null);
  assert.equal(walletCreditMinor("1e3", "SEK"), null);
  assert.equal(walletCreditMinor("0", "SEK"), null);
  assert.equal(walletCreditMinor("", "SEK"), null);
  assert.equal(walletCreditMinor("-5", "SEK"), null);
});

test("A30b wallet TND: 3 decimals are millimes; a 4th decimal and 1e3 are refused", () => {
  assert.equal(walletCreditMinor("12,500", "TND"), 12_500);
  assert.equal(walletCreditMinor("5", "TND"), 5000);
  assert.equal(walletCreditMinor("12.5001", "TND"), null);
  assert.equal(walletCreditMinor("1e3", "TND"), null);
});
