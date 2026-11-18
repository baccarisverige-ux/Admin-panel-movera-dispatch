import assert from "node:assert/strict";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { en } from "../i18n/en.ts";
import { sv } from "../i18n/sv.ts";
import { fr } from "../i18n/fr.ts";

/**
 * L20-6 (contract v0.18.125, alertDesk.serverDetection.kindDefaults.system_health.laneLate; server PR #274): the server's
 * system_health lane-late alert sends whole-sentence templates; the admin translates them (area c41-lane-late).
 */
const KEYS = [
  "Server trip timers are running {0} s late",
  "Server dispatch rounds are running {0} s late",
  "{0} trip timers overdue",
  "{0} dispatch rounds overdue",
];

test("the contract names the four lane-late texts", () => {
  const ll = (contract as unknown as { alertDesk: { serverDetection: { kindDefaults: { system_health: { laneLate: string } } } } }).alertDesk.serverDetection.kindDefaults.system_health.laneLate;
  for (const k of KEYS) assert.ok(ll.includes(`'${k}'`), k);
});

test("each lane-late text is in en, sv and fr, translated, with its {0}", () => {
  const dicts = { en: en as Record<string, string>, sv: sv as Record<string, string>, fr: fr as Record<string, string> };
  for (const k of KEYS) {
    assert.equal(dicts.en[k], k);
    for (const lang of ["sv", "fr"] as const) {
      const v = dicts[lang][k];
      assert.ok(v && v !== k && v.includes("{0}"), `${lang}: ${k}`);
      assert.ok(!/\bhen\b/i.test(v), `${lang}: no "hen"`);
    }
  }
});
