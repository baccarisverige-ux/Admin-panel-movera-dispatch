import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import contract from "../../../contracts/contract.json" with { type: "json" };
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { sv } from "../i18n/sv.ts";
import { offlineReasonText } from "../live/offlineReason.ts";
import { searchFeatures } from "./featureIndex.ts";
import { autoOfflineText } from "./offerRules.ts";
import { emptyDispatchBook, rulesFile } from "./rules.ts";

/**
 * Owner 2026-11-16 "It's not when driver decline ! It count when driver ignore" + "Yes, only ignored count (Rec.)" +
 * "And only exclusive / And it's about exclusive ride not radar" (contract v0.18.120 contract.json#autoOffline.declined;
 * corrects Rules decisions/driver-g4.md:25-26 "Both count"): "Go offline automatically" counts only Exclusive offers
 * (also hand-sent to one driver) the driver let run out. A decline never counts and does not reset the count. Every
 * admin text that said "missed or declined" for it says so, in sv / fr / en. Fails before: the texts said "Missed or
 * declined", the setting said "offers not accepted", the rules file said "declined or let run out".
 */
registerDictionary("sv", sv);
registerDictionary("fr", fr);
const dict = (d: object) => d as Record<string, string>;
const TEXTS: Array<[string, string, string]> = [
  ["Let {0} Exclusive offers run out in a row", "Lät {0} Exklusiva erbjudanden gå ut i rad", "A laissé expirer {0} offres Exclusives d’affilée"],
  ["Let Exclusive offers run out in a row", "Lät Exklusiva erbjudanden gå ut i rad", "A laissé expirer des offres Exclusives d’affilée"],
  ["After Exclusive offers ignored in a row", "Efter ignorerade Exklusiva erbjudanden i rad", "Après des offres Exclusives ignorées d’affilée"],
  ["A driver who lets Exclusive offers run out is set offline, so riders are not kept waiting. Declining an offer never counts.", "En förare som låter Exklusiva erbjudanden gå ut sätts offline, så att resenärer inte får vänta. Att neka ett erbjudande räknas aldrig.", "Un chauffeur qui laisse expirer des offres Exclusives est mis hors ligne, pour que les passagers n’attendent pas. Refuser une offre ne compte jamais."],
  ["Exclusive offers the driver let run out in a row. Declined offers and Radar offers do not count.", "Exklusiva erbjudanden som föraren lät gå ut i rad. Nekade erbjudanden och Radar-erbjudanden räknas inte.", "Offres Exclusives que le chauffeur a laissé expirer d’affilée. Les offres refusées et les offres Radar ne comptent pas."],
];

test("the new texts are in sv, fr and en (English is the key)", () => {
  for (const [key, swedish, french] of TEXTS) {
    assert.equal(dict(en)[key], key);
    assert.equal(dict(sv)[key], swedish);
    assert.equal(dict(fr)[key], french);
  }
});

test("the offline reason on the driver page and the Audit page no longer says 'declined'", () => {
  setLanguage("en");
  assert.equal(offlineReasonText("missed_offers", { count: 10 }), "Let 10 Exclusive offers run out in a row");
  assert.equal(offlineReasonText("missed_offers"), "Let Exclusive offers run out in a row");
  for (const [lang, word] of [["sv", "nekade"], ["fr", "refusé"]] as const) {
    setLanguage(lang);
    try {
      assert.ok(!offlineReasonText("missed_offers", { count: 10 }).includes(word), `${lang}: no '${word}'`);
      assert.ok(offlineReasonText("missed_offers", { count: 10 }).includes("10"));
    } finally {
      setLanguage("en");
    }
  }
});

test("the 'Go offline automatically' card and its row say Exclusive offers he let run out, not 'offers not accepted'", () => {
  const source = readFileSync(new URL("./OfferSections.tsx", import.meta.url), "utf8");
  const card = source.slice(source.indexOf('<Card title={tr("Go offline automatically")}'));
  const body = card.slice(0, card.indexOf("</Card>"));
  assert.ok(body.includes(`help={tr(${JSON.stringify(TEXTS[3]![0])})}`), "card help");
  assert.ok(body.includes(`label={tr(${JSON.stringify(TEXTS[2]![0])})}`), "row label");
  assert.ok(!body.includes("A driver who does not accept offers is set offline") && !body.includes('"After offers not accepted in a row"'), "the old texts are gone from the card");
  assert.ok(body.includes("autoOfflineText(zone.autoOffline.after)"), "the rule sentence is the contract's (contract.json#autoOffline.adminText)");
});

test("the rule sentence is the carried contract's; from contract 0.18.120 it says a decline never counts", () => {
  const admin = (contract as unknown as { autoOffline: { adminText: Record<"sv" | "fr" | "en", string> } }).autoOffline.adminText;
  for (const lang of ["sv", "fr", "en"] as const) assert.equal(autoOfflineText(7, lang), admin[lang].replace("{n}", "7"));
  const [, minor, patch] = contract.version.split(".").map(Number);
  if (minor! > 18 || patch! >= 120) {
    assert.equal(autoOfflineText(10, "en"), "The driver goes offline after 10 Exclusive offers in a row that he let run out (hand-sent ones too). A decline never counts and does not reset the count. Radar never counts.");
    assert.ok(autoOfflineText(10, "sv").includes("Ett nekat erbjudande räknas aldrig") && autoOfflineText(10, "fr").includes("Un refus ne compte jamais"));
  }
});

test("Dispatch 'Missed in a row' explains what it counts", () => {
  const source = readFileSync(new URL("./DriverFactsPanel.tsx", import.meta.url), "utf8");
  assert.ok(source.includes(`<th title={tr(${JSON.stringify(TEXTS[4]![0])})}>{tr("Missed in a row")}</th>`));
});

test("the rules file and the settings search follow the rule", () => {
  const glossary = rulesFile(emptyDispatchBook(), "SE", "now").glossary.autoOffline;
  assert.ok(glossary.includes("that the driver let run out (ignored)") && glossary.includes("A declined offer never counts and does not reset the count"), glossary);
  assert.ok(!glossary.includes("declined or let run out"));
  assert.ok(searchFeatures("ignored exclusive").some((entry) => entry.id === "auto-offline"));
  assert.ok(!searchFeatures("declined").some((entry) => entry.id === "auto-offline"), "searching 'declined' no longer leads to auto-offline");
});
