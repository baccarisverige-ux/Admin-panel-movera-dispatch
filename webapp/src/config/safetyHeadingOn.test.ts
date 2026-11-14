import assert from "node:assert/strict";
import test from "node:test";
import { appConfigState, driverAppConfig } from "./appConfigs.ts";
import { withOwned } from "../live/configDocs.ts";
import { liveRules, publish } from "../dispatch/rules.ts";


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

test("4: headingCheck.on is the zone's Smart cancel check switch, and publishing sends it", () => {
  const base = appConfigState({ now: NOW });
  const zone = liveRules(base.dispatch, "Z001");
  assert.equal((driverAppConfig("Z001", base).headingCheck as Record<string, unknown>).on, true);
  const published = publish(base.dispatch, { Z001: { ...zone, riderCancel: { ...zone.riderCancel, on: false } } }, {}, ["Z001"], "nora", "2026-11-14T09:30:00.000Z", "");
  assert.ok(!published.error, published.error ?? "");
  assert.equal((driverAppConfig("Z001", { ...base, dispatch: published.book }).headingCheck as Record<string, unknown>).on, false);
  const server = { headingCheck: { on: true, headingPct: 80, notHeadingMinutes: 2, reassign: false } };
  const built = { headingCheck: { on: false, headingPct: 80, notHeadingMinutes: 2, reassign: false, notice: true, noticeEveryMin: 1 } };
  assert.equal((withOwned(server, built, ["headingCheck"]).headingCheck as Record<string, unknown>).on, false);
});
