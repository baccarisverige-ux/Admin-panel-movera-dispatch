import { WAITING_PARAGRAPHS } from "./waitingParagraphs.ts";
import { LEGAL_LANGUAGES, ZONE_PLACEHOLDER, type LegalCountry, type LegalDraft, type LegalLanguage } from "./legal.ts";

// v0.18.8 (G6): loaded only when the admin adds the paragraphs (not on the panel's first load).

/** The waiting, no-show and cancel paragraphs 3.1–3.5 of Movera's own terms. */
export function waitingParagraphs(country: LegalCountry, language: LegalLanguage): string {
  return WAITING_PARAGRAPHS[country]?.[language] ?? "";
}

/** Adds paragraphs 3.1–3.5 to every terms text that lacks {waitingRules}: before paragraph 4, else at the end. */
export function withWaitingParagraphs(draft: LegalDraft, country: LegalCountry): LegalDraft {
  const text = { ...draft.terms.text };
  for (const language of LEGAL_LANGUAGES) {
    const current = text[language];
    const add = waitingParagraphs(country, language);
    if (!add || current.includes(`{${ZONE_PLACEHOLDER}}`)) continue;
    const at = current.search(/\n\n4\. /);
    text[language] = at < 0 ? `${current.trimEnd()}\n\n${add}` : `${current.slice(0, at)}\n\n${add}${current.slice(at)}`;
  }
  return { ...draft, terms: { ...draft.terms, text } };
}
