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

test("defaults are 3 km and 2 min", () => {
  const value = emptyRideCheckSettings();
  assert.equal(value.finishFarFromDropoffKm, 3);
  assert.equal(value.longStopMinutes, 2);
  assert.deepEqual(rideCheckSettingsIssues(value), []);
});

test("validation: km > 0, minutes >= 1", () => {
  assert.equal(rideCheckSettingsIssues({ finishFarFromDropoffKm: 0, longStopMinutes: 5 }).length, 1);
  assert.equal(rideCheckSettingsIssues({ finishFarFromDropoffKm: -1, longStopMinutes: 5 }).length, 1);
  assert.equal(rideCheckSettingsIssues({ finishFarFromDropoffKm: Number.NaN, longStopMinutes: 5 }).length, 1);
  assert.equal(rideCheckSettingsIssues({ finishFarFromDropoffKm: 0.5, longStopMinutes: 1 }).length, 0);
  assert.equal(rideCheckSettingsIssues({ finishFarFromDropoffKm: 3, longStopMinutes: 0.5 }).length, 1);
  assert.equal(rideCheckSettingsIssues({ finishFarFromDropoffKm: 3, longStopMinutes: 0 }).length, 1);
  assert.equal(rideCheckSettingsIssues({ finishFarFromDropoffKm: 0, longStopMinutes: 0 }).length, 2);
});

test("save bumps the revision and refuses values that are not valid", () => {
  const current = emptyRideCheckSettings();
  const saved = saveRideCheckSettings(current, { finishFarFromDropoffKm: 5, longStopMinutes: 10 });
  assert.deepEqual(saved, { value: { draftRev: 2, finishFarFromDropoffKm: 5, longStopMinutes: 10 }, issues: [] });
  const refused = saveRideCheckSettings(current, { finishFarFromDropoffKm: 0, longStopMinutes: 10 });
  assert.equal(refused.value, current);
  assert.equal(refused.issues.length, 1);
});

test("stored values: missing or broken fall back to the defaults", () => {
  assert.deepEqual(normalizeRideCheckSettings(undefined), emptyRideCheckSettings());
  assert.deepEqual(normalizeRideCheckSettings({ draftRev: 4, finishFarFromDropoffKm: 7, longStopMinutes: 12 }), { draftRev: 4, finishFarFromDropoffKm: 7, longStopMinutes: 12 });
  assert.deepEqual(normalizeRideCheckSettings({ draftRev: 3, finishFarFromDropoffKm: 0, longStopMinutes: "9" }), { draftRev: 3, finishFarFromDropoffKm: 3, longStopMinutes: 2 });
});

test("the trigger engine uses the thresholds", () => {
  const settings = { finishFarFromDropoffKm: 3, longStopMinutes: 5 };
  assert.equal(finishedFarFromDropoff(3, settings), false, "exactly X km does not start it");
  assert.equal(finishedFarFromDropoff(3.1, settings), true);
  assert.equal(finishedFarFromDropoff(3.1, { ...settings, finishFarFromDropoffKm: 5 }), false, "a higher X moves the line");
  assert.equal(unexpectedLongStop(5, settings), false, "exactly Y minutes does not start it");
  assert.equal(unexpectedLongStop(6, settings), true);
  assert.equal(unexpectedLongStop(6, { ...settings, longStopMinutes: 10 }), false);

  const dropoff = { lat: 59.3326, lng: 18.0649 };
  const near = { lat: 59.3326, lng: 18.0649 + 0.02 }; // about 1.1 km east
  const far = { lat: 59.3326 + 0.04, lng: 18.0649 }; // about 4.4 km north
  assert.ok(Math.abs(distanceKm(dropoff, far) - 4.45) < 0.05);
  assert.equal(rideCheckFor({ kind: "finish", at: near, dropoff }, settings), null);
  const farCheck = rideCheckFor({ kind: "finish", at: far, dropoff }, settings);
  assert.equal(farCheck?.trigger, "far");
  assert.ok(farCheck && farCheck.value > 4400 && farCheck.value < 4500, "stores metres from the drop-off");
  assert.equal(rideCheckFor({ kind: "finish", at: far, dropoff }, { ...settings, finishFarFromDropoffKm: 5 }), null);
  assert.equal(rideCheckFor({ kind: "finish", at: far, dropoff }, settings, { farOn: false, stopOn: true }), null, "zone switch off");

  assert.deepEqual(rideCheckFor({ kind: "stop", minutes: 7 }, settings), { trigger: "stop", value: 7 });
  assert.equal(rideCheckFor({ kind: "stop", minutes: 4 }, settings), null, "no hard-coded 4 minutes");
  assert.equal(rideCheckFor({ kind: "stop", minutes: 7 }, { ...settings, longStopMinutes: 10 }), null);
  assert.equal(rideCheckFor({ kind: "stop", minutes: 30, plannedStop: true }, settings), null);
  assert.equal(rideCheckFor({ kind: "stop", minutes: 30, inTraffic: true }, settings), null);
  assert.equal(rideCheckFor({ kind: "stop", minutes: 30 }, settings, { farOn: true, stopOn: false }), null);
});

