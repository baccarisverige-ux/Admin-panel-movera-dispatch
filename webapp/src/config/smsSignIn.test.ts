/**
 * Contract v0.18.135 (contract.json#smsSignIn; owner 2026-11-19 "Yes, build it now (Rec.)", Rules
 * decisions/session-2026-11-06.md): the admin's switch "Real SMS sign-in codes" and the daily SMS limit
 * (CountryRules.smsSignIn, country standard only, default OFF), their save lines, the "i" texts and the texts of the
 * server's SMS-limit alert in sv / fr / en. Rule 36: fails on main (no such setting, card or text).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerDictionary, setLanguage, tr } from "../i18n/core.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { countryRulesOf, COUNTRY_RULES_PANEL_KEYS } from "../live/configDocs.ts";
import { SETTING_INFO } from "../ui/settingInfoTexts.ts";
import { completeCountrySettings, countrySettingsIssues, countrySettingsLines, defaultCountrySettings, PRICING_FIELDS } from "./countrySettings.ts";
import { SMS_DAILY_CAP, SMS_SIGN_IN_DEFAULT, smsSignInLines, smsSignInOf } from "./smsSignIn.ts";

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const C = JSON.parse(src("../../../contracts/contract.json")) as { smsSignIn: { dailyCapRange: [number, number]; alert: { titles: { near: string; reached: string }; detail: string } }; configDefaults: { smsSignIn: { enabled: boolean; dailyCap: number } } };

test("default OFF with the contract's daily limit and range; only an exact true is on", () => {
  assert.deepEqual(SMS_SIGN_IN_DEFAULT, { enabled: C.configDefaults.smsSignIn.enabled, dailyCap: C.configDefaults.smsSignIn.dailyCap });
  assert.equal(SMS_SIGN_IN_DEFAULT.enabled, false);
  assert.deepEqual([SMS_DAILY_CAP.min, SMS_DAILY_CAP.max], C.smsSignIn.dailyCapRange);
  for (const country of ["SE", "FR", "TN"] as const) assert.deepEqual(defaultCountrySettings(country).smsSignIn, { enabled: false, dailyCap: 200 });
  assert.deepEqual(smsSignInOf(undefined), { enabled: false, dailyCap: 200 });
  assert.deepEqual(smsSignInOf({ enabled: "true", dailyCap: 5 }), { enabled: false, dailyCap: 200 });
  assert.deepEqual(smsSignInOf({ enabled: 1, dailyCap: 100_001 }), { enabled: false, dailyCap: 200 });
  assert.deepEqual(smsSignInOf({ enabled: true, dailyCap: 350 }), { enabled: true, dailyCap: 350 });
  assert.deepEqual(completeCountrySettings("FR", { smsSignIn: { enabled: true, dailyCap: 50 } }).smsSignIn, { enabled: true, dailyCap: 50 });
  assert.ok((PRICING_FIELDS as readonly string[]).includes("smsSignIn"));
});

test("a change is one line each in the save dialog (from → to); a daily limit outside 10-100 000 stops the save", () => {
  const before = defaultCountrySettings("SE");
  assert.deepEqual(countrySettingsLines("SE", before, before), []);
  assert.deepEqual(smsSignInLines({ enabled: false, dailyCap: 200 }, { enabled: true, dailyCap: 500 }), ["Real SMS sign-in codes: off → on", "Sign-in SMS per day: 200 → 500"]);
  assert.equal(countrySettingsLines("SE", before, { ...before, smsSignIn: { enabled: true, dailyCap: 200 } }).length, 1);
  assert.deepEqual(countrySettingsIssues("SE", before), []);
  for (const dailyCap of [9, 100_001, 20.5, Number.NaN]) {
    assert.equal(countrySettingsIssues("SE", { ...before, smsSignIn: { enabled: true, dailyCap } }).length, 1, String(dailyCap));
  }
  for (const dailyCap of [10, 200, 100_000]) assert.deepEqual(countrySettingsIssues("SE", { ...before, smsSignIn: { enabled: true, dailyCap } }), []);
});

test("saved on the country standard only: the document carries it when given, never otherwise, and never copies a stored one", () => {
  const input = { tips: [], raiseSteps: [], driverBonus: { defaultLimit: 100, hardMax: 500 } };
  assert.deepEqual(countryRulesOf("SE", "SEK", { ...input, smsSignIn: { enabled: true, dailyCap: 300 } }, null)["smsSignIn"], { enabled: true, dailyCap: 300 });
  // A zone save built on the Standard's document must not carry the Standard's switch (the server refuses it on a zone).
  assert.equal("smsSignIn" in countryRulesOf("SE", "SEK", input, { smsSignIn: { enabled: true, dailyCap: 300 } }), false);
  assert.ok((COUNTRY_RULES_PANEL_KEYS as readonly string[]).includes("smsSignIn"));
  const live = src("../live/liveSettings.ts");
  assert.match(live, /id === standardKey\(market\.id\) \? \{[^}]*smsSignIn: next\.smsSignIn/);
  assert.match(live, /smsSignIn: smsSignInOf\(/);
});

test("the card is on Tips & limits, editable on the Standard only, with the two blue i texts in six parts", () => {
  const card = src("../pricing/SmsSignInCard.tsx");
  assert.match(card, /data-testid="sms-sign-in-on"/);
  assert.match(card, /const editable = canEdit && onStandard;/);
  assert.equal((card.match(/disabled=\{!editable\}/g) ?? []).length, 2, "the switch and the number are both locked off the Standard");
  assert.match(card, /SettingInfo id="tips\.smsSignIn\.enabled"/);
  assert.match(card, /info="tips\.smsSignIn\.dailyCap"/);
  const panel = src("../pricing/CountryExtrasPanel.tsx");
  assert.match(panel, /<SmsSignInCard value=\{onStandard \? shown\.smsSignIn : countrySettingsOf\(book, country\)\.smsSignIn\}/);
  assert.match(panel, /onChange=\{\(smsSignIn\) => edit\(\{ smsSignIn \}\)\}/);
  for (const id of ["tips.smsSignIn.enabled", "tips.smsSignIn.dailyCap"]) {
    const info = SETTING_INFO[id];
    assert.ok(info, id);
    for (const part of ["what", "where", "range", "default", "example", "extremes"] as const) assert.ok(info[part].trim().length > 0, `${id} ${part}`);
  }
  assert.match(SETTING_INFO["tips.smsSignIn.enabled"]!.default, /^Off\b/);
  assert.match(SETTING_INFO["tips.smsSignIn.dailyCap"]!.default, /^200\b/);
  assert.match(SETTING_INFO["tips.smsSignIn.dailyCap"]!.range, /10 to 100 000/);
  // No key, password or key name of the SMS company anywhere in the panel.
  assert.doesNotMatch(card + src("./smsSignIn.ts") + src("../ui/settingInfo/tips.ts"), /ELKS_|API_PASSWORD|API_USERNAME/);
});

test("labels, save lines and the server's SMS-limit alert are in sv, fr and en", () => {
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  const keys = ["Real SMS sign-in codes", "Sign-in SMS per day, at most", "Real SMS sign-in codes: {0} → {1}", "Sign-in SMS per day: {0} → {1}", C.smsSignIn.alert.titles.near, C.smsSignIn.alert.titles.reached, C.smsSignIn.alert.detail];
  for (const key of keys) {
    assert.ok(key in en, `en: ${key}`);
    const svText = (sv as Record<string, string>)[key], frText = (fr as Record<string, string>)[key];
    assert.ok(svText && svText !== key, `sv: ${key}`);
    assert.ok(frText && frText !== key, `fr: ${key}`);
    for (const text of [svText, frText]) for (const slot of key.match(/\{\d\}/g) ?? []) assert.ok(text.includes(slot), `${key}: ${slot} kept`);
  }
  setLanguage("sv");
  assert.equal(tr(C.smsSignIn.alert.titles.near as "Sign-in SMS: {0} of {1} sent in the last 24 hours", [160, 200]), "Inloggnings-sms: 160 av 200 skickade de senaste 24 timmarna");
  setLanguage("fr");
  assert.equal(tr("Real SMS sign-in codes: {0} → {1}", [tr("off"), tr("on")]).startsWith("Vrais codes de connexion par SMS"), true);
  setLanguage("en");
});
