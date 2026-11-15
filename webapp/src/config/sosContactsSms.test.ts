/**
 * BQ-V34 (contract v0.18.101 contract.json#sosContactsSms, owner 2026-11-02 Q2 "Use them in SOS (Recommended)",
 * Rules decisions/driver-g14.md:12): the admin's on/off for the SMS to the driver's emergency contacts on SOS
 * (CountryRules.sosContactsSms, country standard only) and the line on an SOS case per Incident.contactsSms status.
 * The texts are the contract's texts.admin (sv / fr / en), as they are.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerDictionary, setLanguage } from "../i18n/core.ts";
import { en } from "../i18n/en.ts";
import { fr } from "../i18n/fr.ts";
import { sv } from "../i18n/sv.ts";
import { completeCountrySettings, countrySettingsLines, defaultCountrySettings, PRICING_FIELDS } from "./countrySettings.ts";
import { CONTACTS_SMS_STATUSES, SOS_CONTACTS_SMS_DEFAULT, contactsSmsLine, contactsSmsOf, sosContactsSmsOf } from "./sosContactsSms.ts";
import { countryRulesOf } from "../live/configDocs.ts";
import { incidentRecord } from "../live/incidents.ts";
import { caseOf, emptyIncidentOps } from "../safety/cases.ts";

const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const AT = "2026-11-14T22:00:00Z";

test("setting: default on (the owner's answer), a stored true / false is read, anything else is the default", () => {
  assert.equal(SOS_CONTACTS_SMS_DEFAULT, true);
  assert.equal(defaultCountrySettings("SE").sosContactsSms, true);
  assert.equal(sosContactsSmsOf(false), false);
  assert.equal(sosContactsSmsOf(true), true);
  assert.equal(sosContactsSmsOf(undefined), true);
  assert.equal(sosContactsSmsOf("no"), true);
  assert.equal(completeCountrySettings("FR", { sosContactsSms: false }).sosContactsSms, false);
  assert.ok((PRICING_FIELDS as readonly string[]).includes("sosContactsSms"));
});

test("a change is one line in the save dialog", () => {
  const before = defaultCountrySettings("SE");
  assert.equal(countrySettingsLines("SE", before, { ...before, sosContactsSms: false }).length, 1);
  assert.deepEqual(countrySettingsLines("SE", before, before), []);
});

test("saved on the country standard only: the document carries it when given, never otherwise", () => {
  const input = { tips: [], raiseSteps: [], driverBonus: { defaultLimit: 100, hardMax: 500 } };
  assert.equal(countryRulesOf("SE", "SEK", { ...input, sosContactsSms: false }, null)["sosContactsSms"], false);
  assert.equal("sosContactsSms" in countryRulesOf("SE", "SEK", input, { sosContactsSms: false }), false);
  const live = src("../live/liveSettings.ts");
  assert.match(live, /id === standardKey\(market\.id\) \? \{[^}]*sosContactsSms: next\.sosContactsSms/);
  assert.match(live, /sosContactsSms: sosContactsSmsOf\(/);
});

test("the switch is on the Emergency numbers card, editable on the standard only", () => {
  const editor = src("../pricing/EmergencyNumbersEditor.tsx");
  assert.match(editor, /data-testid="sos-contacts-sms"/);
  assert.match(editor, /tr\("SMS to the driver's emergency contacts on SOS"\)/);
  assert.match(editor, /disabled=\{!editable\}[^>]*onChange=\{\(event\) => onSosSms\(event\.target\.checked\)\}|onChange=\{\(event\) => onSosSms\(event\.target\.checked\)\}[^>]*disabled=\{!editable\}/);
  const panel = src("../pricing/CountryExtrasPanel.tsx");
  assert.match(panel, /sosSms=\{onStandard \? shown\.sosContactsSms : countrySettingsOf\(book, country\)\.sosContactsSms\}/);
  assert.match(panel, /onSosSms=\{\(sosContactsSms\) => edit\(\{ sosContactsSms \}\)\}/);
});

test("Incident.contactsSms is read from the server and reaches the case; a bad or missing one is nothing", () => {
  assert.deepEqual(contactsSmsOf({ status: "not_connected", contacts: 2, at: AT }), { status: "not_connected", contacts: 2, at: AT });
  assert.deepEqual(contactsSmsOf({ status: "sent", contacts: 3, sent: 2, at: AT }), { status: "sent", contacts: 3, sent: 2, at: AT });
  assert.equal(contactsSmsOf({ status: "maybe", contacts: 1 }), null);
  assert.equal(contactsSmsOf(undefined), null);
  assert.deepEqual([...CONTACTS_SMS_STATUSES], ["off", "no_contacts", "not_connected", "queued", "sent", "failed"]);
  const server = { incidentId: "inc_1", kind: "sos", severity: "critical", status: "open" as const, openedAt: AT, zoneId: "Z001", raisedBy: "driver" as const, contactsSms: { status: "not_connected" as const, contacts: 2, at: AT } };
  const record = incidentRecord(server);
  assert.deepEqual(record.liveContactsSms, { status: "not_connected", contacts: 2, at: AT });
  assert.equal("liveContactsSms" in incidentRecord({ ...server, contactsSms: undefined }), false);
  const item = caseOf(record, { draftRev: 1, policies: {}, incidents: {} }, emptyIncidentOps(), Date.parse(AT));
  assert.deepEqual(item.contactsSms, { status: "not_connected", contacts: 2, at: AT });
});

test("one line per status, in the contract's words (sv / fr / en)", () => {
  registerDictionary("sv", sv);
  registerDictionary("fr", fr);
  const line = (status: string, contacts = 2, sent?: number) => contactsSmsLine({ status: status as never, contacts, ...(sent === undefined ? {} : { sent }), at: AT });
  setLanguage("en");
  assert.equal(line("off", 0), "SMS to emergency contacts: off");
  assert.equal(line("no_contacts", 0), "SMS to emergency contacts: the driver has none");
  assert.equal(line("not_connected"), "SMS to 2 emergency contacts: not connected (no SMS company yet)");
  assert.equal(line("queued"), "SMS to 2 emergency contacts: sending");
  assert.equal(line("sent", 3, 2), "SMS sent to 2 of 3 emergency contacts");
  assert.equal(line("failed"), "SMS to 2 emergency contacts failed");
  setLanguage("sv");
  assert.equal(line("not_connected"), "Sms till 2 nödkontakter: inte anslutet (inget sms-företag än)");
  assert.equal(line("sent", 3, 2), "Sms skickat till 2 av 3 nödkontakter");
  assert.equal(line("off", 0), "Sms till nödkontakter: av");
  setLanguage("fr");
  assert.equal(line("failed"), "Échec du SMS à 2 contacts d’urgence");
  assert.equal(line("no_contacts", 0), "SMS aux contacts d’urgence : le chauffeur n’en a aucun");
  assert.equal(fr["SMS to the driver's emergency contacts on SOS"], "SMS aux contacts d’urgence du chauffeur lors d’un SOS");
  assert.equal(sv["SMS to the driver's emergency contacts on SOS"], "Sms till förarens nödkontakter vid SOS");
  assert.equal(en["SMS to the driver's emergency contacts on SOS"], "SMS to the driver's emergency contacts on SOS");
  setLanguage("en");
});

test("the SOS case page shows the line next to the emergency contacts", () => {
  const page = src("../pages/SafetyPage.tsx");
  assert.match(page, /item\.contactsSms \? <p className="op-help" data-testid="sos-contacts-sms-line">[^\n]*contactsSmsLine\(item\.contactsSms\)/);
});
