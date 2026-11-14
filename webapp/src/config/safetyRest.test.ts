import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { appConfigState, driverAppConfig } from "./appConfigs.ts";
import { completeCountry, countryIssues, liveCountry, publish } from "../dispatch/rules.ts";
import { countryLines } from "../dispatch/rules/changes.ts";

/**
 * SV follow-up (coordinator ruling 2026-11-14 on the six open points of audits/impact/safety-settings.md; settled by the
 * contract and decisions/driving-time-limits.md:2-4 + decisions/driver-g5.md:9,16):
 * 1. drivingLimits.restMinutes = the break length the app shows (contract default 30), NOT rest hours × 60; the offline
 *    reset is its own country field resetAfterOfflineHours (default 6, "6 hours offline so reset all time").
 * 3. the came-closer check is gone (contract pickupWaiting.headingCheck.replaces): no closerPct setting, not sent.
 * 4. headingCheck.on = the zone's "Smart cancel check" switch (contract pickupWaiting.headingCheck.setting).
 * 6. ranges as the server's: work hours 0-24 (0 = no limit), offline reset 1-24.
 */
const NOW = "2026-11-14T10:00:00Z";
const C = contract as unknown as { configDefaults: { drivingLimits: { maxHoursPerDay: number; restMinutes: number; resetAfterOfflineHours: number } } };

test("1: restMinutes is the contract break length (30), the reset its own field (6); both per country", () => {
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) {
    const limits = driverAppConfig(zoneId, appConfigState({ now: NOW })).drivingLimits as Record<string, unknown>;
    assert.equal(limits.restMinutes, C.configDefaults.drivingLimits.restMinutes, zoneId);
    assert.equal(limits.resetAfterOfflineHours, C.configDefaults.drivingLimits.resetAfterOfflineHours, zoneId);
    assert.equal(limits.maxHoursPerDay, C.configDefaults.drivingLimits.maxHoursPerDay, zoneId);
  }
  const base = appConfigState({ now: NOW });
  const se = liveCountry(base.dispatch, "SE");
  assert.deepEqual([se.rest.restMinutes, se.rest.resetAfterOfflineHours], [30, 6]);
  assert.ok(!("restHours" in se.rest), "no rest hours any more");
  const published = publish(base.dispatch, {}, { SE: { ...se, rest: { ...se.rest, restMinutes: 45, resetAfterOfflineHours: 8 } } }, [], "nora", "2026-11-14T09:30:00.000Z", "");
  assert.ok(!published.error, published.error ?? "");
  const limits = driverAppConfig("Z001", { ...base, dispatch: published.book }).drivingLimits as Record<string, unknown>;
  assert.deepEqual([limits.restMinutes, limits.resetAfterOfflineHours], [45, 8]);
  assert.ok(countryLines(se, { ...se, rest: { ...se.rest, resetAfterOfflineHours: 8 } }).some((line) => line.startsWith("Offline hours that reset the driving time: 6 → 8")));
});

test("1: an older save with restHours keeps its value as the offline reset (it was the rest = reset)", () => {
  const old = completeCountry("SE", { country: "SE", rest: { on: true, workHours: 10, restHours: 8 } } as never);
  assert.deepEqual([old.rest.workHours, old.rest.resetAfterOfflineHours, old.rest.restMinutes], [10, 8, 30]);
  assert.ok(!("restHours" in old.rest));
});

test("6: ranges as the server's — work hours 0-24 (0 = no limit), offline reset 1-24", () => {
  const se = liveCountry(appConfigState({ now: NOW }).dispatch, "SE");
  const issues = (rest: Partial<typeof se.rest>) => countryIssues({ ...se, rest: { ...se.rest, ...rest } });
  assert.deepEqual(issues({ workHours: 0 }), [], "0 = no limit is allowed");
  assert.deepEqual(issues({ workHours: 24, resetAfterOfflineHours: 24 }), []);
  assert.deepEqual(issues({ workHours: 2, resetAfterOfflineHours: 1 }), [], "below the old 4 h / above nothing");
  assert.ok(issues({ workHours: 25 }).some((issue) => issue.includes("0 to 24")));
  assert.ok(issues({ resetAfterOfflineHours: 0 }).some((issue) => issue.includes("1 to 24")));
  assert.ok(issues({ resetAfterOfflineHours: 25 }).some((issue) => issue.includes("1 to 24")));
  assert.ok(issues({ restMinutes: -1 }).some((issue) => issue.includes("Break")));
});
