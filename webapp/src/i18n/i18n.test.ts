import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { en } from "./en.ts";
import { fr } from "./fr.ts";
import { sv } from "./sv.ts";
import { currentLanguage, fill, isLanguageLoaded, loadLanguage, registerDictionary, setLanguage, tr, translate, trSentences, trx, uiLocale } from "./core.ts";
import { trn } from "./nodes.ts";
import { contractDefaultLanguage, homeCountry, languageOptionLabel, resolveAdminLanguage } from "./languages.ts";
import { STATUS_LINE_TEXTS } from "./statusTexts.ts";
import { COUNTRY_LABEL } from "./countries.ts";
import { MENU, MENU_GROUPS } from "../nav.ts";
import { statusLabel } from "../domain/labels.ts";
import { COMMANDS } from "../commands/registry.ts";
import { FEATURE_INDEX } from "../dispatch/featureIndex.ts";
import { OFFER_STATUS_LABEL, EVENT_LABEL } from "../dispatch/assign.ts";
import { OFFER_STEP_LABEL } from "../trips/offerLog.ts";
import { readFileSync } from "node:fs";
import { STATUS_LABEL } from "../platform/myActivity.ts";
import { defaultCountrySettings, saveCountrySettings, emptyCountrySettingsBook, LANGUAGE_LABEL } from "../config/countrySettings.ts";
import { shortDateTime } from "../domain/time.ts";

registerDictionary("fr", fr);
registerDictionary("sv", sv);
const hasMessage = (text: string) => Object.hasOwn(en, text);
const placeholders = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
/** "s", "ies", "y is": plural endings an English text adds; another language may write them as nothing. */
const isEnding = (key: string) => key.length <= 7 && /^[a-z ]+$/.test(key);

test("every dictionary has exactly the keys of English", () => {
  const keys = Object.keys(en).sort();
  assert.ok(keys.length > 1000, "the panel's texts are in the dictionary");
  for (const [name, dictionary] of Object.entries({ fr, sv })) {
    const own = Object.keys(dictionary).sort();
    assert.deepEqual(own.filter((key) => !Object.hasOwn(en, key)), [], `${name} has no key English lacks`);
    assert.deepEqual(keys.filter((key) => !Object.hasOwn(dictionary, key)), [], `${name} has every English key`);
  }
  for (const [key, value] of Object.entries(en)) assert.equal(value, key, "English text is its own key");
});

test("translations keep the placeholders and are not left empty", () => {
  for (const [name, dictionary] of Object.entries({ fr, sv }) as [string, Record<string, string>][]) {
    for (const key of Object.keys(en)) {
      const text = dictionary[key];
      const known = placeholders(key);
      for (const used of placeholders(text)) assert.ok(known.has(used), `${name} "${key}": {${used}} is not in the English text`);
      if (!isEnding(key)) assert.ok(text.trim().length > 0 || !key.trim(), `${name} "${key}" is translated`);
      // A placeholder may only be left out when it is a plural ending ({1} = "s"); parts that are numbers, names or
      // links stay. Checked on the texts whose English has a word ending right before the placeholder.
      for (const name2 of known) {
        if (placeholders(text).has(name2)) continue;
        assert.match(key, new RegExp(`[a-z]\\{${name2}\\}`), `${name} "${key}": only a plural ending ({${name2}}) may be left out`);
      }
    }
  }
});

test("the panel is mostly translated, not copied", () => {
  for (const [name, dictionary] of Object.entries({ fr, sv }) as [string, Record<string, string>][]) {
    const words = Object.keys(en).filter((key) => /[a-z]{4,} [a-z]{4,}/.test(key));
    const same = words.filter((key) => dictionary[key] === key);
    assert.ok(same.length / words.length < 0.02, `${name}: ${same.length} of ${words.length} sentences are still English: ${same.slice(0, 5).join(" | ")}`);
  }
});

test("labels kept in data modules have an entry (menu, statuses, commands, All features, status line)", () => {
  const labels = [
    ...MENU.map((item) => item.label),
    ...MENU_GROUPS,
    ...Object.values(OFFER_STATUS_LABEL),
    ...Object.values(EVENT_LABEL),
    ...Object.values(STATUS_LABEL),
    ...Object.values(LANGUAGE_LABEL),
    ...Object.values(COUNTRY_LABEL),
    ...COMMANDS.map((command) => command.label),
    ...FEATURE_INDEX.flatMap((entry) => [entry.phrase, entry.section]),
    ...STATUS_LINE_TEXTS,
  ];
  assert.deepEqual(labels.filter((label) => !hasMessage(label)), []);
  for (const code of ["driver_to_pickup", "in_trip", "cancelled_by_admin", "no_show", "approaching_dropoff"]) assert.ok(hasMessage(statusLabel(code)), code);
});

