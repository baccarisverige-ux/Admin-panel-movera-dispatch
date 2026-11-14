import type { AppLanguage } from "../config/zoneDefaults.ts";
import type { MessageKey } from "./en.ts";
import { LANGUAGE_LOCALE } from "./languages.ts";

/**
 * A small typed dictionary: the English text is the key, and fr.ts / sv.ts must have every key of en.ts
 * (the compiler checks it; i18n.test.ts checks the placeholders too). Placeholders are {0}, {1} or {name}.
 * Audit data and text people typed are never passed through here: they stay as they are.
 * English needs no dictionary at run time (a key is its own English text); French and Swedish load on first use,
 * so the panel only downloads the language the admin reads.
 */
export type { MessageKey };
export type Dictionary = Readonly<Record<MessageKey, string>>;

const loaded: Partial<Record<AppLanguage, Readonly<Record<string, string>>>> = {};
const LOADERS: Record<Exclude<AppLanguage, "en">, () => Promise<Dictionary>> = {
  fr: () => import("./fr.ts").then((module) => module.fr),
  sv: () => import("./sv.ts").then((module) => module.sv),
};

export function isLanguageLoaded(language: AppLanguage): boolean {
  return language === "en" || Boolean(loaded[language]);
}

/**
 * BQ-A27 (proven by e2e/live-language-fallback.spec.ts): Chromium remembers a language file that failed to load and
 * answers every later import() of it with the same error, so trying again needs a new address. The browser's error
 * names the file ("Failed to fetch dynamically imported module: https://…/assets/sv-….js"); a new try loads that file
 * with ?retry=N. Browsers whose error names no file (Safari) just import again.
 */
const failedFile: Partial<Record<AppLanguage, string>> = {};
let freshTries = 0;

/** The file a failed import() names, without its query; undefined when the error names none. */
export function failedImportUrl(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const match = /(https?:\/\/[^\s?#]+\.[cm]?[jt]sx?)(?:[?#]\S*)?\s*$/.exec(message);
  return match?.[1];
}

/** The same file under a new address, so the browser fetches it again. */
export function freshUrl(url: string, n: number): string {
  return `${url}${url.includes("?") ? "&" : "?"}retry=${n}`;
}

/** The dictionary a language file exports (its export name may be shortened in the build). */
function dictionaryOf(module: Record<string, unknown>, language: AppLanguage): Dictionary {
  const named = module[language];
  const found = named && typeof named === "object" ? named : Object.values(module).find((value) => value && typeof value === "object" && "Dashboard" in (value as object));
  if (!found) throw new Error(`No ${language} dictionary in the loaded file`);
  return found as Dictionary;
}

/** Loads a language's dictionary (once). English is always there. A try after a failure fetches the file again. */
export async function loadLanguage(language: AppLanguage, retry = false): Promise<void> {
  if (isLanguageLoaded(language) || language === "en") return;
  const file = retry ? failedFile[language] : undefined;
  try {
    loaded[language] = file
      ? dictionaryOf(await import(/* @vite-ignore */ freshUrl(file, (freshTries += 1))) as Record<string, unknown>, language)
      : await LOADERS[language]();
  } catch (error) {
    failedFile[language] ??= failedImportUrl(error);
    throw error;
  }
}

/**
 * BQ-A27: how long to wait before each new try of a language file that failed to load (4 tries, about 4.6 s in all).
 * After the last try the panel shows English with a note instead of "…" for good.
 */
export const LANGUAGE_RETRY_DELAYS_MS: readonly number[] = [400, 1200, 3000];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Loads a language, trying again with a growing wait when the file fails; false when every try failed. */
export async function loadLanguageWithRetry(
  language: AppLanguage,
  { load = loadLanguage, wait = sleep, delays = LANGUAGE_RETRY_DELAYS_MS }: { load?: (language: AppLanguage, retry: boolean) => Promise<void>; wait?: (ms: number) => Promise<void>; delays?: readonly number[] } = {},
): Promise<boolean> {
  if (language === "en") return true;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await load(language, attempt > 0);
      return true;
    } catch {
      if (attempt >= delays.length) return false;
      await wait(delays[attempt]);
    }
  }
}

/** Puts a dictionary in place without loading it (tests). */
export function registerDictionary(language: Exclude<AppLanguage, "en">, dictionary: Dictionary): void {
  loaded[language] = dictionary;
}

let current: AppLanguage = "en";
const listeners = new Set<() => void>();

export function currentLanguage(): AppLanguage {
  return current;
}

/** Switch the language for everything rendered from now on (load it first with loadLanguage). */
export function setLanguage(language: AppLanguage): void {
  if (language === current) return;
  current = language;
  for (const listener of listeners) listener();
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The locale of the chosen language, for dates, times and numbers. */
export function uiLocale(): string {
  return LANGUAGE_LOCALE[current];
}

export type Vars = readonly unknown[] | Readonly<Record<string, unknown>>;

export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    // Same as a template literal: a part that is there is written, even when it is null or undefined.
    return Object.hasOwn(vars, name) ? String((vars as Record<string, unknown>)[name]) : whole;
  });
}

/** The text of a key in a language; the key itself (its English) when the language has nothing for it. */
export function translate(language: AppLanguage, key: string, vars?: Vars): string {
  const dictionary = loaded[language];
  const text = dictionary && Object.hasOwn(dictionary, key) ? dictionary[key] : key;
  return fill(text, vars);
}

/** Translate a fixed text of the panel. */
export function tr(key: MessageKey, vars?: Vars): string {
  return translate(current, key, vars);
}

/**
 * Translate a text known only at run time (a label from a list); unknown texts come back as they are, and so does
 * anything that is not a text (a number, or a missing label, so `trx(label) ?? fallback` still falls back).
 */
export function trx<T>(text: T, vars?: Vars): T extends string ? string : T {
  return (typeof text === "string" ? translate(current, text, vars) : text) as T extends string ? string : T;
}

/**
 * A status line made of sentences ("Failed. Your role cannot do that."): each sentence that has a translation is
 * translated, the rest (a record id, a server text without an entry) stays as it is.
 */
export function trSentences(text: string): string {
  if (!text || current === "en") return text;
  if (hasMessage(text)) return trx(text);
  return text.split(/(?<=[.!?…])\s+/).map((part) => (hasMessage(part) ? trx(part) : part)).join(" ");
}

/** True when the current language has an entry for the text (a fixed text of the panel, not data). */
export function hasMessage(text: string): boolean {
  const dictionary = loaded[current];
  return Boolean(dictionary && Object.hasOwn(dictionary, text));
}

/** A date and time in the chosen language, always in the time zone given (the record's zone or market). */
export function formatDateTime(at: string | number | Date, options: Intl.DateTimeFormatOptions): string {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(uiLocale(), options).format(date);
}

/** A number (not money) in the chosen language. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(uiLocale(), options).format(value);
}
