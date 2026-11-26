import { tr } from "../i18n/core.ts";

/**
 * Contract v0.18.133 (contract.json#smsSignIn; owner 2026-11-19 "Yes, build it now (Rec.)", Rules
 * decisions/session-2026-11-06.md): real sign-in codes by SMS.
 * - CountryRules.smsSignIn { enabled, dailyCap } of the COUNTRY STANDARD only; never saved = off, 200 a day
 *   (configDefaults.smsSignIn). Admin › Pricing › Tips & limits › card "Real SMS sign-in codes".
 * - It works only when the server also has the SMS company's keys (set by the owner on the server; the panel never
 *   sees them). Off: every number that is not a test number is told sign-in is not open yet, as before.
 */
/**
 * Contract v0.18.168 (contract.json#smsProviders; owner 2026-11-26 "Am going to change company sms to infobip", then
 * "Infobip + 46elks en secours (Recommandé)"): providerOrder, the SMS companies the server tries, first first; when the
 * first does not take the SMS the next one sends it (never two SMS for one code). Missing or wrong = 46elks then Infobip.
 * It is written only when it is not the default, so a server older than v0.18.168 still takes the save.
 */
export const SMS_COMPANIES = ["infobip", "46elks"] as const;
export type SmsCompany = (typeof SMS_COMPANIES)[number];
/** Owner 2026-11-26 "Keep 46elks working primary until we fix Infobip": 46elks first by default. */
export const SMS_PROVIDER_ORDER_DEFAULT: SmsCompany[] = ["46elks", "infobip"];
/** The four choices of the "SMS company order" field. */
export const SMS_PROVIDER_ORDERS: SmsCompany[][] = [["46elks", "infobip"], ["infobip", "46elks"], ["46elks"], ["infobip"]];
const COMPANY_NAME: Record<SmsCompany, string> = { infobip: "Infobip", "46elks": "46elks" };
export const providerOrderOk = (value: unknown): value is SmsCompany[] => Array.isArray(value) && value.length >= 1 && value.length <= 2 && new Set(value).size === value.length && value.every((v) => (SMS_COMPANIES as readonly unknown[]).includes(v));
const orderOf = (value: unknown): SmsCompany[] => (providerOrderOk(value) ? [...value] : [...SMS_PROVIDER_ORDER_DEFAULT]);
export const orderKey = (order: readonly SmsCompany[]): string => order.join(",");
export const isDefaultOrder = (order: readonly SmsCompany[]): boolean => orderKey(order) === orderKey(SMS_PROVIDER_ORDER_DEFAULT);
/** "Infobip, then 46elks (backup)" / "46elks only". */
export function providerOrderLabel(order: readonly SmsCompany[]): string {
  return order.length === 1 ? tr("{0} only", [COMPANY_NAME[order[0]!]]) : tr("{0}, then {1} (backup)", [COMPANY_NAME[order[0]!], COMPANY_NAME[order[1]!]]);
}
function orderLines(before: readonly SmsCompany[], after: readonly SmsCompany[]): string[] {
  return orderKey(before) === orderKey(after) ? [] : [tr("SMS company order: {0} → {1}", [providerOrderLabel(before), providerOrderLabel(after)])];
}

export type SmsSignIn = { enabled: boolean; dailyCap: number; providerOrder: SmsCompany[] };
export const SMS_SIGN_IN_DEFAULT: SmsSignIn = { enabled: false, dailyCap: 200, providerOrder: [...SMS_PROVIDER_ORDER_DEFAULT] };
export const SMS_DAILY_CAP = { min: 10, max: 100_000 } as const;

const capOk = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= SMS_DAILY_CAP.min && value <= SMS_DAILY_CAP.max;

/** The stored block; anything missing or wrong is the default (the server reads it the same way: only true is on). */
export function smsSignInOf(raw: unknown): SmsSignIn {
  const value = (raw && typeof raw === "object" ? raw : {}) as { enabled?: unknown; dailyCap?: unknown; providerOrder?: unknown };
  return { enabled: value.enabled === true, dailyCap: capOk(value.dailyCap) ? value.dailyCap : SMS_SIGN_IN_DEFAULT.dailyCap, providerOrder: orderOf(value.providerOrder) };
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
  lines.push(...orderLines(before.providerOrder, after.providerOrder));
  return lines;
}

/**
 * Contract v0.18.157 (contract.json#smsSignIn.otherCountries; owner 2026-11-24 "ALL numbers must be able to log in in
 * the RIDER app"): CountryRules.smsSignInOtherCountries { enabled, dailyCap } — one server-wide switch and daily limit
 * for numbers of every country not served here, on the Sweden standard only, super admins only. Never saved = ON, 50.
 */
