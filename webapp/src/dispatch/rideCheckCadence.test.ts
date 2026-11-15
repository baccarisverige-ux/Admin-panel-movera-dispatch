import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { appConfigState, driverAppConfig } from "../config/appConfigs.ts";
import { rulesOfDispatch, withOwned, dispatchDocumentOf } from "../live/configDocs.ts";
import { defaultZone, liveRules, publish, RIDE_CHECK_LIMITS, rideCheckDefault } from "./rules.ts";
import { completeRideCheck, rideCheckIssues } from "./rules/defaults.ts";
import { changeLines } from "./rules/changes.ts";
import { en } from "../i18n/en.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";

/**
 * BQ-V37 (contract v0.18.100, contract.json#onTrip.rideCheck.detection.cadence; owner Sitting W1 Q66 "Yes" = Q-B6
 * "Ride check at most every 30 s per trip instead of after every GPS batch", an admin setting; Rules
 * audits/global-plan-2026-11-08/START-HERE.md:350, decisions/session-2026-11-06.md:960): Dispatch › Safety › Ride check
 * sets, per zone, how often at most the server looks at a trip's GPS (DriverAppConfig.rideCheck.scanEverySeconds,
 * default 30 s, 10–60; owner 2026-11-15: the highest allowed value is 60 s).
 */
const NOW = "2026-11-14T10:00:00Z";
const completeRideCheckOf = (stored: unknown) => completeRideCheck(rideCheckDefault(), stored).scanEverySeconds;
const zone = () => defaultZone({ id: "Z001", kind: "operating" });

test("V37: default 30 s and range 10–60 are the contract's; every zone starts with 30", () => {
  assert.equal(contract.configDefaults.rideCheck.scanEverySeconds, 30);
  assert.deepEqual(contract.onTrip.rideCheck.settings.ranges.scanEverySeconds, [10, 60]);
  assert.equal(rideCheckDefault().scanEverySeconds, 30);
  assert.deepEqual([RIDE_CHECK_LIMITS.scanEverySeconds.min, RIDE_CHECK_LIMITS.scanEverySeconds.max], [10, 60]);
  assert.equal(zone().rideCheck.scanEverySeconds, 30);
});

test("V37: it goes out in the zone's driver document; a published change sends the zone's own number (per zone)", () => {
  const base = appConfigState({ now: NOW });
  assert.equal((driverAppConfig("Z001", base).rideCheck as Record<string, unknown>)["scanEverySeconds"], 30);
  const z = liveRules(base.dispatch, "Z001");
  const published = publish(base.dispatch, { Z001: { ...z, rideCheck: { ...z.rideCheck, scanEverySeconds: 60 } } }, {}, ["Z001"], "nora", "2026-11-14T09:30:00.000Z", "");
  assert.ok(!published.error, published.error ?? "");
  const next = { ...base, dispatch: published.book };
  assert.equal((driverAppConfig("Z001", next).rideCheck as Record<string, unknown>)["scanEverySeconds"], 60);
  assert.equal((driverAppConfig("FR-PC", next).rideCheck as Record<string, unknown>)["scanEverySeconds"], 30, "another zone keeps its own");
  const server = { rideCheck: { on: true, scanEverySeconds: 30 } };
  const merged = withOwned(server, { rideCheck: { on: true, scanEverySeconds: 45 } }, ["rideCheck"]) as { rideCheck: Record<string, unknown> };
  assert.equal(merged.rideCheck["scanEverySeconds"], 45);
});

test("V37: read back from the server's driver document; missing or outside 10–60 shows 30 (as the server reads it)", () => {
  const doc = dispatchDocumentOf(zone(), "Z001", null);
  assert.equal(rulesOfDispatch(doc, { rideCheck: { scanEverySeconds: 45 } }, zone()).rideCheck.scanEverySeconds, 45);
  for (const bad of [5, 61, 120, 121, "30", null]) assert.equal(rulesOfDispatch(doc, { rideCheck: { scanEverySeconds: bad } }, zone()).rideCheck.scanEverySeconds, 30, String(bad));
  assert.equal(rulesOfDispatch(doc, { rideCheck: {} }, zone()).rideCheck.scanEverySeconds, 30);
});

test("V37: Publish checks the range; the change list names the field; texts in sv / fr / en", () => {
  const ok = rideCheckDefault();
  assert.deepEqual(rideCheckIssues(ok), []);
  assert.equal(rideCheckIssues({ ...ok, scanEverySeconds: 5 }).length, 1);
  // owner 2026-11-15: 60 s is the highest allowed value; 61 is refused at Publish.
  assert.equal(rideCheckIssues({ ...ok, scanEverySeconds: 61 }).length, 1);
  assert.equal(rideCheckIssues({ ...ok, scanEverySeconds: 120 }).length, 1);
  assert.equal(rideCheckIssues({ ...ok, scanEverySeconds: 60 }).length, 0);
  assert.deepEqual(rideCheckIssues({ ...ok, scanEverySeconds: 61 }), ["Ride check: check the GPS at most every must be 10 to 60 s."]);
  const before = zone();
  const lines = changeLines(before, { ...before, rideCheck: { ...before.rideCheck, scanEverySeconds: 45 } });
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /^Check the GPS at most every \(s\)/);
  const stored = { ...ok, scanEverySeconds: 50 };
  assert.equal(completeRideCheckOf(stored), 50, "a saved zone keeps its own number");
  for (const key of ["Check the GPS at most every", "Check the GPS at most every (s)", "Ride check: check the GPS at most every must be 10 to 60 s."]) {
    for (const [name, dict] of [["en", en], ["sv", sv], ["fr", fr]] as const) {
      const text = (dict as Record<string, string>)[key];
      assert.ok(text && text.trim(), `${name}: ${key}`);
      if (name !== "en") assert.notEqual(text, key, `${name} is translated: ${key}`);
    }
  }
});
