import assert from "node:assert/strict";
import test from "node:test";
import { approvalRow, auditRow, driverRecord, nearbyRow, paymentRecord, refundPayoutRecord, riderRecord, tripFacts, tripRecord } from "./liveAdminApi.ts";
import { isLiveData, liveDriverOf, liveTripOf, remember, setLiveData } from "./realData.ts";
import type { Driver, Trip } from "./types.ts";

const SEK = (amountMinor: number) => ({ amountMinor, currency: "SEK" });

const TRIP: Trip = {
  tripId: "trp_1", status: "completed", version: 4, kind: "live", createdAt: "2026-10-25T08:00:00Z", updatedAt: "2026-10-25T08:30:00Z", acceptedAt: "2026-10-25T08:01:00Z",
  riderId: "rdr_1", driverId: "drv_1", zoneId: "Z001", categoryId: "comfort",
  pickup: { address: "Sergels torg 1", lat: 59.33, lng: 18.06 }, dropoff: { address: "Arlanda T5", lat: 59.65, lng: 17.92 }, stops: [{ address: "Odenplan", lat: 59.34, lng: 18.05 }],
  fare: SEK(40000), fareLines: [{ code: "base", amount: SEK(4000) }], driverEarnings: SEK(32000), commission: SEK(8000), pickupPay: SEK(1500), driverBonus: SEK(2000),
  walletApplied: SEK(5000), cashToCollect: SEK(35000), driverSilentAlert: { at: "2026-10-25T08:20:00Z" }, paymentMethod: "cash", paymentStatus: "captured", ratingStatus: "rated",
};

test("a live trip keeps every server fact: method, places, stops, money lines, silent alert", () => {
  const record = tripRecord(TRIP, { riderId: "rdr_1", firstName: "Ida", phone: "+46700000001", status: "active", version: 1, outstanding: null });
  assert.equal(record.name, "Ida");
  assert.equal(record.tripId, "rdr_1");
  assert.equal(record.live, true);
  const facts = record.liveTrip!;
  assert.equal(facts.paymentMethod, "cash");
  assert.equal(facts.categoryId, "comfort");
  assert.deepEqual(facts.stops, TRIP.stops);
  assert.equal(facts.pickup.address, "Sergels torg 1");
  assert.deepEqual([facts.fare, facts.commission, facts.driverEarnings, facts.pickupPay, facts.driverBonus, facts.walletApplied, facts.cashToCollect], [40000, 8000, 32000, 1500, 2000, 5000, 35000]);
  assert.deepEqual(facts.fareLines, [{ code: "base", amountMinor: 4000 }]);
  assert.equal(facts.driverSilentAlert?.at, "2026-10-25T08:20:00Z");
});

test("v0.18.8 (G6): paid waiting minutes, the applied rule, the PIN (admin view) and a reversed no-show are kept; the list row gets the server's minutes", () => {
  const base = tripRecord({ tripId: "T-G6", status: "no_show", version: 4, kind: "live", createdAt: "2026-10-25T08:00:00Z", updatedAt: "2026-10-25T08:20:00Z", riderId: "R1", zoneId: "Z001", categoryId: "economy", pickup: { lat: 59.33, lng: 18.06 }, dropoff: { lat: 59.34, lng: 18.07 }, stops: [], fare: SEK(0), paymentMethod: "card",
    pinRequired: true, pickupPin: "0427", pinVerified: false, pinAttempts: 2,
    waiting: { arrivedAt: "2026-10-25T08:10:00Z", freeUntil: "2026-10-25T08:25:00Z", noShowAt: "2026-10-25T08:30:00Z", chargedSeconds: 130, paidMinutes: 3, rules: ["airport"], freeWaitMin: 15, noShowAfterMin: 20 },
    cancellation: { actor: "driver", reasonCode: "no_show", at: "2026-10-25T08:31:00Z", fee: SEK(6500), feeStatus: "refunded", feeKind: "no_show", reversal: { at: "2026-10-25T09:00:00Z", by: "A1", reason: "Rider was at the other door", driverShareTakenBack: false } } });
  const facts = (base as { liveTrip: ReturnType<typeof tripFacts> }).liveTrip;
  assert.deepEqual([facts.waiting?.paidMinutes, facts.waiting?.rules, facts.waiting?.freeWaitMin, facts.waiting?.noShowAfterMin], [3, ["airport"], 15, 20]);
  assert.deepEqual(facts.pin, { code: "0427", verified: false, attempts: 2, blocked: false });
  assert.deepEqual(facts.cancellation?.reversal, { at: "2026-10-25T09:00:00Z", by: "A1", reason: "Rider was at the other door", driverShareTakenBack: false });
  assert.equal((base as { waitingMin?: number }).waitingMin, 3, "Trips list minutes from waiting.paidMinutes");
});

