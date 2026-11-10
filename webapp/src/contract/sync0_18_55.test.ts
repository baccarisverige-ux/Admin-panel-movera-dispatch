/**
 * Contract 0.18.55 sync (movera-contracts v0.18.55, §77 owner Q34): admin reads of GET /trips/{tripId} and
 * GET /trips/{tripId}/events need trips.read and the trip's zone. No admin behaviour change; this file only pins the
 * copy. Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const O = readFileSync(new URL("../../../contracts/openapi.yaml", import.meta.url), "utf8");

test("the admin pins the contract it carries (0.18.55)", () => {
  assert.equal(C.version, "0.18.55");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("§77 is in the copy: admin trip reads need trips.read and the trip's zone", () => {
  assert.match(O, /v0\.18\.55 §77/);
  assert.match(O, /zone_out_of_scope/);
});
