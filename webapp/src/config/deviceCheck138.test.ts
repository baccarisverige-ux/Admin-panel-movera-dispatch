/**
 * Contract v0.18.138 (contract.json#deviceCheck; owner 2026-11-20 "Ok" to Rules
 * audits/impact/sms-abuse-open-launch-2026-11-20.md, "build BOTH"): the admin's per-country switch "Require device check"
 * (CountryRules.smsSignIn.requireDeviceCheck, default OFF) in the SMS card, its save line and "i" text, and the
 * per-install code limit (countryLimits.codesPerDevicePerHour, default 5) in Settings › Request limits. Rule 36: fails
 * before this change (no such field, switch or text).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { countryRulesOf } from "../live/configDocs.ts";
import { SETTING_INFO } from "../ui/settingInfoTexts.ts";
import { defaultCountrySettings } from "./countrySettings.ts";
import { REQUEST_LIMIT_DEFAULTS, REQUEST_LIMIT_FIELDS, REQUEST_LIMIT_RANGES, requestLimitsOf, withRequestLimits } from "./requestLimits.ts";
import { SMS_SIGN_IN_DEFAULT, smsSignInLines, smsSignInOf } from "./smsSignIn.ts";

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const C = JSON.parse(src("../../../contracts/contract.json")) as { configDefaults: { smsSignIn: { requireDeviceCheck: boolean } }; countryLimits: { defaults: Record<string, number>; ranges: Record<string, [number, number]> } };

test("Require device check: default OFF (contract), only an exact true is on, saved inside smsSignIn on the Standard", () => {
  assert.equal(C.configDefaults.smsSignIn.requireDeviceCheck, false);
  assert.equal(SMS_SIGN_IN_DEFAULT.requireDeviceCheck, false);
  assert.equal(defaultCountrySettings("SE").smsSignIn.requireDeviceCheck, false);
  assert.equal(smsSignInOf({ enabled: true, requireDeviceCheck: "true" }).requireDeviceCheck, false);
  assert.equal(smsSignInOf({ enabled: true, requireDeviceCheck: true }).requireDeviceCheck, true);
  const doc = countryRulesOf("SE", "SEK", { tips: [10], raiseSteps: [5], driverBonus: { defaultLimit: 50, hardMax: 1000 }, smsSignIn: { enabled: true, dailyCap: 200, requireDeviceCheck: true } }, null);
  assert.deepEqual(doc["smsSignIn"], { enabled: true, dailyCap: 200, requireDeviceCheck: true });
  const off = countryRulesOf("SE", "SEK", { tips: [10], raiseSteps: [5], driverBonus: { defaultLimit: 50, hardMax: 1000 }, smsSignIn: { enabled: true, dailyCap: 200 } }, null);
  assert.deepEqual(off["smsSignIn"], { enabled: true, dailyCap: 200, requireDeviceCheck: false });
});

test("Require device check: one save line from → to; the card has the switch and says web and iPhone stop", () => {
  const a = { enabled: true, dailyCap: 200, requireDeviceCheck: false };
  assert.deepEqual(smsSignInLines(a, { ...a, requireDeviceCheck: true }), ["Require device check: off → on"]);
  assert.deepEqual(smsSignInLines(a, a), []);
  const card = src("../pricing/SmsSignInCard.tsx");
  assert.ok(card.includes('data-testid="sms-sign-in-device-check"') && card.includes('SettingInfo id="tips.smsSignIn.requireDeviceCheck"'));
  assert.ok(card.includes("Web sign-in stops for this country") && card.includes("The iPhone check is not active yet"));
  const info = JSON.stringify(SETTING_INFO["tips.smsSignIn.requireDeviceCheck"]);
  assert.ok(info.includes("NOT active yet") && info.includes("web"));
});

test("per-install code limit: in Request limits, contract default 5 and range 1-100, saved in the Standard's limits", () => {
  assert.ok((REQUEST_LIMIT_FIELDS as readonly string[]).includes("codesPerDevicePerHour"));
  assert.equal(REQUEST_LIMIT_DEFAULTS.codesPerDevicePerHour, 5);
  assert.deepEqual(REQUEST_LIMIT_RANGES.codesPerDevicePerHour, C.countryLimits.ranges["codesPerDevicePerHour"]);
  assert.equal(requestLimitsOf({ limits: { codesPerDevicePerHour: 0 } }).codesPerDevicePerHour, 5);
  assert.equal(requestLimitsOf({ limits: { codesPerDevicePerHour: 3 } }).codesPerDevicePerHour, 3);
  assert.deepEqual(withRequestLimits({ limits: { wrongCodesPerDay: 20 } }, { ...REQUEST_LIMIT_DEFAULTS, codesPerDevicePerHour: 3 })["limits"], { wrongCodesPerDay: 20, writesPerUserPerMinute: 120, writesPerAddressPerMinute: 60, codesPerDevicePerHour: 3 });
  assert.ok(SETTING_INFO["settings.requestLimits.codesPerDevicePerHour"]);
});

test("the new texts exist in sv / fr / en (area c51-device-check)", () => {
  const keys = ["Require device check", "Require device check: {0} → {1}", "Sign-in codes per app install per hour"] as const;
  for (const key of keys) {
    assert.equal((en as Record<string, string>)[key], key);
    assert.ok((sv as Record<string, string>)[key] && (sv as Record<string, string>)[key] !== key, "sv " + key);
    assert.ok((fr as Record<string, string>)[key] && (fr as Record<string, string>)[key] !== key, "fr " + key);
  }
});
