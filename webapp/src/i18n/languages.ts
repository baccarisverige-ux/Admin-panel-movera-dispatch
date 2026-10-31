import { APP_LANGUAGES, CONFIG_DEFAULTS, type AppLanguage } from "../config/zoneDefaults.ts";
import type { MarketId } from "../markets/markets.ts";

/**
 * The admin panel's languages (owner Q49): English, French and Swedish, the contract languages (contract.json#languages).
 * Each admin starts in the admin default of their own country (Settings › Payment methods and languages per country)
 * and can pick another language in their profile; that choice is saved per admin and wins over the default.
 */
export const ADMIN_LANGUAGES = APP_LANGUAGES;
export type { AppLanguage };

/** Each language in its own name, for the picker ("FR · Français"). */
export const LANGUAGE_NATIVE_NAME: Record<AppLanguage, string> = { en: "English", fr: "Français", sv: "Svenska" };

/** The locale dates, times and numbers are written in. Money keeps its currency's own format. */
export const LANGUAGE_LOCALE: Record<AppLanguage, string> = { en: "en-GB", fr: "fr-FR", sv: "sv-SE" };

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === "string" && (APP_LANGUAGES as readonly string[]).includes(value);
}

/** "FR · Français": the code first, so it is the same in every language. */
export function languageOptionLabel(language: AppLanguage): string {
  return `${language.toUpperCase()} · ${LANGUAGE_NATIVE_NAME[language]}`;
}

/** The admin's own country: the first country of their scope, or Sweden (head office) for an admin of every country. */
export function homeCountry(scope: { countries?: readonly MarketId[] } | undefined): MarketId {
  return scope?.countries?.[0] ?? "SE";
}

/** "computer": before sign-in, the computer's language (owner G1-D2). */
export type LanguageSource = "chosen" | "country" | "build" | "computer";

export type LanguageInput = {
  /** What the admin picked in their profile, if anything. */
  chosen?: unknown;
  /** The admin default of the admin's country, from Settings (or the contract default until it is loaded). */
  countryDefault?: unknown;
  /** A build-wide default that replaces the country default (VITE_ADMIN_LANGUAGE; the e2e suite runs in English). */
  buildDefault?: unknown;
};

/** The admin's language and where it comes from: their own choice, else the build default, else the country default. */
export function resolveAdminLanguage(input: LanguageInput): { language: AppLanguage; source: LanguageSource; defaultLanguage: AppLanguage } {
  const defaultLanguage = isAppLanguage(input.buildDefault) ? input.buildDefault : isAppLanguage(input.countryDefault) ? input.countryDefault : "en";
  const defaultSource: LanguageSource = isAppLanguage(input.buildDefault) ? "build" : "country";
  if (isAppLanguage(input.chosen)) return { language: input.chosen, source: "chosen", defaultLanguage };
  return { language: defaultLanguage, source: defaultSource, defaultLanguage };
}

/** The contract's default language of a country (sv in Sweden, fr in France and Tunisia). */
export function contractDefaultLanguage(country: MarketId): AppLanguage {
  return CONFIG_DEFAULTS.countries[country].defaultLanguage;
}
