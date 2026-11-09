/**
 * Contract 0.18.53 sync (movera-contracts v0.18.53, §75 rider pushes that are always sent; support answers pushed):
 * the admin carries the new copy. §75 is a server and app rule (the push dispatcher; the rider's switch text; the
 * support deep link); the admin's reply route is unchanged, the push is a server side effect. Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));

// The exact pin moved to sync0_18_54.test.ts with the 0.18.54 copy; the §75 check below still holds.

test("§75 is in the copy: a support answer pushes the ticket owner (kind support_reply)", () => {
  assert.equal(C.support.answerPush.kind, "support_reply");
  assert.ok(C.riderTripPush.consent.includes("driver_arrived"));
});
