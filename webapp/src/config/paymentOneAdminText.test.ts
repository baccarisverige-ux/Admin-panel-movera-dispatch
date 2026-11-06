import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

/**
 * Owner decision "One admin always" (Rules decisions/admin-fake-by-group.md, Q1): no refund waits for a second
 * admin. The Payment page must not tell an admin that "the payment stays captured until a second authorised agent
 * approves it", in any language.
 */
const SENTENCE = "the payment stays captured until a second authorised agent approves it";

test("PaymentPage does not show the second-agent refund sentence", () => {
  const source = readFileSync(new URL("../pages/PaymentPage.tsx", import.meta.url), "utf8");
  assert.equal(source.includes(SENTENCE), false);
});

for (const [lang, dictionary] of Object.entries({ en, sv, fr })) {
  test(`${lang}: no text for the second-agent refund sentence`, () => {
    assert.deepEqual(Object.keys(dictionary).filter((key) => key.includes(SENTENCE)), []);
  });
}
