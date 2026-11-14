import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { appConfigState, driverAppConfig } from "./appConfigs.ts";
import { CONFIG_DEFAULTS } from "./zoneDefaults.ts";
import { dispatchDocumentOf, rulesOfDispatch, withOwned } from "../live/configDocs.ts";
import { countryIssues, liveCountry, liveRules, publish, zoneDefault, zoneIssues } from "../dispatch/rules.ts";
import { changeLines } from "../dispatch/rules/changes.ts";

/**
 * BQ-V21 + BQ-V22 (SAFETY, audits/verify-built-2026-11-14 items 13 + 14).
 * - decisions/driving-time-limits.md:2-4 (owner 2026-11-02): "It's 12 hours driving (mean driving to pickup or on trip)
 *   not online time !! And yes e force" + "6 hours offline so reset all time": both numbers are an admin setting per
 *   country (default 12 h / 6 h). Dispatch › Drivers › "Rest after long work": Work hours → maxHoursPerDay, Rest hours →
 *   resetAfterOfflineHours (before this the reset was always 6).
 * - decisions/driver-g5.md:9,16 (owner G5-8): the heading check "80 % default, admin can change", 2 min, "thresholds per
 *   zone". Dispatch › Rides › "Rider cancels: smart check" → DriverAppConfig.headingCheck.headingPct / notHeadingMinutes
 *   (before this always 80 / 2, and publishing kept the server's own numbers).
 */
const NOW = "2026-11-14T10:00:00Z";
const C = contract as unknown as { configDefaults: { drivingLimits: Record<string, number>; headingCheck: Record<string, unknown> } };

test("defaults equal the contract: 12 h driving, 6 h offline reset, 80 %, 2 min (SE, FR, TN)", () => {
  assert.deepEqual(CONFIG_DEFAULTS.headingCheck, { headingPct: C.configDefaults.headingCheck.headingPct, notHeadingMinutes: C.configDefaults.headingCheck.notHeadingMinutes });
  assert.deepEqual(CONFIG_DEFAULTS.headingCheck, { headingPct: 80, notHeadingMinutes: 2 });
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) {
    const doc = driverAppConfig(zoneId, appConfigState({ now: NOW }));
    const limits = doc.drivingLimits as Record<string, unknown>;
    assert.equal(limits.maxHoursPerDay, C.configDefaults.drivingLimits.maxHoursPerDay, zoneId);
    assert.equal(limits.resetAfterOfflineHours, C.configDefaults.drivingLimits.resetAfterOfflineHours, zoneId);
    const heading = doc.headingCheck as Record<string, unknown>;
    assert.deepEqual([heading.headingPct, heading.notHeadingMinutes], [80, 2], zoneId);
  }
});

test("BQ-V21: the country's Rest hours are the offline reset the server uses (per country, not hard-coded 6)", () => {
  const base = appConfigState({ now: NOW });
  const se = liveCountry(base.dispatch, "SE");
  const published = publish(base.dispatch, {}, { SE: { ...se, rest: { ...se.rest, workHours: 10, restHours: 4 } } }, [], "nora", "2026-11-14T09:30:00.000Z", "");
  assert.ok(!published.error, published.error ?? "");
  const state = { ...base, dispatch: published.book };
  const limits = driverAppConfig("Z001", state).drivingLimits as Record<string, unknown>;
  assert.equal(limits.maxHoursPerDay, 10);
  assert.equal(limits.resetAfterOfflineHours, 4);
  assert.equal((driverAppConfig("FR-PC", state).drivingLimits as Record<string, unknown>).resetAfterOfflineHours, 6, "only that country");
  assert.ok(countryIssues({ ...se, rest: { ...se.rest, restHours: 0 } }).some((issue) => issue.includes("Rest hours")));
});

test("BQ-V22: the zone's heading % and minutes are published for that zone only; bad values are refused", () => {
  const base = appConfigState({ now: NOW });
  const zone = liveRules(base.dispatch, "Z001");
  assert.deepEqual([zone.riderCancel.headingPct, zone.riderCancel.notHeadingMinutes], [80, 2]);
  const next = { ...zone, riderCancel: { ...zone.riderCancel, headingPct: 90, notHeadingMinutes: 4 } };
  const published = publish(base.dispatch, { Z001: next }, {}, ["Z001"], "nora", "2026-11-14T09:30:00.000Z", "");
  assert.ok(!published.error, published.error ?? "");
  const heading = driverAppConfig("Z001", { ...base, dispatch: published.book }).headingCheck as Record<string, unknown>;
  assert.deepEqual([heading.headingPct, heading.notHeadingMinutes, heading.reassign], [90, 4, false]);
  const fr = driverAppConfig("FR-PC", { ...base, dispatch: published.book }).headingCheck as Record<string, unknown>;
  assert.deepEqual([fr.headingPct, fr.notHeadingMinutes], [80, 2], "only that zone");
  assert.ok(zoneIssues({ ...zone, riderCancel: { ...zone.riderCancel, headingPct: 40 } }).some((issue) => issue.includes("50 to 100")));
  assert.ok(zoneIssues({ ...zone, riderCancel: { ...zone.riderCancel, notHeadingMinutes: 31 } }).some((issue) => issue.includes("1 to 30")));
  assert.ok(changeLines(zone, next).some((line) => line.startsWith("Heading to the pickup")), changeLines(zone, next).join(" | "));
});

test("BQ-V22: publishing Dispatch writes the admin's heading numbers (no longer the server's own); reassign stays false", () => {
  const server = { headingCheck: { on: true, headingPct: 80, notHeadingMinutes: 2, reassign: true } };
  const built = { headingCheck: { on: true, headingPct: 90, notHeadingMinutes: 4, reassign: false, notice: false, noticeEveryMin: 2 } };
  assert.deepEqual(withOwned(server, built, ["headingCheck"]).headingCheck, { on: true, headingPct: 90, notHeadingMinutes: 4, reassign: false, notice: false, noticeEveryMin: 2 });
});

test("BQ-V22: the heading numbers come back from the live driver document; bad or missing ones keep the default", () => {
  const zone = zoneDefault("Z001");
  const doc = dispatchDocumentOf(zone, "Z001", null);
  const back = rulesOfDispatch(doc, { headingCheck: { headingPct: 85, notHeadingMinutes: 3, notice: true, noticeEveryMin: 1 } }, zone);
  assert.deepEqual([back.riderCancel.headingPct, back.riderCancel.notHeadingMinutes], [85, 3]);
  const bad = rulesOfDispatch(doc, { headingCheck: { headingPct: 20, notHeadingMinutes: 0 } }, zone);
  assert.deepEqual([bad.riderCancel.headingPct, bad.riderCancel.notHeadingMinutes], [80, 2]);
  const none = rulesOfDispatch(doc, {}, zone);
  assert.deepEqual([none.riderCancel.headingPct, none.riderCancel.notHeadingMinutes], [80, 2]);
});
