import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { enC38FromTo } from "../i18n/en/c38-from-to.ts";
import { fromToLines, type ChangeOf } from "./fromTo.ts";

/**
 * cfgundo SF-R4-3 (supervisor, Rules audits/impact/country-undo-supervisor.md "Round 4"): the "From → to" line of the
 * confirm "!" was the English audit text in sv and fr dialogs. The owner's rule (2026-11-16 08:48): the confirm-dialog
 * texts keep sv / fr / en. The line is now built from the values with i18n templates (area c38); a command that only
 * has its English audit words shows a translated generic line instead. The audit text sent to the server stays English.
 */
registerDictionary("sv", sv);
registerDictionary("fr", fr);

const amounts = (...values: number[]) => values.map((amount, index) => ({ id: `a${index}`, amount, enabled: true }));
const TIPS: ChangeOf = {
  kind: "tipsLimits",
  country: "SE",
  before: { tips: amounts(10, 20, 50), raiseSteps: amounts(20), promoCap: null, driverBonusLimit: 200 },
  after: { tips: [...amounts(11, 20), { id: "a2", amount: 50, enabled: false }], raiseSteps: amounts(25), promoCap: 80, driverBonusLimit: 250 },
};
/** The English words of the old line ("SE tips 10, 20, 50 kr · raise +20 kr · promo cap none · driver bonus limit 200 kr"). */
const ENGLISH = /\b(tips|raise|promo|cap|none|driver|limit|off|values|log|saved|changed|card|rider|app|english|swedish)\b/i;

for (const language of ["sv", "fr"] as const) {
  test(`${language}: Save tips & limits, the From → to line has no English word`, () => {
    setLanguage(language);
    const lines = fromToLines(TIPS);
    assert.equal(lines.length, 4, lines.join(" | "));
    for (const line of lines) assert.doesNotMatch(line, ENGLISH, line);
    assert.match(lines[0], /10, 20, 50 kr → 11, 20, 50/);
    setLanguage("en");
  });

  test(`${language}: a command with only English audit words shows the translated generic line`, () => {
    setLanguage(language);
    const [line] = fromToLines({ kind: "audit", before: "saved", after: "changed" });
    assert.doesNotMatch(line, ENGLISH, line);
    assert.equal(line, (language === "sv" ? sv : fr)["Values before → after: see the Audit log."]);
    setLanguage("en");
  });

  test(`${language}: numbers and money keep the values (no words to translate)`, () => {
    setLanguage(language);
    assert.deepEqual(fromToLines({ kind: "audit", before: "120 kr", after: "140 kr" }), ["120 kr → 140 kr"]);
    assert.deepEqual(fromToLines({ kind: "audit", before: "5 min", after: "10 min" }), ["5 min → 10 min"]);
    setLanguage("en");
  });

  test(`${language}: payment methods and languages, the From → to line has no English word`, () => {
    setLanguage(language);
    const base = { paymentMethods: { cash: true, card: true, apple_pay: false }, languages: { rider: "sv", driver: "sv", admin: "en" } } as const;
    const lines = fromToLines({ kind: "countryApps", before: { SE: base }, after: { SE: { paymentMethods: { ...base.paymentMethods, card: false }, languages: { ...base.languages, rider: "en" } } } });
    assert.equal(lines.length, 2, lines.join(" | "));
    for (const line of lines) assert.doesNotMatch(line, ENGLISH, line);
    setLanguage("en");
  });
}

test("en: the audit words stay as they are, and the tips line reads in English", () => {
  setLanguage("en");
  assert.deepEqual(fromToLines({ kind: "audit", before: "saved", after: "changed" }), ["saved → changed"]);
  assert.equal(fromToLines(TIPS)[0], "Tips: 10, 20, 50 kr → 11, 20, 50 (off) kr");
  assert.equal(fromToLines(TIPS)[2], "Promo cap: none → 80 kr");
});

test("c38: every key is in en, sv and fr, and sv / fr are translated", () => {
  for (const key of Object.keys(enC38FromTo)) {
    assert.ok(Object.hasOwn(en, key), key);
    for (const dictionary of [sv, fr]) assert.ok(Object.hasOwn(dictionary, key), key);
  }
  for (const key of ["Values before → after: see the Audit log.", "{0} (off)", "{0}, default language"] as const) {
    assert.notEqual(sv[key], key);
    assert.notEqual(fr[key], key);
  }
});

test("the confirm dialog no longer shows the English audit text as From → to, and the words stay in the lazy chunk", () => {
  const button = readFileSync(new URL("./CommandButton.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(button, /`\$\{before\} → \$\{after\}`/);
  assert.match(button, /kind: "audit", before, after/);
  for (const file of ["./CommandButton.tsx", "./ConfirmInfo.tsx", "../pricing/CountryExtrasPanel.tsx", "../config/CountryAppsPanel.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /import \{[^}]*\} from "(\.\.\/ui\/|\.\/)fromTo"/, file);
  }
  assert.match(readFileSync(new URL("./ConfirmInfoBody.tsx", import.meta.url), "utf8"), /from "\.\/fromTo"/);
  const extras = readFileSync(new URL("../pricing/CountryExtrasPanel.tsx", import.meta.url), "utf8");
  assert.match(extras, /changeOf: \{ kind: "tipsLimits"/);
  assert.match(readFileSync(new URL("../config/CountryAppsPanel.tsx", import.meta.url), "utf8"), /changeOf: \{ kind: "countryApps"/);
});
