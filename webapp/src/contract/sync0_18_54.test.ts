/**
 * Contract 0.18.54 sync (movera-contracts v0.18.54, §76 admin masking of phone, e-mail and date of birth; Reveal with a
 * reason; SOS reveal): the admin carries the new copy. The admin's own part (accept both shapes, Reveal, SOS one-click)
 * is step 36; this file only pins the copy. Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONTRACT_VERSION } from "../domain/contract.ts";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));

test("the admin pins the contract it carries (0.18.54)", () => {
  assert.equal(C.version, "0.18.54");
  assert.equal(CONTRACT_VERSION, C.version);
});

test("§76 is in the copy: masked shapes and the reveal routes are described", () => {
  assert.ok(typeof C.adminMasking === "object" && C.adminMasking !== null);
  assert.ok(String(C.adminMasking.shapes.phone).includes("•"));
});
