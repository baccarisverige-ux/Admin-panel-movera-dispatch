/**
 * Contract 0.18.86 copy (movera-contracts v0.18.86 ac59925 #129, J5b commission steps per zone and car type), taken with
 * S5 J5a so the admin's copy never goes down (the server and contract are at 0.18.86). J5a itself reads
 * kpis.money.netRevenue (v0.18.13: = moveraEarnings) and moneyBase.commission / kpiMoney (v0.18.82), unchanged in
 * 0.18.86. The commission steps editor is job J5b (admin), not this copy. Rule 36: written before the copy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));

test("the admin pins the contract it carries (0.18.86; J5b commission steps landed in 0.18.86)", () => {
  assert.equal(C.version, "0.18.86");
  assert.equal(CONTRACT_VERSION, C.version);
  assert.ok(C.commissionSteps, "contract.json#commissionSteps is in the copy");
  assert.ok(readFileSync(new URL("../../../contracts/fixtures/commission_steps.json", import.meta.url), "utf8").length > 0);
});

test("J5a reads the same money rules in 0.18.86: Net revenue = Movera earnings; one commission", () => {
  assert.match(C.kpis.money.netRevenue, /equals moveraEarnings/);
  assert.match(C.moneyBase.commission, /never work it out themselves/);
  assert.match(C.moneyBase.kpiMoney, /taken off moveraEarnings once/);
});
