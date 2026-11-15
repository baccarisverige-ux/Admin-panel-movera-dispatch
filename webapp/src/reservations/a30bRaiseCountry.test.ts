import assert from "node:assert/strict";
import test from "node:test";
import type { DemoRecord, LiveTripFacts } from "../api/seed.ts";
import { emptyReservationBook } from "./book.ts";
import { liveRaise, raiseCountry } from "./liveRaise.ts";

/**
 * BQ-A30b S1 (A30 supervisor): on live, /reservations/:id takes its country (limit, units, money text) from the trip's
 * currency, not from its zone with a Sweden fallback. A TND trip in a zone the admin does not know was checked as öre
 * (50 DT read as 500) and the error read "500,00 kr". The amount sent was already right.
 */
const t0 = "2026-11-14T10:00:00.000Z";
const facts = (currency: string, fare: number): LiveTripFacts => ({ kind: "scheduled", categoryId: "economy", paymentMethod: "card", paymentStatus: null, currency, fare, fareLines: [], commission: null, driverEarnings: null, pickupPay: null, driverBonus: null, walletApplied: null, cashToCollect: null } as unknown as LiveTripFacts);
const booked = (zoneId: string, currency: string, over: Partial<DemoRecord> = {}): DemoRecord => ({ id: "trip_1", tripId: "rider_9", name: "Rider", phone: "", zoneId, status: "searching", driverId: null, version: 7, pickupAt: "2026-11-15T10:00:00.000Z", live: true, liveTrip: facts(currency, currency === "TND" ? 25_000 : 30_000), ...over } as DemoRecord);

test("A30b S1 TND: an unknown zone still gives Tunisia on live (the trip's currency), not Sweden", () => {
  assert.equal(raiseCountry(booked("Z999", "TND"), true), "TN");
  assert.equal(raiseCountry(booked("Z001", "TND"), true), "TN");
  // Demo keeps the zone rule.
  assert.equal(raiseCountry(booked("Z999", "TND"), false), "SE");
});

test("A30b S1 SEK: a SEK trip gives Sweden on live, even in a Tunis zone", () => {
  assert.equal(raiseCountry(booked("Z999", "SEK"), true), "SE");
  assert.equal(raiseCountry(booked("TN-TC", "SEK"), true), "SE");
});

test("A30b S1 TND: the limit check uses millimes (×1000) and the text says DT", () => {
  // 10 DT under a 20.5 DT limit: allowed, 10000 millimes sent (was refused: 10000 / 100 = 100 > 20.5).
  const ok = liveRaise(emptyReservationBook(), booked("Z999", "TND"), "10", 20.5, "admin_1", t0);
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.call?.body.amount, { amountMinor: 10_000, currency: "TND" });
  const over = liveRaise(emptyReservationBook(), booked("Z999", "TND"), "21", 20.5, "admin_1", t0);
  assert.equal(over.call, undefined);
  assert.equal(over.error, "The raise can be at most 20.500 DT.");
});

test("A30b S1 SEK: the limit check uses öre (×100) and the text says kr, even in a Tunis zone", () => {
  const ok = liveRaise(emptyReservationBook(), booked("TN-TC", "SEK"), "12,50", 500, "admin_1", t0);
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.call?.body.amount, { amountMinor: 1250, currency: "SEK" });
  const over = liveRaise(emptyReservationBook(), booked("TN-TC", "SEK"), "600", 500, "admin_1", t0);
  assert.equal(over.error, "The raise can be at most 500,00 kr.");
});

test("A30b S2: no currency anywhere (no trip currency, unknown zone) is refused, never sent as SEK", () => {
  const record = booked("Z999", "SEK", { liveTrip: undefined });
  const out = liveRaise(emptyReservationBook(), record, "5", 500, "admin_1", t0);
  assert.equal(out.call, undefined);
  assert.ok(out.error);
});