test("v0.18.7 (G5): a live trip keeps the car's position, the server's ETA, the rider summary, the terms, the waiting amounts and the cancel fee", () => {
  const facts = tripRecord({
    ...TRIP, status: "driver_to_pickup",
    driverLocation: { lat: 59.331, lng: 18.061, measuredAt: "2026-10-25T08:05:00Z", accuracy: 5 },
    eta: { etaSeconds: 230, distanceMeters: 1249, target: "pickup", at: "2026-10-25T08:05:00Z", source: "osrm" },
    rider: { firstName: "Ida", rating: 4.83 },
    terms: { currency: "SEK", freeWaitMin: 5, waitPerMin: SEK(1226), noShowAfterMin: 5, noShowFee: SEK(6500), noShowDriverSharePct: 80, cancelRule: { freeMin: 2, fee: SEK(3500) }, cancelDriverSharePct: 100, cancelAfterArrivedIsNoShow: true, maxPickupMoveMeters: 200 },
    waiting: { arrivedAt: "2026-10-25T08:10:00Z", freeUntil: "2026-10-25T08:15:00Z", noShowAt: "2026-10-25T08:15:00Z", chargedSeconds: 0, noShowFee: SEK(6500), noShowDriverShare: SEK(5200), chargedSecondsNow: 30, chargedSoFar: SEK(613) },
    cancellation: { actor: "rider", reasonCode: "plans_changed", at: "2026-10-25T08:16:00Z", fee: SEK(6500), feeStatus: "owed", feeKind: "no_show", driverShare: SEK(5200) },
  }).liveTrip!;
  assert.deepEqual(facts.driverLocation, { lat: 59.331, lng: 18.061, measuredAt: "2026-10-25T08:05:00Z" });
  assert.deepEqual(facts.eta, { etaSeconds: 230, distanceMeters: 1249, target: "pickup", at: "2026-10-25T08:05:00Z", source: "osrm" });
  assert.deepEqual(facts.rider, { firstName: "Ida", rating: 4.83 });
  assert.equal(facts.terms?.waitPerMinMinor, 1226);
  assert.equal(facts.terms?.cancelFreeMin, 2);
  assert.equal(facts.terms?.maxPickupMoveMeters, 200);
  assert.deepEqual([facts.waiting?.noShowFeeMinor, facts.waiting?.noShowDriverShareMinor, facts.waiting?.chargedSecondsNow, facts.waiting?.chargedSoFarMinor], [6500, 5200, 30, 613]);
  assert.deepEqual(facts.cancellation, { actor: "rider", reasonCode: "plans_changed", at: "2026-10-25T08:16:00Z", feeMinor: 6500, feeStatus: "owed", feeKind: "no_show", driverShareMinor: 5200, note: null, reversal: null, refundedToWallet: false });
  const older = tripRecord(TRIP).liveTrip!;
  assert.deepEqual([older.driverLocation, older.eta, older.rider, older.terms, older.waiting, older.cancellation], [null, null, null, null, null, null], "an older server: nothing invented");
});

test("v0.18.7 (G5 Q3): a live rider carries what is owed per currency; an older server's one amount is the list", () => {
  const both = riderRecord({ riderId: "rdr_1", firstName: "Ida", phone: "+46700000001", status: "active", version: 1, outstanding: SEK(10000), outstandingByCurrency: [SEK(10000), { amountMinor: 1000, currency: "EUR" }] }).liveRider!;
  assert.deepEqual(both.outstandingByCurrency, [{ amountMinor: 10000, currency: "SEK" }, { amountMinor: 1000, currency: "EUR" }]);
  assert.equal(both.outstandingMinor, 10000);
  const older = riderRecord({ riderId: "rdr_2", firstName: "Bo", phone: "+46700000002", status: "active", version: 1, outstanding: SEK(4900) }).liveRider!;
  assert.deepEqual(older.outstandingByCurrency, [{ amountMinor: 4900, currency: "SEK" }]);
  const none = riderRecord({ riderId: "rdr_3", firstName: "Eva", phone: "+46700000003", status: "active", version: 1, outstanding: null }).liveRider!;
  assert.deepEqual(none.outstandingByCurrency, []);
});

test("money lines the server did not send stay null, never 0", () => {
  const facts = tripRecord({ ...TRIP, commission: undefined, pickupPay: undefined, walletApplied: undefined, driverSilentAlert: undefined }).liveTrip!;
  assert.equal(facts.commission, null);
  assert.equal(facts.pickupPay, null);
  assert.equal(facts.walletApplied, null);
  assert.equal(facts.driverSilentAlert, null);
});

