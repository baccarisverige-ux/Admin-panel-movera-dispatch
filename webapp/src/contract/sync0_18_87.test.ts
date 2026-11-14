/**
 * Contract 0.18.87 sync, MC lane (movera-contracts v0.18.87 #130 bcbe15c, contract.json#moneyBase.commissionRow; owner
 * 2026-11-13 23:42 UTC "Movera commission is how much movera keep", decisions/session-2026-11-06.md:1263). Every admin
 * row labelled "Movera commission" shows what Movera keeps NOW: moneySplit.movera; before the paid end
 * TripProjection.commission; neither → "Not connected yet". The driver reads TripProjection.moveraKeepsNow.
 * Rule 36: written before the copy was bumped.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";
import { moveraCommissionShown } from "../trips/file.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const OPENAPI = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");

test("the admin pins the contract it carries (0.18.87; commissionRow landed in 0.18.87)", () => {
  assert.equal(C.version, "0.18.87");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("0.18.87: moneyBase.commissionRow.admin and TripProjection.moveraKeepsNow are in the copy", () => {
  const row = C.moneyBase?.commissionRow;
  assert.equal(typeof row?.admin, "string");
  assert.match(row.admin, /moneySplit\.movera/);
  assert.match(OPENAPI, /moveraKeepsNow/);
});

test("0.18.87 commissionRow.admin: moneySplit.movera, then the stored commission, then nothing", () => {
  const split = { riderPaid: 30000, driverTotal: 26500, movera: 3500, tip: 0, refunded: 0 };
  assert.equal(moveraCommissionShown({ commission: 6000, split }), 3500);
  assert.equal(moveraCommissionShown({ commission: 6000, split: null }), 6000);
  assert.equal(moveraCommissionShown({ commission: null, split: null }), null);
});
