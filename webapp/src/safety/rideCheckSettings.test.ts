import { test } from "node:test";
import assert from "node:assert/strict";
import { createFixtureAdminApi, type CommandInput } from "../api/create.ts";
import { signedInFixture } from "../api/fixtureSession.ts";
import { rulesFile, emptyDispatchBook } from "../dispatch/rules.ts";
import {
  RIDE_CHECK_SETTINGS_DEFAULT,
  RIDE_CHECK_SETTINGS_KEY,
  distanceKm,
  emptyRideCheckSettings,
  finishedFarFromDropoff,
  normalizeRideCheckSettings,
  rideCheckFor,
  rideCheckSettingsIssues,
  saveRideCheckSettings,
  unexpectedLongStop,
  type RideCheckSettings,
} from "./rideCheckSettings.ts";

test("default is 2 min; the retired finishFarFromDropoffKm is gone", () => {
  const value = emptyRideCheckSettings();
  assert.deepEqual(value, { draftRev: 1, longStopMinutes: 2 });
  assert.ok(!("finishFarFromDropoffKm" in value));
  assert.deepEqual(rideCheckSettingsIssues(value), []);
});

test("validation: minutes >= 1", () => {
  assert.equal(rideCheckSettingsIssues({ longStopMinutes: 1 }).length, 0);
  assert.equal(rideCheckSettingsIssues({ longStopMinutes: 0.5 }).length, 1);
  assert.equal(rideCheckSettingsIssues({ longStopMinutes: 0 }).length, 1);
  assert.equal(rideCheckSettingsIssues({ longStopMinutes: Number.NaN }).length, 1);
});

test("save bumps the revision and refuses values that are not valid", () => {
  const current = emptyRideCheckSettings();
  const saved = saveRideCheckSettings(current, { longStopMinutes: 10 });
  assert.deepEqual(saved, { value: { draftRev: 2, longStopMinutes: 10 }, issues: [] });
  const refused = saveRideCheckSettings(current, { longStopMinutes: 0 });
  assert.equal(refused.value, current);
  assert.equal(refused.issues.length, 1);
});

test("stored values: missing or broken fall back to the defaults; an old finishFarFromDropoffKm is dropped", () => {
  assert.deepEqual(normalizeRideCheckSettings(undefined), emptyRideCheckSettings());
  assert.deepEqual(normalizeRideCheckSettings({ draftRev: 4, finishFarFromDropoffKm: 7, longStopMinutes: 12 }), { draftRev: 4, longStopMinutes: 12 });
  assert.deepEqual(normalizeRideCheckSettings({ draftRev: 3, longStopMinutes: "9" }), { draftRev: 3, longStopMinutes: 2 });
});

test("the trigger engine: the zone's endFarMeters for a far finish, the shared minutes for a stop", () => {
  const settings = { longStopMinutes: 5 };
  assert.equal(finishedFarFromDropoff(0.5, 500), false, "exactly endFarMeters does not start it");
  assert.equal(finishedFarFromDropoff(0.6, 500), true);
  assert.equal(finishedFarFromDropoff(0.6, 800), false, "a higher endFarMeters moves the line");
  assert.equal(unexpectedLongStop(5, settings), false, "exactly Y minutes does not start it");
  assert.equal(unexpectedLongStop(6, settings), true);
  assert.equal(unexpectedLongStop(6, { longStopMinutes: 10 }), false);

  const dropoff = { lat: 59.3326, lng: 18.0649 };
  const near = { lat: 59.3326, lng: 18.0649 + 0.005 }; // about 280 m east
  const far = { lat: 59.3326 + 0.04, lng: 18.0649 }; // about 4.4 km north
  assert.ok(Math.abs(distanceKm(dropoff, far) - 4.45) < 0.05);
  assert.equal(rideCheckFor({ kind: "finish", at: near, dropoff }, settings), null);
  const farCheck = rideCheckFor({ kind: "finish", at: far, dropoff }, settings);
  assert.equal(farCheck?.trigger, "far");
  assert.ok(farCheck && farCheck.value > 4400 && farCheck.value < 4500, "stores metres from the drop-off");
  assert.equal(rideCheckFor({ kind: "finish", at: far, dropoff }, settings, { farOn: true, stopOn: true, endFarMeters: 5000 }), null);
  assert.equal(rideCheckFor({ kind: "finish", at: far, dropoff }, settings, { farOn: false, stopOn: true, endFarMeters: 500 }), null, "zone switch off");

  assert.deepEqual(rideCheckFor({ kind: "stop", minutes: 7 }, settings), { trigger: "stop", value: 7 });
  assert.equal(rideCheckFor({ kind: "stop", minutes: 4 }, settings), null, "no hard-coded 4 minutes");
  assert.equal(rideCheckFor({ kind: "stop", minutes: 7 }, { longStopMinutes: 10 }), null);
  assert.equal(rideCheckFor({ kind: "stop", minutes: 30, plannedStop: true }, settings), null);
  assert.equal(rideCheckFor({ kind: "stop", minutes: 30, inTraffic: true }, settings), null);
  assert.equal(rideCheckFor({ kind: "stop", minutes: 30 }, settings, { farOn: true, stopOn: false, endFarMeters: 500 }), null);
});

test("with the defaults: a stop over 2 min mid-trip, a finish over 500 m from the drop-off", () => {
  const defaults = RIDE_CHECK_SETTINGS_DEFAULT;
  assert.equal(rideCheckFor({ kind: "stop", minutes: 2 }, defaults), null, "exactly 2 min does not start it");
  assert.deepEqual(rideCheckFor({ kind: "stop", minutes: 3 }, defaults), { trigger: "stop", value: 3 });
  const dropoff = { lat: 59.3326, lng: 18.0649 };
  assert.equal(rideCheckFor({ kind: "finish", at: { lat: 59.3326 + 0.004, lng: 18.0649 }, dropoff }, defaults), null, "about 450 m");
  assert.equal(rideCheckFor({ kind: "finish", at: { lat: 59.3326 + 0.006, lng: 18.0649 }, dropoff }, defaults)?.trigger, "far", "about 670 m");
});

test("the rules file gives the apps only the shared minutes", () => {
  assert.deepEqual(rulesFile(emptyDispatchBook(), "SE", "now", { longStopMinutes: 8 }).rideCheckThresholds, { longStopMinutes: 8 });
});

test("one shared store: a save from any entry point is what every reader gets", async () => {
  const api = signedInFixture(createFixtureAdminApi(0));
  await api.reset();
  const command = async (value: RideCheckSettings, extra: Partial<CommandInput> = {}) =>
    api.command({ action: "admin.rideCheck.settings", targetId: "ride check settings", sliceKey: RIDE_CHECK_SETTINGS_KEY, value, expectedSliceRev: 1, actorId: "erik", reason: "Test", before: "2 min", after: "10 min", idempotencyKey: crypto.randomUUID(), expectedRev: await api.revision(), ...extra });
  const next = saveRideCheckSettings(emptyRideCheckSettings(), { longStopMinutes: 10 }).value;
  await assert.rejects(command(next, { actorId: "daniel" }), "a dispatcher cannot change them");
  await command(next);
  const read = normalizeRideCheckSettings(await api.readSlice(RIDE_CHECK_SETTINGS_KEY, emptyRideCheckSettings()));
  assert.deepEqual(read, { draftRev: 2, longStopMinutes: 10 });
  await assert.rejects(command(next), "a stale revision is refused");
});
