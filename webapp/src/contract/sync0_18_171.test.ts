/**
 * Contract 0.18.171 copy (movera-contracts v0.18.171, Google road lines; owner 2026-11-27 "Google on key screens"),
 * re-synced from 0.18.166 with tools/sync_contract.sh v0.18.171 (never by hand; 0.18.167 to 0.18.170 come with it).
 * Rule 36: fails on main (copy 0.18.166).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const OPENAPI = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");

test("the admin carries contract 0.18.171", () => {
  assert.equal(C.version, "0.18.171");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("0.18.171 googleRoadLines: setting, budget endpoint, budget alert", () => {
  assert.match(C.googleRoadLines.setting, /maxCallsPerTrip 1\.\.4, default 4/);
  assert.match(C.googleRoadLines.budgetSetting, /dailyLimit 100\.\.100000/);
  assert.match(C.googleRoadLines.budgetAlert, /system_health:google_routes_budget:<CC>/);
  assert.match(OPENAPI, /\/admin\/maps\/google-budget:/);
  assert.match(OPENAPI, /operationId: adminPutGoogleRoutesBudget/);
  assert.match(OPENAPI, /GoogleRoutesBudgetCommand:/);
});