test("a live driver carries online status, rating and position from /admin/live/drivers", () => {
  const driver = { driverId: "drv_1", accountStatus: "active", onlineStatus: "offline", firstName: "Anna", zoneIds: ["Z001"], categoryIds: [], documents: [], version: 1, rating: 4.8 } as Driver;
  const record = driverRecord(driver, { driverId: "drv_1", firstName: "Anna", onlineStatus: "on_trip", stale: false, location: { lat: 59.3, lng: 18.0, measuredAt: "2026-10-26T09:00:00Z" }, lastFixAt: "2026-10-26T09:00:01Z", activeTripId: "trp_1" });
  assert.deepEqual(record.liveDriver, { onlineStatus: "on_trip", rating: 4.8, location: { lat: 59.3, lng: 18.0, measuredAt: "2026-10-26T09:00:00Z" }, lastFixAt: "2026-10-26T09:00:01Z", stale: false, activeTripId: "trp_1" });
  const plain = driverRecord({ ...driver, rating: undefined });
  assert.equal(plain.liveDriver?.onlineStatus, "offline");
  assert.equal(plain.liveDriver?.rating, null);
});

test("riders, payments, refunds to pay by hand, audit and approvals map from the server", () => {
  const rider = riderRecord({ riderId: "rdr_2", firstName: "Bo", phone: "+46700000002", rating: 4.5, status: "active", version: 3, outstanding: SEK(2500), wallet: SEK(1000) });
  assert.deepEqual(rider.liveRider, { rating: 4.5, walletMinor: 1000, outstandingMinor: 2500, currency: "SEK", deletionRequestedAt: null, outstandingByCurrency: [{ amountMinor: 2500, currency: "SEK" }] });
  const payment = paymentRecord({ paymentId: "pay_trp_1", tripId: "trp_1", amount: SEK(40000), method: "cash", purpose: "trip", status: "captured", createdAt: "2026-10-25T08:30:00Z" }, "Z001");
  assert.deepEqual([payment.name, payment.tripId, payment.fareOre, payment.zoneId], ["cash", "trp_1", 40000, "Z001"]);
  const refund = refundPayoutRecord({ refundId: "rfd_1", tripId: "trp_1", amount: SEK(3000), riderId: "rdr_2", riderName: "Bo", riderPhone: "+46700000002", payoutTo: { kind: "swish" }, reason: "Late" });
  assert.deepEqual([refund.id, refund.name, refund.fareOre, refund.status], ["rfd_1", "Bo", 3000, "pending"]);
  const audit = auditRow({ auditId: "9", at: "2026-10-26T10:00:00Z", actor: "admin", actorId: "adm_1", action: "trip.refund", targetType: "trip", targetId: "trp_1", reason: "Late", result: "committed", after: { zoneId: "Z001" }, requestId: "9" });
  assert.deepEqual([audit.actorId, audit.scope, audit.reason, audit.result], ["adm_1", "Z001", "Late", "committed"]);
  const approval = approvalRow({ approvalId: "apr_1", action: "trip.refund", targetType: "trip", targetId: "trp_1", status: "pending_approval", requestedBy: "adm_2", requestedAt: "2026-10-26T10:00:00Z" });
  assert.equal(approval?.status, "pending");
  assert.ok(Number.isNaN(approval?.amountOre), "no amount on the server: not a 0");
  assert.equal(approvalRow({ approvalId: "apr_2", action: "x", targetType: "trip", targetId: "t", status: "expired", requestedBy: "a", requestedAt: "2026-10-26T10:00:00Z" }), null);
});

test("nearby drivers keep the server's distance and ETA, rating is null without a source", () => {
  const row = nearbyRow({ driverId: "drv_3", firstName: "Eva", onlineStatus: "online", location: { lat: 59.3, lng: 18, measuredAt: "2026-10-26T09:00:00Z" }, distanceMeters: 1200, pickupEtaSeconds: 180, zoneId: "Z001", categoryIds: ["economy"] }, "comfort", null);
  assert.deepEqual([row.distanceMeters, row.pickupEtaSeconds, row.categoryOk, row.rating], [1200, 180, false, null]);
});

test("the live registry answers id-only helpers with server facts", () => {
  setLiveData(true);
  assert.equal(isLiveData(), true);
  const trip = tripRecord(TRIP);
  remember([trip, driverRecord({ driverId: "drv_9", accountStatus: "active", onlineStatus: "online", firstName: "Al", zoneIds: [], categoryIds: [], documents: [], version: 1 } as Driver)]);
  assert.equal(liveTripOf({ id: "trp_1" })?.paymentMethod, "cash");
  assert.equal(liveDriverOf({ id: "drv_9" })?.onlineStatus, "online");
  setLiveData(false);
  assert.equal(liveTripOf({ id: "trp_1" }), null);
});
