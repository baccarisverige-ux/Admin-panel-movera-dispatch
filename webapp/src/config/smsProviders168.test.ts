/**
 * Contract v0.18.168 (contract.json#smsProviders; owner 2026-11-26 "Infobip + 46elks en secours (Recommandé)"): the
 * "SMS company order" field on both SMS sign-in cards. Default Infobip, then 46elks; written only when not the default.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SMS_PROVIDER_ORDERS, SMS_PROVIDER_ORDER_DEFAULT, providerOrderLabel, smsOtherLines, smsOtherOf, smsSignInLines, smsSignInOf } from "./smsSignIn.ts";
import { countryRulesOf } from "../live/configDocs.ts";

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const C = JSON.parse(src("../../../contracts/contract.json")) as { smsProviders: { providers: string[]; defaultOrder: string[] } };

test("the default and the companies are the contract's", () => {
  assert.deepEqual(SMS_PROVIDER_ORDER_DEFAULT, C.smsProviders.defaultOrder);
  for (const order of SMS_PROVIDER_ORDERS) for (const company of order) assert.ok(C.smsProviders.providers.includes(company));
  assert.deepEqual(smsSignInOf({}).providerOrder, ["infobip", "46elks"]);
  assert.deepEqual(smsSignInOf({ providerOrder: ["46elks"] }).providerOrder, ["46elks"]);
  assert.deepEqual(smsSignInOf({ providerOrder: ["twilio"] }).providerOrder, ["infobip", "46elks"]);
  assert.deepEqual(smsOtherOf({ providerOrder: ["46elks", "infobip"] }).providerOrder, ["46elks", "infobip"]);
  assert.equal(providerOrderLabel(["infobip", "46elks"]), "Infobip, then 46elks (backup)");
  assert.equal(providerOrderLabel(["46elks"]), "46elks only");
});

test("a change is one line in the save dialog", () => {
  const before = smsSignInOf({});
  assert.deepEqual(smsSignInLines(before, { ...before, providerOrder: ["46elks", "infobip"] }), ["SMS company order: Infobip, then 46elks (backup) → 46elks, then Infobip (backup)"]);
  const other = smsOtherOf(undefined);
  assert.deepEqual(smsOtherLines(other, { ...other, providerOrder: ["infobip"] }), ["SMS company order: Infobip, then 46elks (backup) → Infobip only"]);
});

test("saved only when not the default (an older server still takes the save)", () => {
  const input = { tips: [], raiseSteps: [], driverBonus: { defaultLimit: 0, hardMax: 0 } };
  assert.deepEqual(countryRulesOf("SE", "SEK", { ...input, smsSignIn: { enabled: true, dailyCap: 200, providerOrder: ["infobip", "46elks"] } }, null)["smsSignIn"], { enabled: true, dailyCap: 200 });
  assert.deepEqual(countryRulesOf("SE", "SEK", { ...input, smsSignIn: { enabled: true, dailyCap: 200, providerOrder: ["46elks"] } }, null)["smsSignIn"], { enabled: true, dailyCap: 200, providerOrder: ["46elks"] });
  const other = { enabled: true, dailyCap: 50, perCodeDailyCap: 10, perMinuteCap: 30, blockedCallingCodes: [], providerOrder: ["46elks", "infobip"] };
  assert.deepEqual(countryRulesOf("SE", "SEK", { ...input, smsSignInOther: other }, null, { standard: true })["smsSignInOtherCountries"], { ...other });
});

test("both cards show the field with its i text", () => {
  assert.match(src("../pricing/SmsSignInCard.tsx"), /SmsProviderOrderField info="tips.smsSignIn.providerOrder"/);
  assert.match(src("../pricing/SmsOtherCountriesCard.tsx"), /SmsProviderOrderField info="tips.smsOther.providerOrder"/);
  const tips = src("../ui/settingInfo/tips.ts");
  assert.ok(tips.includes('"tips.smsSignIn.providerOrder"') && tips.includes('"tips.smsOther.providerOrder"'));
});
