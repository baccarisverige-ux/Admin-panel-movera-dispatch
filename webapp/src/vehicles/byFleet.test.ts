import { test } from "node:test";
import assert from "node:assert/strict";
import { OWN_CAR, fleetGroups, inFleet } from "./byFleet.ts";

const fleets = [{ id: "f1", name: "Flotte Ahmed K.", ownerId: "o1" }, { id: "f2", name: "Flotte Sara L.", ownerId: "o2" }];
const rows = [
  { fleetId: "f2", driverId: "d9" },
  { fleetId: "f1", driverId: "d1" },
  { fleetId: "f1", driverId: "d2" },
  { fleetId: "f1", driverId: null },
  { fleetId: null, driverId: "d5" },
];

test("vehicles by fleet: one group per fleet, biggest first, own cars last", () => {
  const groups = fleetGroups(rows, fleets);
  assert.deepEqual(groups.map((g) => g.key), ["f1", "f2", OWN_CAR]);
  assert.deepEqual(groups[0], { key: "f1", fleetId: "f1", name: "Flotte Ahmed K.", ownerId: "o1", cars: 3, drivers: 2 });
  assert.equal(groups[2]!.fleetId, null);
});

test("vehicles by fleet: same size sorts A to Z; unknown fleet shows its id", () => {
  const groups = fleetGroups([{ fleetId: "zz", driverId: null }, { fleetId: "f2", driverId: null }], fleets);
  assert.deepEqual(groups.map((g) => g.name), ["Flotte Sara L.", "zz"]);
});

test("vehicles by fleet: the Flotte filter keeps one fleet or the own cars", () => {
  assert.equal(rows.filter((r) => inFleet(r, "")).length, 5);
  assert.equal(rows.filter((r) => inFleet(r, "f1")).length, 3);
  assert.equal(rows.filter((r) => inFleet(r, OWN_CAR)).length, 1);
});
