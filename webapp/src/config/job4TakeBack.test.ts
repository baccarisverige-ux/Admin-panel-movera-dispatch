import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { appConfigState, driverAppConfig } from "./appConfigs.ts";
import { OWNED, dispatchDocumentOf, rulesOfDispatch, withOwned } from "../live/configDocs.ts";
import { liveRules, publish, zoneDefault } from "../dispatch/rules.ts";
import { KINDS } from "../alerts/engine.ts";

/**
 * FIX JOB 4 "take-back" (contract v0.18.35 §59, contract.json#bookedTakeBack; owner Q2 / Q-A / Q-B / fix-plan Q2 and
 * job-4 Q4 of 2026-11-04). Admin: Dispatch › Book later › "Late driver".
 */
const NOW = "2026-11-05T10:00:00Z";
const C = contract as unknown as { configDefaults: { reservations: Record<string, unknown>; headingCheck: Record<string, unknown> }; alertDesk: { kindGroups: Record<string, string> } };

test("Late driver: the three take-back numbers default to the contract (5 / 10 / 15) and go to the server per zone (SE, FR, TN)", () => {
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) {
    const doc = driverAppConfig(zoneId, appConfigState({ now: NOW })).reservations as Record<string, unknown>;
    assert.equal(doc.takeBackLateMin, C.configDefaults.reservations.takeBackLateMin, zoneId);
    assert.equal(doc.takeBackKeepIfDriveMin, C.configDefaults.reservations.takeBackKeepIfDriveMin, zoneId);
    assert.equal(doc.takeBackUntilMinBeforePickup, C.configDefaults.reservations.takeBackUntilMinBeforePickup, zoneId);
  }
  assert.deepEqual([C.configDefaults.reservations.takeBackLateMin, C.configDefaults.reservations.takeBackKeepIfDriveMin, C.configDefaults.reservations.takeBackUntilMinBeforePickup], [5, 10, 15]);
});

test("Late driver: the admin's numbers are published for that zone only", () => {
  const base = appConfigState({ now: NOW });
  const zone = liveRules(base.dispatch, "Z001");
  const next = { ...zone, reservation: { ...zone.reservation, booking: { ...zone.reservation.booking, takeBackLateMin: 8, takeBackKeepIfDriveMin: 12, takeBackUntilMinBeforePickup: 30, notHeadingNotice: false, notHeadingNoticeEveryMin: 3 } } };
  const published = publish(base.dispatch, { Z001: next }, {}, ["Z001"], "nora", "2026-11-05T09:30:00.000Z", "");
  assert.ok(!published.error, published.error ?? "");
  const doc = driverAppConfig("Z001", { ...base, dispatch: published.book });
  const resv = doc.reservations as Record<string, unknown>;
  assert.deepEqual([resv.takeBackLateMin, resv.takeBackKeepIfDriveMin, resv.takeBackUntilMinBeforePickup], [8, 12, 30]);
  assert.deepEqual(doc.headingCheck, { on: true, headingPct: 80, notHeadingMinutes: 2, reassign: false, notice: false, noticeEveryMin: 3 });
  assert.equal((driverAppConfig("FR-PC", { ...base, dispatch: published.book }).reservations as Record<string, unknown>).takeBackLateMin, 5, "only that zone");
});

test("owner Q-A: a live ride is never taken back — the admin publishes reassign false, never true", () => {
  const doc = driverAppConfig("Z001", appConfigState({ now: NOW }));
  assert.equal((doc.headingCheck as { reassign: boolean }).reassign, false);
  assert.equal(C.configDefaults.headingCheck.reassign, false);
  assert.deepEqual([(doc.headingCheck as { notice: boolean }).notice, (doc.headingCheck as { noticeEveryMin: number }).noticeEveryMin], [true, 1]);
});

test("Late driver: the values come back from the live driver document; bad ones keep the default", () => {
  const zone = zoneDefault("Z001");
  const doc = dispatchDocumentOf(zone, "Z001", null);
  const back = rulesOfDispatch(doc, { reservations: { takeBackLateMin: 7, takeBackKeepIfDriveMin: 0, takeBackUntilMinBeforePickup: 45 }, headingCheck: { notice: false, noticeEveryMin: 4 } }, zone);
  assert.deepEqual([back.reservation.booking.takeBackLateMin, back.reservation.booking.takeBackKeepIfDriveMin, back.reservation.booking.takeBackUntilMinBeforePickup], [7, 0, 45]);
  assert.deepEqual([back.reservation.booking.notHeadingNotice, back.reservation.booking.notHeadingNoticeEveryMin], [false, 4]);
  const bad = rulesOfDispatch(doc, { reservations: { takeBackLateMin: 0, takeBackKeepIfDriveMin: 99, takeBackUntilMinBeforePickup: -1 }, headingCheck: { notice: "x", noticeEveryMin: 60 } }, zone);
  assert.deepEqual([bad.reservation.booking.takeBackLateMin, bad.reservation.booking.takeBackKeepIfDriveMin, bad.reservation.booking.takeBackUntilMinBeforePickup], [5, 10, 15]);
  assert.deepEqual([bad.reservation.booking.notHeadingNotice, bad.reservation.booking.notHeadingNoticeEveryMin], [true, 1]);
});

test("publishing Dispatch writes only the notice parts of headingCheck (the server's own heading numbers stay); reassign is always false", () => {
  assert.ok(OWNED.dispatch.driver.includes("headingCheck"));
  const server = { headingCheck: { on: true, headingPct: 90, notHeadingMinutes: 3, reassign: true } };
  const built = { headingCheck: { on: true, headingPct: 80, notHeadingMinutes: 2, reassign: false, notice: false, noticeEveryMin: 2 } };
  assert.deepEqual(withOwned(server, built, ["headingCheck"]).headingCheck, { on: true, headingPct: 90, notHeadingMinutes: 3, reassign: false, notice: false, noticeEveryMin: 2 });
});

test("alert kind booked_taken_back is in the Dispatch group, like the contract", () => {
  const kind = KINDS.find((k) => k.id === "booked_taken_back");
  assert.ok(kind, "the admin knows the server's new kind");
  assert.equal(kind.group, C.alertDesk.kindGroups["booked_taken_back"]);
});
