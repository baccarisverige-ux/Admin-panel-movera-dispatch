import assert from "node:assert/strict";
import { test } from "node:test";
import { colouredZones, DRIVER_LEVEL_COLOR, driverSurgeLevel } from "./liveSurgeMap.ts";
import { controlBody, controlValueOf, isPendingApproval, parseControl } from "./dispatchControl.ts";
import type { ZoneSurge } from "../pricing/surge.ts";

test("driver surge levels follow contract.json#driverSurgeMap.levels", () => {
  assert.equal(driverSurgeLevel(1), null);
  assert.equal(driverSurgeLevel(1.1), "low");
  assert.equal(driverSurgeLevel(1.4), "low");
  assert.equal(driverSurgeLevel(1.5), "medium");
  assert.equal(driverSurgeLevel(2.5), "medium");
  assert.equal(driverSurgeLevel(2.6), "high");
  assert.equal(DRIVER_LEVEL_COLOR.medium, "#FF8A3D");
  const rows = [{ zoneId: "a", multiplier: 1 }, { zoneId: "b", multiplier: 1.8 }] as ZoneSurge[];
  assert.deepEqual(colouredZones(rows).map((row) => row.zoneId), ["b"]);
});

test("dispatch control: command to PUT body, answers parsed", () => {
  assert.deepEqual(controlValueOf("paused"), { paused: true, mode: null });
  assert.deepEqual(controlValueOf("rules"), { paused: false, mode: null });
  assert.equal(controlValueOf("x"), null);
  assert.deepEqual(controlBody(null, { paused: true, mode: null }, "Storm"), { expectedVersion: 0, paused: true, mode: null, note: "Storm" });
  assert.deepEqual(controlBody({ version: 4 }, { paused: false, mode: "radar" }), { expectedVersion: 4, paused: false, mode: "radar" });
  assert.deepEqual(parseControl({ zoneId: "Z001", paused: true, mode: null, version: 2 }), { zoneId: "Z001", paused: true, mode: null, version: 2 });
  assert.equal(parseControl({ zoneId: "Z001", paused: "yes", mode: null, version: 2 }), null);
  assert.equal(isPendingApproval({ status: "pending_approval", approvalId: "apr_1" }), true);
  assert.equal(isPendingApproval({ zoneId: "Z001" }), false);
});
