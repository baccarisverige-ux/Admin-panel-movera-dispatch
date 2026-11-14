import assert from "node:assert/strict";
import test from "node:test";
import { appConfigState, riderAppConfig } from "./appConfigs.ts";
import { cancelDecision, zoneDefault, zoneIssues } from "../dispatch/rules.ts";


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

test("3: no came-closer setting — not in the zone, not sent to the rider app, not checked", () => {
  const zone = zoneDefault("Z001");
  assert.ok(!("closerPct" in zone.riderCancel));
  const rider = riderAppConfig("Z001", appConfigState({ now: NOW })) as Record<string, unknown>;
  const check = rider.cancelCheck as Record<string, unknown> | undefined;
  assert.ok(!check || !("closerPct" in check), JSON.stringify(check));
  assert.ok(!zoneIssues(zone).some((issue) => issue.includes("came closer")));
});

test("3: Cancel checks decide with the heading rule (80 % of what the road allowed), not a came-closer %", () => {
  const zone = zoneDefault("Z001");
  const record = (atCancelKm: number) => ({ id: "c", tripId: "t", zoneId: "Z001", rider: "r", driverId: "d", driver: "d", acceptedAt: "", cancelledAt: "", minutesAfterAccept: 5, atAccept: { km: 5, etaMin: 10 }, atCancel: { km: atCancelKm, etaMin: 6 }, path: [], pickup: [0, 0] as [number, number], category: "economy", fare: 200 });
  // Road speed 0.5 km/min × 5 min = 2.5 km possible. 2.1 km closer = 84 % → heading → fee; 1.5 km = 60 % → not heading → free.
  const heading = cancelDecision(record(2.9) as never, zone);
  assert.equal(heading.fee, true, heading.why);
  assert.equal(heading.headingShare, 84);
  const slow = cancelDecision(record(3.5) as never, zone);
  assert.equal(slow.fee, false, slow.why);
  assert.equal(slow.headingShare, 60);
  // Admin 50 %: the slow one is heading too.
  assert.equal(cancelDecision(record(3.5) as never, { ...zone, riderCancel: { ...zone.riderCancel, headingPct: 50 } }).fee, true);
});
