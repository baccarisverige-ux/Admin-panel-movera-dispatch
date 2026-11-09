/**
 * Contract 0.18.52 sync (movera-contracts v0.18.52, §74 driverHome.offlineLocation): the admin carries the new copy.
 * §74 is a driver-app and server rule (never offline on a trip; the sender stops after a restored trip ends; the
 * server stores no offline no-trip fixes), so the admin changes nothing but its pin. Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));

test("the admin pins the contract it carries (0.18.52)", () => {
  assert.equal(C.version, "0.18.52");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("§74 is in the copy: offline no-trip fixes are accepted 0 by the server", () => {
  assert.equal(C.driverHome.offlineLocation.server.accepted, 0);
});
