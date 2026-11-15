import assert from "node:assert/strict";
import test from "node:test";
import type { DemoRecord, LiveTripFacts } from "../api/seed.ts";
import { emptyReservationBook, raiseFare } from "./book.ts";
import { liveRaise, liveRaiseOpen, raiseMaxText } from "./liveRaise.ts";

/**
 * BQ-A30 (A26 supervisor S2): when /reservations/:id is reached on live, "Raise the fare" posts to the server
 * (POST /admin/trips/{id}/driver-bonus, the same call as live/LiveReservations.tsx: reservationCall "raise") instead of
 * saving the demo book, and "The raise can be at most {max}" shows the amount with the currency's decimals
 * (SEK 2, TND 3). The demo keeps its own book and its own text.
 */

const t0 = "2026-11-14T10:00:00.000Z";
const facts = (currency: string, fare: number): LiveTripFacts => ({ kind: "scheduled", categoryId: "economy", paymentMethod: "card", paymentStatus: null, currency, fare, fareLines: [], commission: null, driverEarnings: null, pickupPay: null, driverBonus: null, walletApplied: null, cashToCollect: null } as unknown as LiveTripFacts);
// A live record: id = the server's tripId; tripId holds the rider id (liveAdminApi tripRecord), so it must not be used.
const booked = (zoneId: string, currency: string, over: Partial<DemoRecord> = {}): DemoRecord => ({ id: "trip_1", tripId: "rider_9", name: "Rider", phone: "", zoneId, status: "searching", driverId: null, version: 7, pickupAt: "2026-11-15T10:00:00.000Z", live: true, liveTrip: facts(currency, currency === "TND" ? 25_000 : 30_000), ...over } as DemoRecord);

test("A30 SEK: the live raise posts to driver-bonus with the trip's id, version and öre", () => {
  const out = liveRaise(emptyReservationBook(), booked("Z001", "SEK"), "12,50", 500, "admin_1", t0);
  assert.equal(out.error, undefined);
  assert.deepEqual(out.call, { path: "/admin/trips/trip_1/driver-bonus", body: { expectedVersion: 7, amount: { amountMinor: 1250, currency: "SEK" } } });
});

test("A30 TND: the live raise sends millimes (3 decimals), never × 100", () => {
  const out = liveRaise(emptyReservationBook(), booked("Z100", "TND"), "5.250", 500, "admin_1", t0);
  assert.equal(out.error, undefined);
  assert.deepEqual(out.call, { path: "/admin/trips/trip_1/driver-bonus", body: { expectedVersion: 7, amount: { amountMinor: 5250, currency: "TND" } } });
  // More decimals than the currency has is refused, never rounded.
  assert.ok(liveRaise(emptyReservationBook(), booked("Z100", "TND"), "5.2501", 500, "admin_1", t0).error);
});

test("A30 SEK: over the highest raise the error shows 2 decimals", () => {
  assert.equal(raiseMaxText(500, "SE"), "500,00 kr");
  const out = liveRaise(emptyReservationBook(), booked("Z001", "SEK"), "600", 500, "admin_1", t0);
  assert.equal(out.call, undefined);
  assert.equal(out.error, "The raise can be at most 500,00 kr.");
  assert.equal(raiseFare(emptyReservationBook(), booked("Z001", "SEK"), 600, 500, "admin_1", t0, raiseMaxText(500, "SE")).error, "The raise can be at most 500,00 kr.");
});

test("A30 TND: over the highest raise the error shows 3 decimals", () => {
  assert.equal(raiseMaxText(20.5, "TN"), "20.500 DT");
  const out = liveRaise(emptyReservationBook(), booked("Z100", "TND"), "21", 20.5, "admin_1", t0);
  assert.equal(out.call, undefined);
  assert.equal(out.error, "The raise can be at most 20.500 DT.");
  assert.equal(raiseFare(emptyReservationBook(), booked("Z100", "TND"), 21, 20.5, "admin_1", t0, raiseMaxText(20.5, "TN")).error, "The raise can be at most 20.500 DT.");
});

test("A30: zero, empty or a ride with a driver posts nothing", () => {
  assert.equal(liveRaise(emptyReservationBook(), booked("Z001", "SEK"), "0", 500, "admin_1", t0).call, undefined);
  assert.equal(liveRaise(emptyReservationBook(), booked("Z001", "SEK"), "", 500, "admin_1", t0).call, undefined);
  assert.equal(liveRaise(emptyReservationBook(), booked("Z001", "SEK", { driverId: "D1", status: "accepted" }), "10", 500, "admin_1", t0).call, undefined);
});

test("A30: the live box opens for the server's no-driver statuses only (the same as LiveReservations)", () => {
  for (const status of ["requested", "searching", "offered"]) assert.equal(liveRaiseOpen(booked("Z001", "SEK", { status })), true, status);
  for (const status of ["accepted", "in_trip", "completed", "cancelled_by_admin"]) assert.equal(liveRaiseOpen(booked("Z001", "SEK", { status, driverId: status === "accepted" ? "D1" : null })), false, status);
});

test("A30 demo: no max text gives the same words, with the currency's decimals (BQ-O15 item 3)", () => {
  const record = { id: "B021", name: "Rider", phone: "", zoneId: "Z001", status: "waiting", driverId: null } as unknown as DemoRecord;
  assert.equal(raiseFare(emptyReservationBook(), record, 600, 500, "daniel", t0).error, "The raise can be at most 500,00 kr.");
});
