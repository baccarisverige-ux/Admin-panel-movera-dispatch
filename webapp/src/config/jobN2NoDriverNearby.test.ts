import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { appConfigState, driverAppConfig } from "./appConfigs.ts";
import { dispatchDocumentOf, rulesOfDispatch } from "../live/configDocs.ts";
import { liveRules, publish, zoneDefault } from "../dispatch/rules.ts";
import { zoneIssues } from "../dispatch/rules/checks.ts";
import { KINDS } from "../alerts/engine.ts";
import { noDriverInReach } from "../trips/present.ts";

/**
 * FIX JOB N2 + P17 + far rider (contract v0.18.39 §63, contract.json#noDriverNearby; owner N2 "'No driver nearby' after
 * 5 min" per zone, P17 "15 min after pickup past", boss supervisor defaults afterSec 300 / farReachKm 12). Admin: the
 * Dispatch settings, Book later's stop time, the two alert kinds, and the trip row mark "No driver in reach".
 */
const NOW = "2026-11-06T10:00:00Z";
const ND = (contract as unknown as { noDriverNearby: { defaults: { noDriverNearby: { on: boolean; afterSec: number; message: string }; farReachKm: number; noDriverStopAfterMin: number } } }).noDriverNearby;
const C = contract as unknown as { alertDesk: { kindGroups: Record<string, string> } };

test("Dispatch: 'No driver nearby' and far reach default to the contract (on, 300 s, 12 km) and go to the server per zone", () => {
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) {
    const doc = dispatchDocumentOf(zoneDefault(zoneId), zoneId, null) as { noDriverNearby?: unknown; limits?: { farReachKm?: number } };
    assert.deepEqual(doc.noDriverNearby, ND.defaults.noDriverNearby, zoneId);
    assert.equal(doc.limits?.farReachKm, ND.defaults.farReachKm, zoneId);
  }
  assert.deepEqual([ND.defaults.noDriverNearby.afterSec, ND.defaults.farReachKm, ND.defaults.noDriverStopAfterMin], [300, 12, 15]);
});

test("Dispatch: the admin's values come back from the server document; bad ones keep the default", () => {
  const zone = zoneDefault("Z001");
  const doc = { ...dispatchDocumentOf(zone, "Z001", null), noDriverNearby: { on: false, afterSec: 420, message: "Nobody near." }, limits: { maxPickupEtaMin: 0, farReachKm: 15 } };
  const back = rulesOfDispatch(doc, null, zone);
  assert.deepEqual(back.noDriverNearby, { on: false, afterSec: 420, message: "Nobody near." });
  assert.equal(back.limits.farReachKm, 15);
  const bad = rulesOfDispatch({ ...doc, noDriverNearby: { on: "x", afterSec: 5, message: "" }, limits: { farReachKm: 99 } }, null, zone);
  assert.deepEqual(bad.noDriverNearby, ND.defaults.noDriverNearby);
  assert.equal(bad.limits.farReachKm, ND.defaults.farReachKm);
});

test("Dispatch checks: far reach above 50 km and 'No driver nearby' outside 1–30 min are refused", () => {
  const zone = zoneDefault("Z001");
  assert.deepEqual(zoneIssues({ ...zone, limits: { ...zone.limits, farReachKm: 12 } }).filter((i) => /Far reach|No driver nearby/.test(i)), []);
  assert.ok(zoneIssues({ ...zone, limits: { ...zone.limits, farReachKm: 60 } }).some((i) => /Far reach/.test(i)));
  assert.ok(zoneIssues({ ...zone, noDriverNearby: { ...zone.noDriverNearby, afterSec: 30 } }).some((i) => /No driver nearby/.test(i)));
});

test("Book later (P17): 'stop a booked ride with no driver' defaults to 15 min and is published per zone", () => {
  const base = appConfigState({ now: NOW });
  assert.equal((driverAppConfig("Z001", base).reservations as Record<string, unknown>).noDriverStopAfterMin, ND.defaults.noDriverStopAfterMin);
  const zone = liveRules(base.dispatch, "Z001");
  const next = { ...zone, reservation: { ...zone.reservation, booking: { ...zone.reservation.booking, noDriverStopAfterMin: 20 } } };
  const published = publish(base.dispatch, { Z001: next }, {}, ["Z001"], "nora", "2026-11-06T09:30:00.000Z", "");
  assert.ok(!published.error, published.error ?? "");
  assert.equal((driverAppConfig("Z001", { ...base, dispatch: published.book }).reservations as Record<string, unknown>).noDriverStopAfterMin, 20);
  assert.equal((driverAppConfig("FR-PC", { ...base, dispatch: published.book }).reservations as Record<string, unknown>).noDriverStopAfterMin, 15, "only that zone");
});