test("with the defaults: a stop over 2 min mid-trip, a finish over 3 km from the drop-off", () => {
  const defaults = RIDE_CHECK_SETTINGS_DEFAULT;
  assert.equal(rideCheckFor({ kind: "stop", minutes: 2 }, defaults), null, "exactly 2 min does not start it");
  assert.deepEqual(rideCheckFor({ kind: "stop", minutes: 2.5 }, defaults)?.trigger, "stop");
  assert.deepEqual(rideCheckFor({ kind: "stop", minutes: 3 }, defaults), { trigger: "stop", value: 3 });
  assert.equal(rideCheckFor({ kind: "stop", minutes: 3, plannedStop: true }, defaults), null);
  assert.equal(rideCheckFor({ kind: "stop", minutes: 3, inTraffic: true }, defaults), null);
  const dropoff = { lat: 59.3326, lng: 18.0649 };
  assert.equal(rideCheckFor({ kind: "finish", at: { lat: 59.3326 + 0.02, lng: 18.0649 }, dropoff }, defaults), null, "about 2.2 km");
  assert.equal(rideCheckFor({ kind: "finish", at: { lat: 59.3326 + 0.04, lng: 18.0649 }, dropoff }, defaults)?.trigger, "far", "about 4.4 km");
});

test("the rules file gives the apps the shared thresholds", () => {
  assert.deepEqual(rulesFile(emptyDispatchBook(), "SE", "now", { finishFarFromDropoffKm: 4, longStopMinutes: 8 }).rideCheckThresholds, { finishFarFromDropoffKm: 4, longStopMinutes: 8 });
});

test("one shared store: a save from any entry point is what every reader gets", async () => {
  const api = signedInFixture(createFixtureAdminApi(0));
  await api.reset();
  const command = async (value: RideCheckSettings, extra: Partial<CommandInput> = {}) =>
    api.command({ action: "admin.rideCheck.settings", targetId: "ride check settings", sliceKey: RIDE_CHECK_SETTINGS_KEY, value, expectedSliceRev: 1, actorId: "erik", reason: "Test", before: "3 km, 2 min", after: "5 km, 10 min", idempotencyKey: crypto.randomUUID(), expectedRev: await api.revision(), ...extra });
  const next = saveRideCheckSettings(emptyRideCheckSettings(), { finishFarFromDropoffKm: 5, longStopMinutes: 10 }).value;
  await assert.rejects(command(next, { actorId: "daniel" }), "a dispatcher cannot change them");
  await command(next);
  const read = normalizeRideCheckSettings(await api.readSlice(RIDE_CHECK_SETTINGS_KEY, emptyRideCheckSettings()));
  assert.deepEqual(read, { draftRev: 2, finishFarFromDropoffKm: 5, longStopMinutes: 10 });
  await assert.rejects(command(next), "a stale revision is refused");
});
