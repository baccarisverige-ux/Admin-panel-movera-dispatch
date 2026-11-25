import assert from "node:assert/strict";
import test from "node:test";
import { dispatchDocumentOf, rulesOfDispatch, type Doc } from "../live/configDocs.ts";
import { zoneDefault } from "../dispatch/rules.ts";
import { changeLines } from "../dispatch/rules/changes.ts";
import { liveTrafficOf, RECALL_DEFAULTS } from "../dispatch/rules/liveTraffic.ts";
import { DISPATCH_ZONE_INFO } from "../ui/settingInfo/dispatchZone.ts";
import { en } from "../i18n/en.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";

/**
 * v0.18.163 (contract.json#liveTraffic.setting / recall; owner 2026-11-25 "Google trafic réel", then "the cheapest
 * method"): Dispatch › Rides "Live traffic (Google)" with the three re-call thresholds. Rule 36: fails on main.
 */
test("not set: on in SE and FR, off in TN, default thresholds 200 m / 30 s / 5 min; nothing published", () => {
  assert.deepEqual(RECALL_DEFAULTS, { offRouteMeters: 200, offRouteSeconds: 30, behindMinutes: 5 });
  assert.equal(liveTrafficOf(zoneDefault("Z001"), "SE").on, true);
  assert.equal(liveTrafficOf(zoneDefault("FR-PC"), "FR").on, true);
  assert.equal(liveTrafficOf(zoneDefault("TN-TC"), "TN").on, false);
  assert.equal((dispatchDocumentOf(zoneDefault("Z001"), "Z001", null) as Doc)["liveTraffic"], undefined);
});

test("the admin's value is published and read back; a bad threshold reads as its default", () => {
  const zone = { ...zoneDefault("Z001"), liveTraffic: { on: false, offRouteMeters: 300, offRouteSeconds: 45, behindMinutes: 8 } };
  const doc = dispatchDocumentOf(zone, "Z001", null) as Doc;
  assert.deepEqual(doc["liveTraffic"], { on: false, offRouteMeters: 300, offRouteSeconds: 45, behindMinutes: 8 });
  assert.deepEqual(rulesOfDispatch(doc, null, zoneDefault("Z001")).liveTraffic, zone.liveTraffic);
  const bad = rulesOfDispatch({ ...doc, liveTraffic: { on: true, offRouteMeters: 5 } }, null, zoneDefault("Z001")).liveTraffic;
  assert.deepEqual(bad, { on: true, offRouteMeters: 200, offRouteSeconds: 30, behindMinutes: 5 });
  assert.equal(rulesOfDispatch({ ...doc, liveTraffic: undefined }, null, zoneDefault("Z001")).liveTraffic, undefined);
});

test("i texts, change history label and sv/fr texts", () => {
  for (const key of ["dispatch.zone.liveTraffic", "dispatch.zone.liveTrafficOffRoute", "dispatch.zone.liveTrafficBehind"]) assert.ok((DISPATCH_ZONE_INFO as Record<string, unknown>)[key], key);
  const before = zoneDefault("Z001");
  const lines = changeLines(before, { ...before, liveTraffic: { on: false, ...RECALL_DEFAULTS } });
  assert.ok(JSON.stringify(lines).includes("Live traffic (Google)"), JSON.stringify(lines));
  for (const k of Object.keys(en).filter((k) => k.includes("Google"))) {
    assert.ok((sv as Record<string, string>)[k], "sv " + k);
    assert.ok((fr as Record<string, string>)[k], "fr " + k);
  }
});