test("alert kinds no_driver_nearby and booked_no_driver_ended are in the Dispatch group, like the contract", () => {
  for (const id of ["no_driver_nearby", "booked_no_driver_ended"]) {
    const kind = KINDS.find((k) => k.id === id);
    assert.ok(kind, `the admin knows the server's kind ${id}`);
    assert.equal(kind.group, C.alertDesk.kindGroups[id]);
  }
});

test("trip row mark 'No driver in reach': a searching trip whose searchStep is no_driver_nearby, nothing else", () => {
  assert.equal(noDriverInReach("searching", { kind: "no_driver_nearby" }), true);
  assert.equal(noDriverInReach("offered", { kind: "no_driver_nearby" }), true);
  assert.equal(noDriverInReach("searching", { kind: "keep_waiting" }), false);
  assert.equal(noDriverInReach("cancelled_by_rider", { kind: "no_driver_nearby" }), false);
  assert.equal(noDriverInReach("searching", null), false);
});

test("Dispatch: the busy-driver limit (reaskLimit) defaults to 2, is published per zone, reads back, and must be 1–5", () => {
  const C2 = contract as unknown as { noDriverNearby: { defaults: { reaskLimit: number } } };
  const zone = zoneDefault("Z001");
  assert.equal((dispatchDocumentOf(zone, "Z001", null) as { reaskLimit?: number }).reaskLimit, C2.noDriverNearby.defaults.reaskLimit);
  assert.equal(C2.noDriverNearby.defaults.reaskLimit, 2);
  const doc = dispatchDocumentOf({ ...zone, reaskLimit: 4 }, "Z001", null);
  assert.equal((doc as { reaskLimit?: number }).reaskLimit, 4);
  assert.equal(rulesOfDispatch(doc, null, zone).reaskLimit, 4);
  assert.equal(rulesOfDispatch({ ...doc, reaskLimit: 9 }, null, zone).reaskLimit, 2);
  assert.ok(zoneIssues({ ...zone, reaskLimit: 6 }).some((i) => /Ask one driver/.test(i)));
  assert.deepEqual(zoneIssues({ ...zone, reaskLimit: 3 }).filter((i) => /Ask one driver/.test(i)), []);
});

/** Screenshot review (admin-239): the marked trip row kept overflowing and lost its status dot; reaskLimit looked like part of "No driver nearby". */
const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const cardOf = (file: string, title: string) => {
  const start = file.indexOf(`<Card title={tr("${title}")}`);
  assert.ok(start >= 0, `card ${title}`);
  return file.slice(start, file.indexOf("</Card>", start));
};

test("Trips row: 'No driver in reach' keeps the status dot and is a small icon with a tooltip, not a wide pill", () => {
  const page = src("../pages/TripsPage.tsx");
  const branch = page.slice(page.indexOf("noDriverInReach(trip.status"), page.indexOf("if (!live || !isLiveWithDriver"));
  assert.match(branch, /<StatusDot\b/, "the row keeps its status dot");
  assert.doesNotMatch(branch, /op-status problem/, "no wide text pill in the status column");
  assert.match(branch, /title=\{tr\("No driver in reach"\)\}/, "the mark has a tooltip");
  assert.match(branch, /aria-label=\{tr\("No driver in reach"\)\}/);
});

test("Dispatch: 'Ask one driver at most' is its own row in Pickup limits, not inside the No driver nearby card", () => {
  const page = src("../dispatch/ZoneSettings.tsx");
  assert.doesNotMatch(cardOf(page, "No driver nearby"), /reaskLimit/);
  assert.match(cardOf(page, "Pickup limits"), /reaskLimit/);
});

test("an untouched zone publishes the same document: no farReachKm / reaskLimit / noDriverNearby added when the server document has none and the value is the default (e2e live-publish-safety)", () => {
  const zone = zoneDefault("Z001");
  const base = dispatchDocumentOf(zone, "Z001", null) as Record<string, unknown>;
  const { reaskLimit: _r, noDriverNearby: _n, ...rest } = base;
  const old = { ...rest, limits: { maxPickupEtaMin: 0 } };
  const doc = dispatchDocumentOf(zone, "Z001", old) as Record<string, unknown>;
  assert.equal("reaskLimit" in doc, false);
  assert.equal("noDriverNearby" in doc, false);
  assert.deepEqual(doc.limits, { maxPickupEtaMin: 0 });
  // A changed value is still written.
  const changed = dispatchDocumentOf({ ...zone, reaskLimit: 3, limits: { ...zone.limits, farReachKm: 15 } }, "Z001", old) as Record<string, unknown>;
  assert.equal(changed.reaskLimit, 3);
  assert.equal((changed.limits as { farReachKm: number }).farReachKm, 15);
});
