/**
 * Contract v0.18.157 (contract.json#smsSignIn.otherCountries; owner 2026-11-24 "ALL numbers must be able to log in in
 * the RIDER app"): the Sweden-standard, super-admin-only switch and daily limit for numbers of other countries.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SMS_OTHER_DEFAULT, SMS_OTHER_HOME, smsOtherIssues, smsOtherLines, smsOtherOf } from "./smsSignIn.ts";
import { countryRulesOf } from "../live/configDocs.ts";

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const C = JSON.parse(src("../../../contracts/contract.json")) as { smsSignIn: { otherCountries: { homeCountry: string; admin: { texts: Record<string, Record<string, string>> } } }; configDefaults: { smsSignInOtherCountries: { enabled: boolean; dailyCap: number } } };

test("defaults and reading follow the contract (on, 50; only an exact boolean counts)", () => {
  assert.deepEqual(SMS_OTHER_DEFAULT, { enabled: C.configDefaults.smsSignInOtherCountries.enabled, dailyCap: C.configDefaults.smsSignInOtherCountries.dailyCap });
  assert.equal(SMS_OTHER_HOME, C.smsSignIn.otherCountries.homeCountry);
  assert.deepEqual(smsOtherOf(undefined), { enabled: true, dailyCap: 50 });
  assert.deepEqual(smsOtherOf({ enabled: false, dailyCap: 120 }), { enabled: false, dailyCap: 120 });
  assert.deepEqual(smsOtherOf({ enabled: "no", dailyCap: 5 }), { enabled: true, dailyCap: 50 });
  assert.equal(smsOtherIssues({ enabled: true, dailyCap: 9 }).length, 1);
  assert.deepEqual(smsOtherIssues({ enabled: true, dailyCap: 50 }), []);
  assert.deepEqual(smsOtherLines({ enabled: true, dailyCap: 50 }, { enabled: false, dailyCap: 80 }), ["SMS sign-in for other countries: on → off", "Other countries sign-in SMS per day: 50 → 80"]);
});

test("saved as smsSignInOtherCountries on a Standard only", () => {
  const input = { tips: [], raiseSteps: [], driverBonus: { defaultLimit: 0, hardMax: 0 }, smsSignInOther: { enabled: false, dailyCap: 70 } };
  assert.deepEqual(countryRulesOf("SE", "SEK", input, null, { standard: true })["smsSignInOtherCountries"], { enabled: false, dailyCap: 70 });
  assert.equal("smsSignInOtherCountries" in countryRulesOf("SE", "SEK", input, null, { standard: false }), false);
});

test("the card: super admins only, Sweden Standard only, texts as the contract", () => {
  const panel = src("../pricing/CountryExtrasPanel.tsx");
  assert.match(panel, /isSuper && onStandard && country === SMS_OTHER_HOME/);
  assert.match(panel, /agent\?\.role === "super"/);
  const card = src("../pricing/SmsOtherCountriesCard.tsx");
  const t = C.smsSignIn.otherCountries.admin.texts;
  for (const key of ["info", "switch", "dailyCap"]) assert.ok(card.includes(t[key]!.en!), key);
  const sv = src("../i18n/sv/c58-sms-other.ts");
  const fr = src("../i18n/fr/c58-sms-other.ts");
  for (const key of ["title", "switch", "dailyCap", "info"]) {
    assert.ok(sv.includes(t[key]!.sv!), `sv ${key}`);
    assert.ok(fr.includes(t[key]!.fr!), `fr ${key}`);
  }
});
