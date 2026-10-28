import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPricingStore, zoneBook } from "../pricing/zonePricing.ts";
import { alertsFor } from "../pricing/rows.ts";
import { liveDemand, liveSurgeRows, liveTimeline, smartChangesLastHour, surgeHistoryPath, surgeNowPath, type SurgeHistory, type SurgeNowAnswer } from "./liveSurge.ts";

/** Contract v0.7.2 (owner 2026-10-28, contract.json#surgeLive): the live Surge tab shows the server's numbers only. */

const AT = Date.parse("2026-10-28T12:00:00Z");

const NOW: SurgeNowAnswer = {
  at: "2026-10-28T12:00:00Z",
  zones: [
    { zoneId: "Z001", multiplier: 1.8, source: "smart", requests: 14, freeDrivers: 5, ratio: 2.8, checkedAt: "2026-10-28T11:59:00Z" },
    { zoneId: "Z002", multiplier: 2.2, source: "manual", until: "2026-10-28T13:00:00Z", scheduleId: "sur_1", requests: 3, freeDrivers: 4, ratio: 0.8, checkedAt: "2026-10-28T11:59:00Z" },
    // No sample yet: the multiplier is known, the demand is not.
    { zoneId: "Z003", multiplier: 1, source: "off", requests: 0, freeDrivers: 0, ratio: 0 },
  ],
};

const HISTORY: SurgeHistory = {
  zoneId: "Z001",
  from: "2026-10-28T04:00:00Z",
  to: "2026-10-28T12:00:00Z",
  bucketMin: 10,
  points: [
    { at: "2026-10-28T05:00:00Z", requests: 2, freeDrivers: 9, ratio: 0.2, multiplier: 1 },
    { at: "2026-10-28T11:40:00Z", requests: 30, freeDrivers: 6, ratio: 2.4, multiplier: 1.5 },
    { at: "2026-10-28T11:50:00Z", requests: 42, freeDrivers: 5, ratio: 2.8, multiplier: 1.8 },
  ],
  priceCheck: { windowMin: 60, saw: 40, left: 12, leftPct: 30 },
  timeline: [
    { at: "2026-10-28T11:45:00Z", kind: "smart_change", multiplier: 1.8, previous: 1.5, by: "smart", effect: { drivers: -2, ridesPct: 12, leftPct: 30 } },
    { at: "2026-10-28T11:20:00Z", kind: "smart_change", multiplier: 1.5, previous: 1, by: "smart" },
    { at: "2026-10-28T09:00:00Z", kind: "manual_stop", multiplier: 1, previous: 2, by: "adm_owner" },
    { at: "2026-10-28T08:00:00Z", kind: "manual_start", multiplier: 2, previous: 1, by: "adm_owner", effect: { drivers: 4, ridesPct: 20, leftPct: 10 } },
    { at: "2026-10-28T07:00:00Z", kind: "scheduled_start", multiplier: 1.4, previous: 1, by: "scheduled" },
    { at: "2026-10-28T07:30:00Z", kind: "scheduled_end", multiplier: 1, previous: 1.4, by: "scheduled" },
    { at: "2026-10-28T06:00:00Z", kind: "smart_end", multiplier: 1, previous: 1.3, by: "smart" },
  ],
};

test("the calls: surge now for the page's zones, the chosen zone's history for 8 hours in 10-minute buckets", () => {
  assert.equal(surgeNowPath(["Z001", "Z002"]), "/admin/surge/now?zoneIds=Z001,Z002");
  assert.equal(surgeHistoryPath("Z001"), "/admin/zones/Z001/surge/history?hours=8&bucketMin=10");
});

test("surge now per zone comes from the server: multiplier, source, until, requests, free drivers, ratio", () => {
  const rows = liveSurgeRows(emptyPricingStore(), ["Z001", "Z002", "Z003", "Z004"], NOW, AT);
  // A zone the server did not answer for (Z004) is left out, never shown as ×1.0.
  assert.deepEqual(rows.map((row) => row.surge.zoneId), ["Z001", "Z002", "Z003"]);
  const [smart, manual, quiet] = rows.map((row) => row.surge);
  assert.equal(smart!.multiplier, 1.8);
  assert.equal(smart!.source, "smart");
  assert.equal(smart!.level, "mid");
  assert.deepEqual([smart!.requests, smart!.free, smart!.ratio, smart!.demandKnown], [14, 5, 2.8, true]);
  assert.equal(manual!.source, "manual");
  assert.equal(manual!.endsAt, "2026-10-28T13:00:00Z");
  assert.equal(quiet!.demandKnown, false);
  assert.equal(quiet!.multiplier, 1);
  assert.deepEqual(liveSurgeRows(emptyPricingStore(), ["Z001"], null, AT), [], "a failed call gives no rows (Not connected yet)");
});

test("alerts use the server's numbers; a zone without a sample is not 'short' but has no live data", () => {
  const store = emptyPricingStore();
  const smartOn = { ...store, zones: { Z003: { ...zoneBook(store, "Z003"), smart: { ...zoneBook(store, "Z003").smart, enabled: true } } } };
  const rows = liveSurgeRows(smartOn, ["Z003"], NOW, AT);
  const alerts = alertsFor(rows, AT, () => null);
  assert.deepEqual(alerts.map((alert) => alert.id), ["Z003-nodata"]);
});

test("demand chart: the last 6 hours of the server's points, with its multiplier as the surge band", () => {
  const { points, surge } = liveDemand(HISTORY, AT);
  assert.deepEqual(points, [
    { at: Date.parse("2026-10-28T11:40:00Z"), requests: 30, free: 6, ratio: 2.4 },
    { at: Date.parse("2026-10-28T11:50:00Z"), requests: 42, free: 5, ratio: 2.8 },
  ]);
  assert.deepEqual(surge, [1.5, 1.8]);
});

test("timeline: the server's kinds in the demo's wording, with by and effect; newest first", () => {
  const items = liveTimeline(HISTORY, zoneBook(emptyPricingStore(), "Z001"));
  assert.deepEqual(items.map((item) => item.title), [
    "Smart surge ×1.8 (was ×1.5)",
    "Smart surge ×1.5",
    "Manual surge stopped",
    "Manual surge ×2.0 started",
    "Scheduled surge ended",
    "Scheduled surge ×1.4 started",
    "Smart surge ended",
  ]);
  assert.deepEqual(items.map((item) => item.source), ["smart", "smart", "manual", "manual", "scheduled", "scheduled", "smart"]);
  assert.deepEqual(items.map((item) => item.by), ["Smart surge", "Smart surge", "adm_owner", "adm_owner", "Scheduled", "Scheduled", "Smart surge"]);
  assert.deepEqual(items[0]!.effect, { drivers: -2, ridesPct: 12, leftPct: 30 });
  assert.equal(items[1]!.effect, null, "no effect while the 30 minutes after are not over");
  assert.equal(smartChangesLastHour(HISTORY, AT), 2);
});
