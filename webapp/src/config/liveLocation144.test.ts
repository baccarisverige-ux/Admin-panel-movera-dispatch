import assert from "node:assert/strict";
import test from "node:test";
import { appConfigState, driverAppConfig, riderAppConfig } from "./appConfigs.ts";
import { CONFIG_DEFAULTS } from "./zoneDefaults.ts";
import { OWNED, dispatchDocumentOf, dispatchOwnedFor, patchChanged, rulesOfDispatch, type Doc } from "../live/configDocs.ts";
import { zoneDefault } from "../dispatch/rules.ts";
import { changeLines } from "../dispatch/rules/changes.ts";

/**
 * v0.18.144 (owner 2026-11-20; contract.json#liveLocation.setting): Dispatch › Safety "Live location": the rider
 * document's liveLocation { share, adjustPickupMeters }. Default OFF (supervisor 2026-11-20: until the load test
 * passes), banner from 30 m. Rule 36: fails on main (no liveLocation anywhere).
 */
const NOW = "2026-11-20T08:00:00Z";
type RiderDoc = { liveLocation?: { share: boolean; adjustPickupMeters: number } };
const rider = (zoneId: string, live?: { share: boolean; adjustPickupMeters: number }) => {
  const zone = zoneDefault(zoneId);
  const state = live === undefined ? appConfigState({ now: NOW }) : appConfigState({ now: NOW, dispatch: { live: { [zoneId]: { ...zone, liveLocation: live } } } as never });
  return riderAppConfig(zoneId, state) as unknown as RiderDoc & Doc;
};

test("default OFF, banner from 30 m, in every country; the driver document gets nothing", () => {
  assert.equal(CONFIG_DEFAULTS.liveLocationShare, false);
  assert.equal(CONFIG_DEFAULTS.adjustPickupMeters, 30);
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) {
    assert.deepEqual(zoneDefault(zoneId).liveLocation, { share: false, adjustPickupMeters: 30 }, zoneId);
    assert.deepEqual(rider(zoneId).liveLocation, { share: false, adjustPickupMeters: 30 }, zoneId);
  }
  assert.equal((driverAppConfig("Z001", appConfigState({ now: NOW })) as unknown as Doc)["liveLocation"], undefined);
});

test("save: on for one zone is published as the rider document's liveLocation, and the change line names it", () => {
  assert.ok(OWNED.dispatch.rider.includes("liveLocation"));
  assert.ok(!dispatchOwnedFor(false).rider.includes("liveLocation"), "not written when the rider document could not be read");
  const before = rider("Z001", { share: false, adjustPickupMeters: 30 });
  const after = rider("Z001", { share: true, adjustPickupMeters: 60 });
  const sent = patchChanged({ zoneId: "Z001", tips: ["server"] }, before, after, OWNED.dispatch.rider);
  assert.deepEqual(sent["liveLocation"], { share: true, adjustPickupMeters: 60 });
  assert.deepEqual(sent["tips"], ["server"]);
  const lines = changeLines({ ...zoneDefault("Z001") }, { ...zoneDefault("Z001"), liveLocation: { share: true, adjustPickupMeters: 30 } });
  assert.equal(lines.length, 1, lines.join(" | "));
  assert.ok(lines[0]!.startsWith("Riders and drivers can share their live location: "), lines[0]);
});

test("read back from the rider document as the server serves it", () => {
  const zone = zoneDefault("Z001");
  const doc = dispatchDocumentOf(zone, "Z001", null);
  const read = (riderDoc: Doc | null, start = zone) => rulesOfDispatch(doc, null, start, riderDoc).liveLocation;
  assert.deepEqual(read({ liveLocation: { share: true, adjustPickupMeters: 45, sendEverySeconds: 8 } }), { share: true, adjustPickupMeters: 45 });
  assert.deepEqual(read({}), { share: false, adjustPickupMeters: 30 }, "never saved: off, 30 m");
  assert.deepEqual(read({ liveLocation: { share: "x", adjustPickupMeters: 9000 } }), { share: false, adjustPickupMeters: 30 }, "bad values: the defaults");
  assert.deepEqual(read({ liveLocation: { share: true, adjustPickupMeters: 0 } }), { share: true, adjustPickupMeters: 0 }, "0 = the banner is off");
  assert.deepEqual(read({ liveLocation: { share: true, adjustPickupMeters: 5 } }), { share: true, adjustPickupMeters: 30 }, "5 m is not allowed: the default");
  assert.deepEqual(read(null, { ...zone, liveLocation: { share: true, adjustPickupMeters: 50 } }), { share: true, adjustPickupMeters: 50 }, "no rider document read: the rules keep their value");
});
