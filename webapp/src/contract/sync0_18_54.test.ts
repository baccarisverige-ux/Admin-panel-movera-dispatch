/**
 * Contract 0.18.54 sync (movera-contracts v0.18.54, §76 admin masking of phone, e-mail and date of birth; Reveal with a
 * reason; SOS reveal): the admin carries the new copy and builds its part first (expand-then-contract, step 36): every
 * people view accepts full and masked values, a masked record shows Reveal with a reason dialog, an open SOS case
 * reveals both phones in one click (live/masking.ts, live/LiveReveal.tsx). Rule 43(4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const C = JSON.parse(readFileSync(new URL("../../../contracts/contract.json", import.meta.url), "utf8"));

// The exact pin moved to sync0_18_55.test.ts with the 0.18.55 copy; the §76 check below still holds.

test("§76 is in the copy: masked shapes, the flag, the three reveal routes and the SOS reveal", () => {
  assert.match(C.adminMasking.shapes.flag, /sensitiveMasked: true/);
  assert.match(C.adminMasking.reveal.reason, /3.200 characters/);
  assert.match(C.adminMasking.sosReveal.who, /open or investigating/);
  assert.match(C.adminMasking.sosReveal.reason, /defaults to 'SOS'/);
  assert.match(C.adminMasking.apps, /contract -> admin .* -> server/);
});
