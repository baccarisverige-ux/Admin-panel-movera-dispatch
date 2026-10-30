import { isAppLanguage, type AppLanguage } from "./languages.ts";

/**
 * Owner G1-D2 (2026-10-30, "Computer language + globe (Recommended)"): before anyone is signed in, the sign-in page,
 * "Forgot your password?", the set-password page and the page after a sign-out are in the computer's language when it
 * is Swedish, French or English (else English). The globe button picks another of the three; the choice is
 * remembered on this computer (this browser) only. After sign-in the admin's own panel language decides, as before.
 */
export const SIGN_IN_LANGUAGE_KEY = "movera.admin.signInLanguage";

/** The first of the computer's languages (navigator.languages, in order) that the panel has; English otherwise. */
export function computerLanguage(languages: readonly string[] | undefined): AppLanguage {
  for (const tag of languages ?? []) {
    const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
    if (isAppLanguage(primary)) return primary;
  }
  return "en";
}

export type SignInLanguage = { language: AppLanguage; source: "computer" | "chosen" };

/** The globe's choice on this computer wins; else the computer's language. */
export function resolveSignInLanguage(stored: unknown, languages: readonly string[] | undefined): SignInLanguage {
  return isAppLanguage(stored) ? { language: stored, source: "chosen" } : { language: computerLanguage(languages), source: "computer" };
}

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function browserLanguages(): readonly string[] {
  const nav = typeof globalThis.navigator === "undefined" ? undefined : globalThis.navigator;
  if (!nav) return [];
  return nav.languages?.length ? nav.languages : nav.language ? [nav.language] : [];
}

const listeners = new Set<() => void>();
let current: SignInLanguage | null = null;

/** The sign-in pages' language now (read once, then kept until the globe changes it). */
export function signInLanguage(): SignInLanguage {
  if (!current) current = resolveSignInLanguage(storage()?.getItem(SIGN_IN_LANGUAGE_KEY), browserLanguages());
  return current;
}

/** The globe: switch the sign-in pages now and remember the choice on this computer. */
export function chooseSignInLanguage(language: AppLanguage): void {
  try {
    storage()?.setItem(SIGN_IN_LANGUAGE_KEY, language);
  } catch {
    // Private mode or a full storage: the choice still holds until the page is closed.
  }
  current = { language, source: "chosen" };
  for (const listener of listeners) listener();
}

export function subscribeSignInLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
