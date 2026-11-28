import assert from "node:assert/strict";
import test from "node:test";
import { appConfigState, driverAppConfig, riderAppConfig } from "./appConfigs.ts";
import { emptyConfig, setSwitch } from "./book.ts";
import { zoneDefault } from "../dispatch/rules.ts";

/**
 * G2 (Rules audits/impact/trip-pin-check-2026-11-27.md): the rider document's features.pin follows the zone's
 * Dispatch "Rider PIN before Start" switch (pickupPin.required), like shareTrip. Fails on main: features.pin came
 * from the separate Settings feature switch and could disagree with the trip switch.
 */
const NOW = "2026-11-28T08:00:00Z";
const withPin = (zoneId: string, required: boolean, extra: object = {}) => {
  const zone = zoneDefault(zoneId);
  return appConfigState({ now: NOW, dispatch: { live: { [zoneId]: { ...zone, pickupPin: { ...zone.pickupPin, required } } } } as never, ...extra });
};

test("G2 default (switch off): features.pin is false in every country, the same as pickupPin.required", () => {
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) {
    const state = appConfigState({ now: NOW });
    assert.equal(driverAppConfig(zoneId, state).pickupPin.required, false, zoneId);
    assert.equal(riderAppConfig(zoneId, state).features.pin, false, zoneId);
  }
});

test("G2 switch on in one zone: features.pin is true there and only there", () => {
  const state = withPin("Z001", true);
  assert.equal(driverAppConfig("Z001", state).pickupPin.required, true);
  assert.equal(riderAppConfig("Z001", state).features.pin, true);
  assert.equal(riderAppConfig("Z002", state).features.pin, false);
});

test("G2 the old Settings feature switch no longer decides features.pin", () => {
  const config = emptyConfig("nora");
  for (const on of [true, false]) {
    const set = setSwitch(config, "pin", on, "nora");
    const published = { config: { ...set, published: set.draft } };
    assert.equal(riderAppConfig("Z001", withPin("Z001", false, published)).features.pin, false, `settings ${on}, zone off`);
    assert.equal(riderAppConfig("Z001", withPin("Z001", true, published)).features.pin, true, `settings ${on}, zone on`);
  }
});
