import { test } from "node:test";
import assert from "node:assert/strict";
import { inView, needsAttention, reservationActions, reservationCall, reservationState, RESERVATIONS_PATH, sortReservations, type ServerReservation } from "./reservations.ts";

// v0.18.17 Book later (owner 2026-11-03): Admin › Reservations reads the server (before: a browser-only book, empty on
// live) and its buttons call the server's commands.
const trip = (over: Partial<ServerReservation> = {}): ServerReservation => ({ tripId: "trp_1", status: "requested", version: 4, kind: "scheduled", zoneId: "Z001", categoryId: "economy", scheduledAt: "2026-11-05T08:00:00Z", reservation: { mode: "list", dispatchAt: "2026-11-05T07:40:00Z", freeChangeUntil: "2026-11-05T07:00:00Z", noDriver: false }, ...over });

test("the list reads the server's booked rides", () => {
  assert.equal(RESERVATIONS_PATH, "/admin/trips?kind=scheduled&limit=200");
});

test("state words and buttons follow the server status", () => {
  assert.equal(reservationState(trip()), "In Scheduled rides");
  assert.deepEqual(reservationActions(trip()), ["dispatchNow", "assign", "offer", "raise", "contact", "cancel", "open"]);
  assert.equal(reservationState(trip({ status: "accepted" })), "Driver holds it");
  assert.deepEqual(reservationActions(trip({ status: "accepted" })), ["unassign", "noShow", "contact", "cancel", "open"]);
  assert.deepEqual(reservationActions(trip({ status: "searching" })), ["assign", "offer", "raise", "contact", "cancel", "open"]);
  assert.deepEqual(reservationActions(trip({ status: "cancelled_by_rider" })), ["open"]);
  assert.equal(reservationState(trip({ status: "expired" })), "No driver found");
});

test("needs attention = the server's no-driver flag while nobody has it (owner Q3)", () => {
  assert.equal(needsAttention(trip({ status: "searching", reservation: { ...trip().reservation!, noDriver: true } })), true);
  assert.equal(needsAttention(trip({ status: "accepted", reservation: { ...trip().reservation!, noDriver: true } })), false);
  assert.equal(inView(trip({ status: "searching", reservation: { ...trip().reservation!, noDriver: true } }), "warning"), true);
  assert.equal(inView(trip({ status: "accepted" }), "assigned"), true);
  assert.equal(inView(trip({ status: "expired" }), "cancelled"), true);
});

test("each button is the server's call, with the version and the admin's reason", () => {
  assert.deepEqual(reservationCall("dispatchNow", trip()), { path: "/admin/trips/trp_1/reservation/dispatch-now", body: { expectedVersion: 4 } });
  assert.deepEqual(reservationCall("unassign", trip({ status: "accepted" }), { reason: " Driver ill " }), { path: "/admin/trips/trp_1/reservation/unassign", body: { expectedVersion: 4, reason: "Driver ill" } });
  assert.throws(() => reservationCall("unassign", trip(), {}), /why/);
  assert.deepEqual(reservationCall("assign", trip(), { driverId: "drv_9" }), { path: "/admin/trips/trp_1/assign", body: { expectedVersion: 4, driverId: "drv_9" } });
  assert.deepEqual(reservationCall("cancel", trip(), { reason: "Rider asked" }), { path: "/admin/trips/trp_1/cancel", body: { expectedVersion: 4, reasonCode: "admin_other", note: "Rider asked" } });
});

test("soonest pickup first, ended rides last", () => {
  const rows = sortReservations([trip({ tripId: "c", status: "completed", scheduledAt: "2026-11-01T08:00:00Z" }), trip({ tripId: "b", scheduledAt: "2026-11-06T08:00:00Z" }), trip({ tripId: "a" })]);
  assert.deepEqual(rows.map((r) => r.tripId), ["a", "b", "c"]);
});

test("owner BL-Q6/Q7: the keep question and the overdue alert show", async () => {
  const { isOverdue } = await import("./reservations.ts");
  assert.equal(reservationState(trip({ status: "accepted", reservation: { ...trip().reservation!, changeAsk: { until: "x", previousAt: "y" } } })), "Driver asked to keep the new time");
  assert.equal(isOverdue(trip({ status: "searching", reservation: { ...trip().reservation!, overdue: true } })), true);
  assert.equal(isOverdue(trip({ status: "accepted", reservation: { ...trip().reservation!, overdue: true } })), false);
});

test("checker: every demo action the server can do works on live (offer, raise, no-show, contact) and the not-started alert", async () => {
  const { notStarted } = await import("./reservations.ts");
  assert.deepEqual(reservationCall("offer", trip(), { driverId: "drv_1, drv_2" }), { path: "/admin/trips/trp_1/radar-group", body: { expectedVersion: 4, driverIds: ["drv_1", "drv_2"] } });
  assert.deepEqual(reservationCall("raise", trip({ fare: { amountMinor: 24200, currency: "EUR" } }), { amountMinor: 500 }), { path: "/admin/trips/trp_1/driver-bonus", body: { expectedVersion: 4, amount: { amountMinor: 500, currency: "EUR" } } });
  assert.throws(() => reservationCall("raise", trip(), {}), /how much/);
  assert.deepEqual(reservationCall("noShow", trip({ status: "arrived" }), { reason: "Not there" }), { path: "/admin/trips/trp_1/no-show", body: { expectedVersion: 4, note: "Not there" } });
  assert.deepEqual(reservationCall("contact", trip(), { reason: "Called rider" }), { path: "/admin/trips/trp_1/notes", body: { text: "Called rider" } });
  assert.equal(notStarted(trip({ status: "accepted", reservation: { ...trip().reservation!, notStarted: true } })), true);
});
