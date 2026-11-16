import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { appConfigState, driverAppConfig, riderAppConfig } from "./appConfigs.ts";
import { CONFIG_DEFAULTS } from "./zoneDefaults.ts";
import { dispatchDocumentOf, patchChanged, rulesOfDispatch, type Doc } from "../live/configDocs.ts";
import { zoneDefault } from "../dispatch/rules.ts";
import { changeLines } from "../dispatch/rules/changes.ts";

/**
 * BQ-V21 (contract v0.18.115, contract.json#pickupSpots; owner full-audit Q6 2026-11-02 "Keep as 'approximate'" =>
 * admin on/off per zone (default on), Rules decisions/rider-g4-pickup.md:7). Rule 36: fails on main — no
 * pickupSpots in the Dispatch rules, the rider document or the read-back.
 */
const NOW = "2026-11-15T12:00:00Z";
type Booking = { pickupSpots?: { on: boolean } };

test("default on: the Dispatch rules and the rider document of every country carry booking.pickupSpots.on true", () => {
  const theirs = (contract.configDefaults as unknown as { pickupSpotsOn?: boolean }).pickupSpotsOn;
  assert.equal(CONFIG_DEFAULTS.pickupSpotsOn, theirs ?? true, "contract configDefaults.pickupSpotsOn (true) once the copy has it");
  assert.equal(CONFIG_DEFAULTS.pickupSpotsOn, true);
  for (const zoneId of ["Z001", "FR-PC", "TN-TC"]) {
    assert.deepEqual(zoneDefault(zoneId).pickupSpots, { on: true }, zoneId);
    assert.deepEqual((riderAppConfig(zoneId, appConfigState({ now: NOW })).booking as Booking).pickupSpots, { on: true }, zoneId);
  }
});

test("the driver document gets no pickupSpots (the driver app is not changed)", () => {
  assert.equal((driverAppConfig("Z001", appConfigState({ now: NOW })).booking as Booking).pickupSpots, undefined);
});

test("off for one zone: only the rider document's booking.pickupSpots changes, published over the server's document", () => {
  const zone = zoneDefault("Z001");
  const book = (on: boolean) => ({ ...zone, pickupSpots: { on } });
  const before = riderAppConfig("Z001", appConfigState({ now: NOW, dispatch: { live: { Z001: book(true) } } as never })) as unknown as Doc;
  const after = riderAppConfig("Z001", appConfigState({ now: NOW, dispatch: { live: { Z001: book(false) } } as never })) as unknown as Doc;
  assert.deepEqual((after["booking"] as Booking).pickupSpots, { on: false });
  const server: Doc = { zoneId: "Z001", booking: { maxStops: 3, minAheadMin: 20, pickupSpots: { on: true } }, tips: ["server"] };
  const sent = patchChanged(server, before, after, ["booking"]);
  assert.deepEqual((sent["booking"] as Booking).pickupSpots, { on: false });
  assert.equal((sent["booking"] as { minAheadMin: number }).minAheadMin, 20, "server-only booking fields stay");
  assert.deepEqual(sent["tips"], ["server"], "other parts stay the server's");
  const lines = changeLines(book(true), book(false));
  assert.equal(lines.length, 1, lines.join(" | "));
  assert.ok(lines[0]!.startsWith("Pickup entrance chips (approximate): "), lines[0]);
});

test("read back from the live rider document; a rider document without it (before v0.18.115) reads on", () => {
  const zone = zoneDefault("Z001");
  const doc = dispatchDocumentOf(zone, "Z001", null);
  assert.deepEqual(rulesOfDispatch(doc, null, zone, { booking: { pickupSpots: { on: false } } }).pickupSpots, { on: false });
  assert.deepEqual(rulesOfDispatch(doc, null, { ...zone, pickupSpots: { on: false } }, { booking: { maxStops: 3 } }).pickupSpots, { on: true });
  assert.deepEqual(rulesOfDispatch(doc, null, { ...zone, pickupSpots: { on: false } }).pickupSpots, { on: false }, "no rider document read: the rules keep their value");
});