export const SMS_OTHER_HOME = "SE";
export type SmsOther = SmsSignIn & { perCodeDailyCap: number; perMinuteCap: number; blockedCallingCodes: string[] };
export const SMS_OTHER_DEFAULT: SmsOther = { enabled: true, dailyCap: 50, perCodeDailyCap: 10, perMinuteCap: 30, blockedCallingCodes: [], providerOrder: [...SMS_PROVIDER_ORDER_DEFAULT] };
export const SMS_PER_CODE_CAP = { min: 1, max: 100_000 } as const;
export const SMS_PER_MINUTE_CAP = { min: 1, max: 10_000 } as const;
const between = (value: unknown, r: { min: number; max: number }): value is number => typeof value === "number" && Number.isInteger(value) && value >= r.min && value <= r.max;
/** A calling code as the admin types it: "+" and 1-4 digits. */
export const CALLING_CODE = /^\+[1-9][0-9]{0,3}$/;
const blockedOk = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 50 && new Set(value).size === value.length && value.every((v) => typeof v === "string" && CALLING_CODE.test(v));

/** Stored block; only an exact boolean counts (missing = on, the default); a wrong number = its default. */
export function smsOtherOf(raw: unknown): SmsOther {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    enabled: typeof value["enabled"] === "boolean" ? value["enabled"] : SMS_OTHER_DEFAULT.enabled,
    dailyCap: capOk(value["dailyCap"]) ? value["dailyCap"] : SMS_OTHER_DEFAULT.dailyCap,
    perCodeDailyCap: between(value["perCodeDailyCap"], SMS_PER_CODE_CAP) ? value["perCodeDailyCap"] : SMS_OTHER_DEFAULT.perCodeDailyCap,
    perMinuteCap: between(value["perMinuteCap"], SMS_PER_MINUTE_CAP) ? value["perMinuteCap"] : SMS_OTHER_DEFAULT.perMinuteCap,
    blockedCallingCodes: blockedOk(value["blockedCallingCodes"]) ? [...value["blockedCallingCodes"]] : [],
    providerOrder: orderOf(value["providerOrder"]),
  };
}

/** "+882, +883" → ["+882", "+883"] (spaces and repeats dropped). */
export const parseCallingCodes = (text: string): string[] => [...new Set(text.split(/[\s,;]+/).map((v) => v.trim()).filter(Boolean))];

export function smsOtherIssues(value: SmsOther): string[] {
  const issues: string[] = [];
  if (!capOk(value.dailyCap)) issues.push(tr("Other countries sign-in SMS per day: a whole number from {0} to {1}.", [SMS_DAILY_CAP.min, "100 000"]));
  if (!between(value.perCodeDailyCap, SMS_PER_CODE_CAP)) issues.push(tr("SMS per calling code per day: a whole number from {0} to {1}.", [SMS_PER_CODE_CAP.min, "100 000"]));
  if (!between(value.perMinuteCap, SMS_PER_MINUTE_CAP)) issues.push(tr("Sign-in SMS per minute: a whole number from {0} to {1}.", [SMS_PER_MINUTE_CAP.min, "10 000"]));
  if (!blockedOk(value.blockedCallingCodes)) issues.push(tr("Blocked calling codes: up to 50 codes like +882, each once."));
  return issues;
}

export function smsOtherLines(before: SmsOther, after: SmsOther): string[] {
  const lines: string[] = [];
  if (before.enabled !== after.enabled) lines.push(tr("SMS sign-in for other countries: {0} → {1}", [tr(before.enabled ? "on" : "off"), tr(after.enabled ? "on" : "off")]));
  if (before.dailyCap !== after.dailyCap) lines.push(tr("Other countries sign-in SMS per day: {0} → {1}", [before.dailyCap, after.dailyCap]));
  if (before.perCodeDailyCap !== after.perCodeDailyCap) lines.push(tr("SMS per calling code per day: {0} → {1}", [before.perCodeDailyCap, after.perCodeDailyCap]));
  if (before.perMinuteCap !== after.perMinuteCap) lines.push(tr("Sign-in SMS per minute: {0} → {1}", [before.perMinuteCap, after.perMinuteCap]));
  lines.push(...orderLines(before.providerOrder, after.providerOrder));
  if (before.blockedCallingCodes.join(",") !== after.blockedCallingCodes.join(",")) lines.push(tr("Blocked calling codes: {0} → {1}", [before.blockedCallingCodes.join(", ") || "—", after.blockedCallingCodes.join(", ") || "—"]));
  return lines;
}
