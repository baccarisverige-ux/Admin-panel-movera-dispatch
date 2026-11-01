import assert from "node:assert/strict";
import test from "node:test";
import { contractJson } from "../contract/load.ts";
import { LEGAL_COUNTRIES, LEGAL_PLACEHOLDERS, draftChanged, missesWaitingRules, latestReacceptVersion, draftFrom, legalPath, legalProblems, publishBody, unknownPlaceholders, type LegalVersion } from "./legal.ts";
import { withWaitingParagraphs } from "./legalWaiting.ts";

/**
 * Owner G1-B2 (2026-10-30, "Real texts from admin (Recommended)"): draft terms + privacy for SE and FR (sv/fr/en),
 * edited in admin Content, company details shown once filled, re-accept on a new version, lawyer review before launch.
 */
type Contract = { legal: { countries: string[]; placeholders: string[]; defaults: Record<string, { terms: LegalVersion["terms"]; privacy: LegalVersion["privacy"] }> } };
const contract = contractJson<Contract>("contract.json");
const drafts = (country: string): LegalVersion => ({ country, version: 0, source: "default", reaccept: false, ...contract.legal.defaults[country]!, company: {} });

test("G1-B2: countries and company placeholders equal contract.json#legal", () => {
  assert.deepEqual([...LEGAL_COUNTRIES], contract.legal.countries);
  assert.deepEqual([...LEGAL_PLACEHOLDERS], contract.legal.placeholders);
  assert.equal(legalPath("FR"), "/admin/legal/FR");
});

test("G1-B2: the contract drafts of SE and FR are publishable as they are (every title and text in sv/fr/en)", () => {
  for (const country of LEGAL_COUNTRIES) {
    const draft = draftFrom(drafts(country));
    assert.deepEqual(legalProblems(draft), [], country);
    assert.deepEqual(unknownPlaceholders(draft), [], `${country}: only company placeholders`);
    assert.match(draft.terms.text.en, /^Draft – to be reviewed by a lawyer before launch/);
    assert.equal(draftChanged(draft, drafts(country)), false);
  }
});

test("G1-B2: an empty language, a bad e-mail or a phone without + stops the publish", () => {
  const draft = draftFrom(drafts("SE"));
  draft.privacy.text.fr = "  ";
  draft.terms.title.sv = "";
  draft.company.supportEmail = "support-at-movera";
  draft.company.supportPhone = "08 123 456";
  const keys = legalProblems(draft).map((problem) => problem.key);
  assert.deepEqual(keys, ["{0}: the title in {1} is empty.", "{0}: the text in {1} is empty.", "The support e-mail is not an e-mail address.", "The support phone must start with + and the country code, for example +46 8 123 456 78."]);
});

test("G1-B2: only filled company fields are sent (trimmed, phone without spaces); re-accept is sent", () => {
  const draft = draftFrom(drafts("FR"));
  draft.company.companyName = "  Movera SAS ";
  draft.company.supportPhone = "+33 1 23 45 67 89";
  draft.reaccept = true;
  const body = publishBody(draft);
  assert.deepEqual(body.company, { companyName: "Movera SAS", supportPhone: "+33123456789" });
  assert.equal(body.reaccept, true);
  assert.equal(body.terms.title.fr, contract.legal.defaults["FR"]!.terms.title.fr);
  assert.deepEqual(legalProblems(draft), []);
  assert.equal(draftChanged(draft, drafts("FR")), true);
});

test("G1-B2: a typo in a placeholder is pointed out", () => {
  const draft = draftFrom(drafts("SE"));
  draft.terms.text.en += "\n\nCall {suportPhone}.";
  assert.deepEqual(unknownPlaceholders(draft), ["suportPhone"]);
});

test("G1-B2: a published version keeps its company details in the editor; re-accept starts off", () => {
  const published: LegalVersion = { ...drafts("SE"), version: 3, source: "admin", reaccept: true, company: { companyName: "Movera AB", orgNumber: "559000-0000" } };
  const draft = draftFrom(published);
  assert.equal(draft.company.companyName, "Movera AB");
  assert.equal(draft.company.address, "");
  assert.equal(draft.reaccept, false);
});

// Checker (v0.18.5): a version published without the tick after one with "Ask everyone to accept again" — people who
// have not accepted that one are still asked (server: newest version at or after the latest re-accept version).
test("G1-B2: the latest re-accept version is found in the live version and the history", () => {
  const v = (version: number, reaccept: boolean): LegalVersion => ({ ...drafts("SE"), version, source: "admin", reaccept });
  assert.equal(latestReacceptVersion(drafts("SE"), []), null);
  assert.equal(latestReacceptVersion(v(3, true), [v(3, true), v(2, false)]), 3);
  assert.equal(latestReacceptVersion(v(4, false), [v(4, false), v(3, true), v(2, true)]), 3);
  assert.equal(latestReacceptVersion(v(2, false), [v(2, false), v(1, false)]), null);
});

test("G6: {waitingRules} is a zone placeholder; paragraphs 3.1–3.5 are added to an older admin text before paragraph 4", () => {
  for (const country of LEGAL_COUNTRIES) {
    const draft = draftFrom(drafts(country));
    assert.equal(missesWaitingRules(draft), false, country);
    for (const language of ["sv", "fr", "en"] as const) {
      const old = draft.terms.text[language].replace(/\n\n3\.1 [\s\S]*?(?=\n\n4\. )/, "");
      assert.ok(!old.includes("{waitingRules}"));
      draft.terms.text[language] = old;
    }
    assert.equal(missesWaitingRules(draft), true);
    const fixed = withWaitingParagraphs(draft, country);
    assert.equal(missesWaitingRules(fixed), false);
    assert.equal(fixed.terms.text.en, drafts(country).terms.text.en, `${country}: same as Movera's text`);
    assert.equal(withWaitingParagraphs(fixed, country).terms.text.sv, fixed.terms.text.sv, "added once");
  }
});
