/**
 * Contract 0.18.88 copy (movera-contracts v0.18.88 30b726e #131: no fleet-owner % anywhere, commission card results in
 * amounts only), taken with the fleet-admin job (owner 2026-10-29, Rules decisions/driver-g10.md:3 "Movera dont care
 * about what fleet owner take from drivers! We just send payout to owner fleet and if there is any % u delete that";
 * owner 2026-11-14 "simply write only how much in amount driver get and how much movera get in amount dont write any
 * percentage"). 0.18.87 (BQ-M19, bonus outside commission) comes with it; it is wording for the admin. Rule 36.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));

test("the admin pins the contract it carries (0.18.88)", () => {
  assert.equal(C.version, "0.18.88");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("0.18.88 fleetPayoutWhole: no fleet-owner %; fleetCommissionPct stays removed and is ignored", () => {
  assert.ok(C.fleetPayoutWhole, "contract.json#fleetPayoutWhole is in the copy");
  assert.ok(C.fleetShareRemoved, "fleetShareRemoved (v0.18.13) still there");
  assert.match(C.fleetPayoutWhole.pricing, /fleetCommissionPct: REMOVED/);
  assert.match(C.fleetPayoutWhole.pricing, /IGNORED/);
  assert.match(C.fleetPayoutWhole.apps, /Admin: no fleet-owner % anywhere/);
});

test("0.18.88 commission calculator: two amount lines only; the limit rows and the cap note are removed", () => {
  const calc = C.commissionSteps.adminCalculator;
  assert.match(calc.rule, /AMOUNTS ONLY/);
  assert.match(calc.removed, /REMOVED/);
  assert.equal("capNote" in C.commissionSteps.texts, false);
});

test("0.18.87 is in the copy: bonus entries outside a trip's commission", () => {
  assert.ok(C.moneyBase.bonusOutsideCommission);
  assert.ok(C.moneyBase.commissionRow);
});
