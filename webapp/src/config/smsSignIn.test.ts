/**
 * Contract v0.18.133 (contract.json#smsSignIn; owner 2026-11-19 "Yes, build it now (Rec.)", Rules
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
import { foundText } from "../alerts/engine.ts";
import { COUNTRY_WIDE_FIELDS, completeCountrySettings, draftForShownScope, countrySettingsIssues, countrySettingsLines, defaultCountrySettings, PRICING_FIELDS, zoneValuesForSave, type CountrySettings } from "./countrySettings.ts";
import { SMS_DAILY_CAP, SMS_SIGN_IN_DEFAULT, smsSignInLines, smsSignInOf } from "./smsSignIn.ts";

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const C = JSON.parse(src("../../../contracts/contract.json")) as { smsSignIn: { dailyCapRange: [number, number]; alert: { titles: { near: string; reached: string }; detail: string } }; configDefaults: { smsSignIn: { enabled: boolean; dailyCap: number } } };

test("default OFF with the contract's daily limit and range; only an exact true is on", () => {
  assert.deepEqual(SMS_SIGN_IN_DEFAULT, { enabled: C.configDefaults.smsSignIn.enabled, dailyCap: C.configDefaults.smsSignIn.dailyCap, providerOrder: ["infobip", "46elks"] });
  assert.equal(SMS_SIGN_IN_DEFAULT.enabled, false);
  assert.deepEqual([SMS_DAILY_CAP.min, SMS_DAILY_CAP.max], C.smsSignIn.dailyCapRange);
  for (const country of ["SE", "FR", "TN"] as const) assert.deepEqual(defaultCountrySettings(country).smsSignIn, { enabled: false, dailyCap: 200, providerOrder: ["infobip", "46elks"] });
  assert.deepEqual(smsSignInOf(undefined), { enabled: false, dailyCap: 200, providerOrder: ["infobip", "46elks"] });
  assert.deepEqual(smsSignInOf({ enabled: "true", dailyCap: 5 }), { enabled: false, dailyCap: 200, providerOrder: ["infobip", "46elks"] });
  assert.deepEqual(smsSignInOf({ enabled: 1, dailyCap: 100_001 }), { enabled: false, dailyCap: 200, providerOrder: ["infobip", "46elks"] });
  assert.deepEqual(smsSignInOf({ enabled: true, dailyCap: 350 }), { enabled: true, dailyCap: 350, providerOrder: ["infobip", "46elks"] });
  assert.deepEqual(completeCountrySettings("FR", { smsSignIn: { enabled: true, dailyCap: 50 } }).smsSignIn, { enabled: true, dailyCap: 50, providerOrder: ["infobip", "46elks"] });
  assert.ok((PRICING_FIELDS as readonly string[]).includes("smsSignIn"));
});

test("a change is one line each in the save dialog (from → to); a daily limit outside 10-100 000 stops the save", () => {
  const before = defaultCountrySettings("SE");
  assert.deepEqual(countrySettingsLines("SE", before, before), []);
  assert.deepEqual(smsSignInLines({ enabled: false, dailyCap: 200, providerOrder: ["infobip", "46elks"] }, { enabled: true, dailyCap: 500, providerOrder: ["infobip", "46elks"] }), ["Real SMS sign-in codes: off → on", "Sign-in SMS per day: 200 → 500"]);
  assert.equal(countrySettingsLines("SE", before, { ...before, smsSignIn: { enabled: true, dailyCap: 200, providerOrder: ["infobip", "46elks"] } }).length, 1);
  assert.deepEqual(countrySettingsIssues("SE", before), []);
  for (const dailyCap of [9, 100_001, 20.5, Number.NaN]) {
    assert.equal(countrySettingsIssues("SE", { ...before, smsSignIn: { enabled: true, dailyCap, providerOrder: ["infobip", "46elks"] } }).length, 1, String(dailyCap));
  }
  for (const dailyCap of [10, 200, 100_000]) assert.deepEqual(countrySettingsIssues("SE", { ...before, smsSignIn: { enabled: true, dailyCap, providerOrder: ["infobip", "46elks"] } }), []);
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

test("a save for several scopes with a ZONE shown never changes the Standard's country-wide values (SMS switch, emergency numbers, SOS SMS)", () => {
  const base = defaultCountrySettings("SE");
  const customNumbers = [{ kind: "police" as const, number: "114 14", label: { sv: "Polis", fr: "Police", en: "Police" } }];
  const standard: CountrySettings = { ...base, smsSignIn: { enabled: true, dailyCap: 5000, providerOrder: ["infobip", "46elks"] }, emergencyNumbers: customNumbers, sosContactsSms: false };
  const zone: CountrySettings = { ...base };
  const own: Record<string, CountrySettings> = { "standard-SE": standard, Z002: zone };
  // The admin looks at zone Z002, both scopes are chosen at the top, and one tip changes.
  const shown: CountrySettings = { ...zone, tips: [{ id: "tip-1", amount: 40, enabled: true }] };
  const saved = zoneValuesForSave(shown, ["Z002", "standard-SE"], (id) => own[id]!, "Z002");
  assert.deepEqual(saved["standard-SE"]!.smsSignIn, { enabled: true, dailyCap: 5000, providerOrder: ["infobip", "46elks"] }, "the Standard's SMS switch and limit stay");
  assert.deepEqual(saved["standard-SE"]!.emergencyNumbers, customNumbers, "the Standard's emergency numbers stay");
  assert.equal(saved["standard-SE"]!.sosContactsSms, false, "the Standard's SOS SMS switch stays");
  assert.equal(saved["standard-SE"]!.tips[0]!.amount, 40, "the edited field still goes to every chosen scope");
  assert.equal(saved.Z002!.tips[0]!.amount, 40);
  // With the Standard shown, what the admin set on the card is what the Standard gets.
  const onStandard: CountrySettings = { ...standard, smsSignIn: { enabled: false, dailyCap: 300, providerOrder: ["infobip", "46elks"] } };
  const fromStandard = zoneValuesForSave(onStandard, ["Z002", "standard-SE"], (id) => own[id]!, "standard-SE");
  assert.deepEqual(fromStandard["standard-SE"]!.smsSignIn, { enabled: false, dailyCap: 300, providerOrder: ["infobip", "46elks"] });
  assert.deepEqual([...COUNTRY_WIDE_FIELDS], ["smsSignIn", "smsSignInOther", "emergencyNumbers", "sosContactsSms"]);
  assert.match(src("../pricing/CountryExtrasPanel.tsx"), /zoneValuesForSave\(shown, targets, \(id\) => zoneSettingsOf\(zoneBook, country, id\), zoneId\)/);
});

test("a draft started on a zone never carries the zone's country-wide values to the Standard when the shown scope is switched", () => {
  const base = defaultCountrySettings("SE");
  const standard: CountrySettings = { ...base, smsSignIn: { enabled: true, dailyCap: 5000, providerOrder: ["infobip", "46elks"] }, sosContactsSms: false };
  // Zone Z002 shown, a tip edited: the draft holds the zone's country-wide values (the defaults: off / 200).
  const draft: CountrySettings = { ...base, tips: [{ id: "tip-1", amount: 40, enabled: true }] };
  assert.equal(draftForShownScope(draft, "Z002", "Z002", base), draft, "same scope: the draft as it is");
  // The admin picks the Standard at the top (same chosen zones, so the panel and its draft stay).
  const shown = draftForShownScope(draft, "Z002", "standard-SE", standard);
  assert.deepEqual(shown.smsSignIn, { enabled: true, dailyCap: 5000, providerOrder: ["infobip", "46elks"] }, "the Standard's switch and limit, not the zone's defaults");
  assert.equal(shown.sosContactsSms, false);
  assert.equal(shown.tips[0]!.amount, 40, "the other edits stay in the draft");
  assert.deepEqual(countrySettingsLines("SE", standard, shown).filter((line) => /SMS/.test(line)), [], "no SMS line in the save dialog");
  // The other way: an SMS edit made on the Standard is not shown as a zone's own when a zone is picked.
  const onStandard: CountrySettings = { ...standard, smsSignIn: { enabled: false, dailyCap: 300, providerOrder: ["infobip", "46elks"] } };
  assert.deepEqual(draftForShownScope(onStandard, "standard-SE", "Z002", base).smsSignIn, base.smsSignIn);
  const panel = src("../pricing/CountryExtrasPanel.tsx");
  assert.match(panel, /const shown = draft \? draftForShownScope\(draft, draftScope, zoneId, saved\) : saved;/);
  assert.match(panel, /setDraft\(\{ \.\.\.shown, \.\.\.patch \}\); setDraftScope\(zoneId\);/);
});

test("the server's SMS-limit alert reaches the admin translated (template + numbers, as the server sends it)", () => {
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  setLanguage("sv");
  assert.equal(foundText({ t: C.smsSignIn.alert.titles.reached, a: [200, 200] }, "fallback"), "Gränsen för inloggnings-sms är nådd: 200 av 200 de senaste 24 timmarna. Nya inloggningskoder är stoppade");
  assert.equal(foundText({ t: C.smsSignIn.alert.titles.near, a: [160, 200] }, "fallback"), "Inloggnings-sms: 160 av 200 skickade de senaste 24 timmarna");
  setLanguage("fr");
  assert.equal(foundText({ t: C.smsSignIn.alert.detail, a: [] }, "fallback"), "Augmentez la limite par jour dans Pourboires et limites par pays s'il s'agit de vraies personnes");
  setLanguage("en");
});

test("the card is on Tips & limits, editable on the Standard only, with the two blue i texts in six parts", () => {
  const card = src("../pricing/SmsSignInCard.tsx");
  assert.match(card, /data-testid="sms-sign-in-on"/);
  assert.match(card, /const editable = canEdit && onStandard;/);
  assert.equal((card.match(/disabled=\{!editable\}/g) ?? []).length, 3, "the switch, the number and the SMS company order (v0.18.168) are locked off the Standard");
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
  // Owner 2026-11-19 "6 digits (Rec.)" (contract smsSignIn.codeLength): the example SMS in the "i" text shows a code of
  // that length, written as in the Swedish SMS text of the contract.
  const contract = JSON.parse(src("../../../contracts/contract.json")) as { smsSignIn: { codeLength: number; texts: { sms: { sv: string } } }; auth: { otp: { codeLength: number } } };
  assert.equal(contract.smsSignIn.codeLength, 6);
  assert.equal(contract.auth.otp.codeLength, 4);
  const shown = /Movera: din inloggningskod är ([0-9]+)\./.exec(Object.values(SETTING_INFO["tips.smsSignIn.enabled"]!).join(" "));
  assert.ok(shown, "the example SMS is in the i text");
  assert.equal(shown![1]!.length, contract.smsSignIn.codeLength);
  assert.ok(contract.smsSignIn.texts.sms.sv.startsWith("Movera: din inloggningskod är {code}."));
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
