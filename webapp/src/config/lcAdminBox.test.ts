import assert from "node:assert/strict";
import test from "node:test";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";

/**
 * Job L-c (owner 2026-11-06, decisions/driver-g15.md "Owner answers 2026-11-06 (L-c follow-ups, #515)"):
 * the "Doesn't count" tick box in Dispatch › Cancel reasons is removed ("Remove it (Safe)"). It had no effect:
 * the server counts every give-back (movera-server#106). No admin text in any language may still offer or
 * describe that mark, so an admin is never told a reason can be kept out of the cancel rate.
 */
const MARKS = ["Doesn't count", "Räknas inte", "Ne compte pas"];

for (const [lang, dictionary] of Object.entries({ en, sv, fr })) {
  test(`${lang}: no admin text offers or describes a "Doesn't count" mark`, () => {
    const found = Object.entries(dictionary).filter(([key, value]) => MARKS.some((mark) => key.includes(mark) || value.includes(mark)));
    assert.deepEqual(found.map(([key]) => key), []);
  });
}

test("the cancel-reasons help keeps its other sentences in sv, fr and en", () => {
  const key = "What drivers and riders choose from when they cancel. An empty language shows the English text.";
  assert.equal(en[key], key);
  assert.ok(sv[key]?.startsWith("Det förare och resenärer väljer bland"));
  assert.ok(fr[key]?.startsWith("Ce que chauffeurs et passagers choisissent"));
});
