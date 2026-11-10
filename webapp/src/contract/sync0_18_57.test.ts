/**
 * Contract 0.18.57 sync (movera-contracts v0.18.57, §79 owner 2026-11-10): emergency numbers per country. Pins the copy;
 * the setting editor and the case page are checked in src/config/emergencyNumbers.test.ts. Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));
const M = readFileSync(new URL("../../../contracts/CONTRACT.md", import.meta.url), "utf8");

// The exact pin moved to sync0_18_59.test.ts with the 0.18.59 copy; the §79 check below still holds.

test("§79 is in the copy: emergency numbers per country", () => {
  assert.match(M, /## 79\. Emergency numbers per country/);
  assert.ok(C.emergencyNumbers && C.configDefaults.emergencyNumbers);
});
