import { tr } from "../i18n/core.ts";

/**
 * Contract v0.18.133 (contract.json#smsSignIn; owner 2026-11-19 "Yes, build it now (Rec.)", Rules
 * decisions/session-2026-11-06.md): real sign-in codes by SMS.
 * - CountryRules.smsSignIn { enabled, dailyCap } of the COUNTRY STANDARD only; never saved = off, 200 a day
 *   (configDefaults.smsSignIn). Admin › Pricing › Tips & limits › card "Real SMS sign-in codes".
 * - It works only when the server also has the SMS company's keys (set by the owner on the server; the panel never
 *   sees them). Off: every number that is not a test number is told sign-in is not open yet, as before.
 */
export type SmsSignIn = { enabled: boolean; dailyCap: number };
export const SMS_SIGN_IN_DEFAULT: SmsSignIn = { enabled: false, dailyCap: 200 };
export const SMS_DAILY_CAP = { min: 10, max: 100_000 } as const;

const capOk = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= SMS_DAILY_CAP.min && value <= SMS_DAILY_CAP.max;

/** The stored block; anything missing or wrong is the default (the server reads it the same way: only true is on). */
export function smsSignInOf(raw: unknown): SmsSignIn {
  const value = (raw && typeof raw === "object" ? raw : {}) as { enabled?: unknown; dailyCap?: unknown };
  return { enabled: value.enabled === true, dailyCap: capOk(value.dailyCap) ? value.dailyCap : SMS_SIGN_IN_DEFAULT.dailyCap };
}

/** What stops a save (the server would answer 400 invalid_document). */
export function smsSignInIssues(name: string, value: SmsSignIn): string[] {
  return capOk(value.dailyCap) ? [] : [tr("{0} sign-in SMS per day: a whole number from {1} to {2}.", [name, SMS_DAILY_CAP.min, "100 000"])];
}

/** The save dialog lines when the switch or the daily limit changes. */
export function smsSignInLines(before: SmsSignIn, after: SmsSignIn): string[] {
  const lines: string[] = [];
  if (before.enabled !== after.enabled) lines.push(tr("Real SMS sign-in codes: {0} → {1}", [tr(before.enabled ? "on" : "off"), tr(after.enabled ? "on" : "off")]));
  if (before.dailyCap !== after.dailyCap) lines.push(tr("Sign-in SMS per day: {0} → {1}", [before.dailyCap, after.dailyCap]));
  return lines;
}

/**
 * Contract v0.18.157 (contract.json#smsSignIn.otherCountries; owner 2026-11-24 "ALL numbers must be able to log in in
 * the RIDER app"): CountryRules.smsSignInOtherCountries { enabled, dailyCap } — one server-wide switch and daily limit
 * for numbers of every country not served here, on the Sweden standard only, super admins only. Never saved = ON, 50.
 */
export const SMS_OTHER_HOME = "SE";
export const SMS_OTHER_DEFAULT: SmsSignIn = { enabled: true, dailyCap: 50 };

/** Stored block; only an exact boolean counts (missing = on, the default); a wrong cap = 50. */
export function smsOtherOf(raw: unknown): SmsSignIn {
  const value = (raw && typeof raw === "object" ? raw : {}) as { enabled?: unknown; dailyCap?: unknown };
  return { enabled: typeof value.enabled === "boolean" ? value.enabled : SMS_OTHER_DEFAULT.enabled, dailyCap: capOk(value.dailyCap) ? value.dailyCap : SMS_OTHER_DEFAULT.dailyCap };
}

export function smsOtherIssues(value: SmsSignIn): string[] {
  return capOk(value.dailyCap) ? [] : [tr("Other countries sign-in SMS per day: a whole number from {0} to {1}.", [SMS_DAILY_CAP.min, "100 000"])];
}

export function smsOtherLines(before: SmsSignIn, after: SmsSignIn): string[] {
  const lines: string[] = [];
  if (before.enabled !== after.enabled) lines.push(tr("SMS sign-in for other countries: {0} → {1}", [tr(before.enabled ? "on" : "off"), tr(after.enabled ? "on" : "off")]));
  if (before.dailyCap !== after.dailyCap) lines.push(tr("Other countries sign-in SMS per day: {0} → {1}", [before.dailyCap, after.dailyCap]));
  return lines;
}
