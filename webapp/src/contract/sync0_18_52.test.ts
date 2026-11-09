/**
 * Contract 0.18.52 sync (movera-contracts v0.18.52, §74 driverHome.offlineLocation): the admin carries the new copy.
 * §74 is a driver-app and server rule (never offline on a trip; the sender stops after a restored trip ends; the
 * server stores no offline no-trip fixes), so the admin changes nothing but its pin. Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));

// The exact pin moved to sync0_18_53.test.ts with the 0.18.53 copy; the §74 check below still holds.

test("§74 is in the copy: offline no-trip fixes are accepted 0 by the server", () => {
  assert.equal(C.driverHome.offlineLocation.server.accepted, 0);
});