test("G6 live fix: every live command notice and offer status word has a French and Swedish text", () => {
  // Owner live test 2026-11-01: "Sent to the radar group.", "Exclusive offer sent.", "Expired", "Sent" stayed English.
  const source = readFileSync(new URL("../live/liveAdminApi.ts", import.meta.url), "utf8");
  const notices = source.split("\n").flatMap((line) => (line.includes("done(") ? [...line.slice(line.indexOf("done(")).matchAll(/"([^"]*[.!?])"/g)].map((match) => match[1]!) : []));
  assert.ok(notices.includes("Exclusive offer sent.") && notices.includes("Sent to the radar group."));
  const words = [...notices, ...Object.values(OFFER_STATUS_LABEL), ...Object.values(OFFER_STEP_LABEL), "{0} said yes", "Asked {0}: {1}", "no answer", "declined", "Custom", "Zone + neighbours"];
  for (const [name, dictionary] of [["fr", fr], ["sv", sv]] as const) {
    const missing = words.filter((word) => !Object.hasOwn(dictionary, word) && !(word.split(/(?<=[.!?…])\s+/).every((part) => Object.hasOwn(dictionary, part))));
    assert.deepEqual(missing, [], name);
  }
});

test("tr, trx and status words follow the chosen language; unknown texts stay as they are", () => {
  try {
    setLanguage("fr");
    assert.equal(tr("Cancel"), fr.Cancel);
    assert.equal(statusLabel("driver_to_pickup"), "Chauffeur vers la prise en charge");
    assert.equal(statusLabel("in_trip"), "En course");
    assert.equal(trx("Dashboard"), "Tableau de bord");
    assert.equal(trx("A text nobody wrote"), "A text nobody wrote");
    assert.equal(uiLocale(), "fr-FR");
    setLanguage("sv");
    assert.equal(statusLabel("driver_to_pickup"), "Förare till upphämtning");
    assert.equal(tr("Are you sure?"), "Är du säker?");
    assert.equal(uiLocale(), "sv-SE");
  } finally {
    setLanguage("en");
  }
  assert.equal(currentLanguage(), "en");
  assert.equal(statusLabel("driver_to_pickup"), "Driver to pickup");
  assert.equal(translate("sv", "Confirm"), "Bekräfta");
  assert.equal(fill("{0} of {1}", [3, 5]), "3 of 5");
  assert.equal(fill("{n} trips", { n: 2 }), "2 trips");
  assert.equal(fill("{0} left", []), "{0} left", "a part that is not given stays visible");
});

test("the command status line is translated sentence by sentence (Checking…, Done, Failed)", () => {
  try {
    setLanguage("fr");
    assert.equal(trSentences("Done. Saved in demo."), "Terminé. Enregistré dans la démo.");
    assert.equal(trSentences("Failed. Your role cannot do that."), "Échec. Votre rôle ne permet pas cela.");
    assert.match(trSentences("Checking… The server is taking longer than usual; this updates to Done or Failed."), /^Vérification… /);
    assert.equal(trSentences("Done. Driver D0042 got it."), "Terminé. Driver D0042 got it.", "a server sentence without an entry stays");
    setLanguage("sv");
    assert.equal(trSentences("Failed. Sign in again."), "Misslyckades. Logga in igen.");
  } finally {
    setLanguage("en");
  }
  assert.equal(trSentences("Done. Saved in demo."), "Done. Saved in demo.");
});

test("trn puts each part where the translation wants it", () => {
  try {
    setLanguage("fr");
    const html = renderToStaticMarkup(createElement("p", null, trn("Assigned to {0}", createElement("b", null, "Erik"))));
    assert.equal(html, "<p>Attribuée à <b>Erik</b></p>");
  } finally {
    setLanguage("en");
  }
  assert.equal(renderToStaticMarkup(createElement("p", null, trn("Assigned to {0}", createElement("b", null, "Erik")))), "<p>Assigned to <b>Erik</b></p>");
});

test("dates are written in the chosen language, in the record's time zone", () => {
  const at = "2026-10-19T19:04:00Z";
  try {
    assert.equal(shortDateTime(at, "Europe/Stockholm"), "19 Oct 21:04");
    setLanguage("fr");
    assert.equal(shortDateTime(at, "Europe/Paris"), "19 oct. 21:04");
    setLanguage("sv");
    assert.equal(shortDateTime(at, "Europe/Stockholm"), "19 okt. 21:04");
  } finally {
    setLanguage("en");
  }
});

test("Q49: the admin's default is the admin default of their country; their own choice wins", () => {
  // Contract defaults: sv in Sweden, fr in France and Tunisia.
  assert.equal(contractDefaultLanguage("SE"), "sv");
  assert.equal(contractDefaultLanguage("FR"), "fr");
  assert.equal(contractDefaultLanguage("TN"), "fr");
  assert.equal(homeCountry({ countries: ["FR"] }), "FR");
  assert.equal(homeCountry({ countries: ["TN", "FR"] }), "TN");
  assert.equal(homeCountry({}), "SE", "an admin of every country belongs to head office in Sweden");
  assert.equal(homeCountry(undefined), "SE");

  const book = emptyCountrySettingsBook();
  const def = (country: "SE" | "FR" | "TN") => book.countries[country].languages.admin;
  assert.deepEqual(resolveAdminLanguage({ countryDefault: def("SE") }), { language: "sv", source: "country", defaultLanguage: "sv" });
  assert.deepEqual(resolveAdminLanguage({ countryDefault: def("FR") }), { language: "fr", source: "country", defaultLanguage: "fr" });
  assert.deepEqual(resolveAdminLanguage({ chosen: "en", countryDefault: def("FR") }), { language: "en", source: "chosen", defaultLanguage: "fr" });
  assert.deepEqual(resolveAdminLanguage({ chosen: "sv", countryDefault: "fr" }), { language: "sv", source: "chosen", defaultLanguage: "fr" });

  // Settings › Payment methods and languages per country changes the default of everyone without a choice.
  const sent = structuredClone(book);
  sent.countries.SE.languages.admin = "en";
  const saved = saveCountrySettings(book, sent, "settings");
  assert.equal(saved.error, undefined);
  assert.equal(resolveAdminLanguage({ countryDefault: saved.book.countries.SE.languages.admin }).language, "en");
  assert.equal(resolveAdminLanguage({ chosen: "fr", countryDefault: saved.book.countries.SE.languages.admin }).language, "fr", "the choice still wins");
  assert.equal(defaultCountrySettings("TN").languages.admin, "fr");

  // A wrong stored value is ignored; the build default (e2e: en) replaces the country default but not a choice.
  assert.equal(resolveAdminLanguage({ chosen: "de", countryDefault: "sv" }).language, "sv");
  assert.equal(resolveAdminLanguage({ chosen: "", countryDefault: "fr" }).source, "country");
  assert.deepEqual(resolveAdminLanguage({ countryDefault: "sv", buildDefault: "en" }), { language: "en", source: "build", defaultLanguage: "en" });
  assert.equal(resolveAdminLanguage({ chosen: "fr", countryDefault: "sv", buildDefault: "en" }).language, "fr");
  assert.equal(resolveAdminLanguage({ countryDefault: "sv", buildDefault: "xx" }).language, "sv");
  assert.equal(resolveAdminLanguage({}).language, "en", "signed out: English");
});

test("the picker shows the code first: FR · Français, SV · Svenska, EN · English", () => {
  assert.equal(languageOptionLabel("fr"), "FR · Français");
  assert.equal(languageOptionLabel("sv"), "SV · Svenska");
  assert.equal(languageOptionLabel("en"), "EN · English");
});

test("French and Swedish load on first use; English needs no dictionary", async () => {
  assert.equal(isLanguageLoaded("en"), true);
  await loadLanguage("fr");
  assert.equal(isLanguageLoaded("fr"), true);
  assert.equal(translate("en", "Cancel"), "Cancel");
  assert.equal(translate("fr", "A text nobody wrote"), "A text nobody wrote");
});

test("G2 R10: the dead 'Approve all remaining' text is gone from every dictionary", () => {
  assert.equal(Object.hasOwn(en, "Approve all remaining"), false);
});

// Checker G3-D9: the Copy to all zones / Publish to drivers errors and the pending-changes warning read sv and fr.
test("G3-D9: copy and publish-to-drivers texts are in sv and fr", async () => {
  const { sv } = await import("./sv.ts");
  const { fr } = await import("./fr.ts");
  for (const key of ["Nothing to copy.", "Choose a zone first.", "This zone has changes not yet sent to drivers; they will be copied and sent to all zones too."]) {
    for (const dict of [sv, fr] as Record<string, string>[]) assert.ok(dict[key] && dict[key] !== key, `${key} translated`);
  }
});

test("page audit round 4: the live page texts have no demo wording, and 'no driver' is 'Non attribué' in French", () => {
  const keys = [
    "{0} trips, {1} match the filters, {2} statuses in this view.",
    "{0} payments in the ledger. Amounts are in each record's own currency; totals are for the chosen country. Wallet vouchers are constrained to 100, 200 and 500 kr. Finance revision {1}.",
    "Every rider promotion, driver bonus, voucher code and invite reward in {0}, with budget and results. Results are not counted yet: rides are not yet counted per promotion.",
    "Values the product owner has not confirmed. Today’s number is the current default, not a second policy.",
    "Saved here for the backend. Sign-in always asks for the code and signs out after 15 minutes.",
    "Simulated arrival (test only)", "Skip activation (test only)", "Preview popup (test only)", "Preview hint (test only)",
  ];
  for (const [name, dict] of [["en", en], ["fr", fr], ["sv", sv]] as const) {
    for (const key of keys) {
      const value = (dict as Record<string, string>)[key];
      assert.ok(value, `${name}: ${key}`);
      assert.doesNotMatch(value, /d[ée]mo/i, `${name}: ${value}`);
    }
  }
  for (const key of ["Unassigned", "Not assigned", "None assigned"]) assert.equal((fr as Record<string, string>)[key], "Non attribué", key);
  assert.equal((fr as Record<string, string>)["{0} Unassigned"], "{0} Non attribué");
});
