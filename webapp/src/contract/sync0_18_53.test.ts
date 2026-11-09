/**
 * Contract 0.18.53 sync (movera-contracts v0.18.53, §75 rider pushes that are always sent; support answers pushed):
 * the admin carries the new copy. §75 is a server and app rule (the push dispatcher; the rider's switch text; the
 * support deep link); the admin's reply route is unchanged, the push is a server side effect. Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));

test("the admin pins the contract it carries (0.18.53)", () => {
  assert.equal(C.version, "0.18.53");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("§75 is in the copy: a support answer pushes the ticket owner (kind support_reply)", () => {
  assert.equal(C.support.answerPush.kind, "support_reply");
  assert.ok(C.riderTripPush.consent.includes("driver_arrived"));
});
