import type { MessageKey } from "../i18n/index.ts";

/**
 * v0.18.5 (owner G1-B2 "Real texts from admin (Recommended)", contract.json#legal): Content › Legal. The terms of use
 * and the privacy policy per country (SE, FR) in sv / fr / en, the company details the texts use, re-acceptance and
 * the version history. GET /admin/legal/{country} → { live, history }; POST /admin/legal/{country}/publish.
 * Version 0 is Movera's draft (a lawyer reviews the texts before launch).
 */

export const LEGAL_COUNTRIES = ["SE", "FR"] as const;
export type LegalCountry = (typeof LEGAL_COUNTRIES)[number];
export const LEGAL_LANGUAGES = ["sv", "fr", "en"] as const;
export type LegalLanguage = (typeof LEGAL_LANGUAGES)[number];
export const LEGAL_DOCUMENTS = ["terms", "privacy"] as const;
export type LegalDocumentId = (typeof LEGAL_DOCUMENTS)[number];

/** contract.json#legal.placeholders: replaced by the company details in the apps (a paragraph with an empty one is left out). */
export const LEGAL_PLACEHOLDERS = ["companyName", "orgNumber", "address", "supportEmail", "supportPhone"] as const;
export type LegalCompanyField = (typeof LEGAL_PLACEHOLDERS)[number];

/**
 * v0.18.8 (G6, contract.json#arrivedWaiting.termsTexts): {waitingRules} in terms paragraph 3.5 is filled per zone by
 * the server (GET /legal/{country}?zoneId=) with the zone's live waiting, no-show and cancel numbers. Not a company field.
 */
export const ZONE_PLACEHOLDER = "waitingRules" as const;

/** The server's limits (POST /admin/legal/{country}/publish). */
export const TITLE_MAX = 200;
export const TEXT_MAX = 20000;
const PHONE = /^\+[1-9]\d{6,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LegalDocument = { title: Record<LegalLanguage, string>; text: Record<LegalLanguage, string> };
export type LegalCompany = Partial<Record<LegalCompanyField, string>>;
export type LegalVersion = {
  country: string;
  version: number;
  source: "default" | "admin";
  publishedAt?: string;
  publishedBy?: string;
  reaccept: boolean;
  terms: LegalDocument;
  privacy: LegalDocument;
  company: LegalCompany;
};
export type LegalAdminView = { live: LegalVersion; history: LegalVersion[] };

export type LegalDraft = { terms: LegalDocument; privacy: LegalDocument; company: Record<LegalCompanyField, string>; reaccept: boolean };

export function isLegalCountry(value: unknown): value is LegalCountry {
  return typeof value === "string" && (LEGAL_COUNTRIES as readonly string[]).includes(value);
}

export function legalPath(country: LegalCountry): string {
  return `/admin/legal/${country}`;
}

const copyDoc = (doc: LegalDocument | undefined): LegalDocument => ({
  title: { sv: doc?.title.sv ?? "", fr: doc?.title.fr ?? "", en: doc?.title.en ?? "" },
  text: { sv: doc?.text.sv ?? "", fr: doc?.text.fr ?? "", en: doc?.text.en ?? "" },
});

/** The editor starts from a version (the live one, or an older one from the history). Re-accept starts off. */
export function draftFrom(version: LegalVersion): LegalDraft {
  const company = Object.fromEntries(LEGAL_PLACEHOLDERS.map((field) => [field, version.company?.[field] ?? ""])) as Record<LegalCompanyField, string>;
  return { terms: copyDoc(version.terms), privacy: copyDoc(version.privacy), company, reaccept: false };
}

/** The publish body: trimmed company fields, only the filled ones (an empty one is removed from the texts). */
export function publishBody(draft: LegalDraft): { terms: LegalDocument; privacy: LegalDocument; company: LegalCompany; reaccept: boolean } {
  const company: LegalCompany = {};
  for (const field of LEGAL_PLACEHOLDERS) {
    const value = field === "supportPhone" ? draft.company[field].replace(/\s+/g, "") : draft.company[field].trim();
    if (value) company[field] = value;
  }
  return { terms: copyDoc(draft.terms), privacy: copyDoc(draft.privacy), company, reaccept: draft.reaccept };
}

export type LegalProblem = { key: MessageKey; vars?: readonly unknown[] };

/** What stops a publish, in the order a person fixes it (the server answers 400 for the same). */
export function legalProblems(draft: LegalDraft): LegalProblem[] {
  const problems: LegalProblem[] = [];
  const docName: Record<LegalDocumentId, MessageKey> = { terms: "Terms of use", privacy: "Privacy policy" };
  for (const id of LEGAL_DOCUMENTS) {
    for (const language of LEGAL_LANGUAGES) {
      const title = draft[id].title[language].trim();
      const text = draft[id].text[language].trim();
      if (!title) problems.push({ key: "{0}: the title in {1} is empty.", vars: [docName[id], language.toUpperCase()] });
      else if (title.length > TITLE_MAX) problems.push({ key: "{0}: the title in {1} is longer than {2} characters.", vars: [docName[id], language.toUpperCase(), TITLE_MAX] });
      if (!text) problems.push({ key: "{0}: the text in {1} is empty.", vars: [docName[id], language.toUpperCase()] });
      else if (text.length > TEXT_MAX) problems.push({ key: "{0}: the text in {1} is longer than {2} characters.", vars: [docName[id], language.toUpperCase(), TEXT_MAX] });
    }
  }
  const email = draft.company.supportEmail.trim();
  if (email && !EMAIL.test(email)) problems.push({ key: "The support e-mail is not an e-mail address." });
  const phone = draft.company.supportPhone.trim().replace(/\s+/g, "");
  if (phone && !PHONE.test(phone)) problems.push({ key: "The support phone must start with + and the country code, for example +46 8 123 456 78." });
  return problems;
}

/** {words} in a text that are not one of the company placeholders (shown as they are in the apps). */
export function unknownPlaceholders(draft: LegalDraft): string[] {
  const known = new Set<string>([...LEGAL_PLACEHOLDERS, ZONE_PLACEHOLDER]);
  const found = new Set<string>();
  for (const id of LEGAL_DOCUMENTS) for (const language of LEGAL_LANGUAGES) for (const match of draft[id].text[language].matchAll(/\{(\w+)\}/g)) if (!known.has(match[1]!)) found.add(match[1]!);
  return [...found];
}

/** True when the draft differs from the version it started from (Publish makes a new version only then). */
export function draftChanged(draft: LegalDraft, from: LegalVersion): boolean {
  const base = draftFrom(from);
  return JSON.stringify({ ...publishBody(draft), reaccept: false }) !== JSON.stringify({ ...publishBody(base), reaccept: false }) || draft.reaccept;
}

/**
 * The newest version that asked everyone to accept again (live or in the history), or null. Server rule (v0.18.5
 * checker note): a person must accept the newest version at or after it, so a new version published without the tick
 * still has to be accepted by everyone who has not accepted that version yet.
 */
export function latestReacceptVersion(live: LegalVersion, history: readonly LegalVersion[]): number | null {
  const versions = [live, ...history].filter((item) => item.reaccept && item.source === "admin").map((item) => item.version);
  return versions.length ? Math.max(...versions) : null;
}

/** True when a terms text has no {waitingRules} yet (an admin version published before v0.18.8). */
export function missesWaitingRules(draft: LegalDraft): boolean {
  return LEGAL_LANGUAGES.some((language) => !draft.terms.text[language].includes(`{${ZONE_PLACEHOLDER}}`));
}
