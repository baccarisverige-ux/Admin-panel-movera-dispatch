import { MARKETS, market, type MarketId } from "../markets/markets.ts";
import { tr } from "../i18n/core.ts";
import { CALL_DEFAULTS, callSettingsIssues, callSettingsLines, callSettingsOf, type CallSettings } from "./callSettings.ts";
import { emergencyDefaults, emergencyNumbersIssues, emergencyNumbersLines, emergencyNumbersOf, type EmergencyNumber } from "./emergencyNumbers.ts";
import { chatSettingsIssues, chatSettingsLines, chatSettingsOf, defaultChatSettings, type ChatSettings } from "./chatSettings.ts";
import { DONT_MATCH_DEFAULTS, dontMatchIssues, dontMatchLines, dontMatchOf, type DontMatchSettings } from "./dontMatchSettings.ts";
import { fromSek, isLargePriceChange, roundTo, tipMax } from "../pricing/zonePricing.ts";
import { RAISE_CAP_SEK } from "../dispatch/rules.ts";
import { APP_LANGUAGES, CONFIG_DEFAULTS, ZONE_PAYMENT_METHODS, type AppLanguage, type ZonePaymentMethod } from "./zoneDefaults.ts";

/**
 * Per-country settings of contract v0.4.0 that have one value for the whole country (contracts/CONTRACT.md §6):
 * tips and raise-offer quick steps (Q5, Q6), the promo cap (Q10) and the driver bonus limit (Q17), set in Pricing;
 * the payment methods (Q7 FINAL) and the default app languages (Q49), set in Settings.
 * Amounts are major units (kr, €, DT) of the country's currency, like the rest of Pricing. The app config exporters
 * read them; a country never saved gets the contract defaults (CONFIG_DEFAULTS).
 */
export const COUNTRY_SETTINGS_KEY = "countrySettings";

/** One amount the rider can pick. A deactivated amount stays in the list (and in the export, with enabled: false). */
export type AmountOption = { id: string; amount: number; enabled: boolean };

export const APP_IDS = ["rider", "driver", "admin"] as const;
export type LanguageApp = (typeof APP_IDS)[number];

export type CountrySettings = {
  tips: AmountOption[];
  raiseSteps: AmountOption[];
  /** The highest promo discount on one ride, in local money; null = no cap. */
  promoCap: number | null;
  /** The most an admin may add to a trip for the driver (Q16, Q17). Never above the country's hard max. */
  driverBonusLimit: number;
  paymentMethods: Record<ZonePaymentMethod, boolean>;
  /** v0.18.33 (fix job 5, owner Q6): "Use wallet first" → RiderAppConfig.wallet.usedFirst of the country's zones (default on). */
  walletFirst: boolean;
  languages: Record<LanguageApp, AppLanguage>;
  /**
   * Live G8 fix 1 (decision driver-g8.md #2, admin ticks real per country): a method some zones of the country serve
   * and others do not, with the zones where it is off. Shown mixed; Save makes it the same in the whole country.
   */
  mixedMethods?: Partial<Record<ZonePaymentMethod, string[]>>;
  /**
   * v0.18.10 (G8, contract.json#finish.tips.settings → RiderAppConfig.tipRules): cash tips after the trip (default off =
   * only in the car), a typed amount (default off) and its maximum in local money (SE 200 kr, FR 20 €).
   */
  tipRules: TipRules;
  /**
   * Live G8 round 3 item 1: a tip switch the zones (or the zones chosen at the top) disagree on, with the zones where
   * it is off. Shown mixed; Save makes it the same in those zones.
   */
  mixedTipRules?: MixedTipRules;
  /** v0.18.10 checker: the largest single change of a driver's pay on a trip (CountryRules.driverPayChangeMax), local money. */
  driverPayChangeMax: number;
  /**
   * v0.18.26 (owner 2026-11-04): limits per person in this country (CountryRules.limits): saved places per rider and
   * emergency contacts per rider or driver. Defaults 50 and 10.
   */
  personLimits: PersonLimits;
  /** v0.18.33 (owner 2026-11-05): a driver on a trip gets Exclusives only after this % of his route (CountryRules.onTripOffers, default 70). */
  onTripMinDonePct: number;
  /** v0.18.33 (owner Q5 2026-11-05): minutes after accept from which the rider of a chained trip may cancel free (default 10). */
  chainLateFreeCancelMin: number;
  /** v0.18.29 A2 (fix job 0) (owner G12 Q-D "Max 250 euro and equivalent"): the largest single Add money to wallet (CountryRules.walletCreditMax), local money. */
  walletCreditMax: number;
  /** v0.18.38 §62 (fix job 8, owner G15 "In-app calls only"): CountryRules.calls — on, mode, window after the trip, ring time, longest call. */
  calls: CallSettings;
  /** v0.18.56 §78 (G9 part 2, owner Q79–Q85): CountryRules.chat — keep days, length, spam limit, sound, sheet, read aloud, translate, quick replies, auto "I've arrived". */
  chat: ChatSettings;
  /** v0.18.43 §64 (fix job 10): CountryRules.dontMatchAgain — the 1-star "don't match again" tick in both apps. */
  dontMatchAgain: DontMatchSettings;
  /** v0.18.57 §79: CountryRules.emergencyNumbers (country standard only) — the call buttons of both apps and the case page. */
  emergencyNumbers: EmergencyNumber[];
};
export type PersonLimits = { savedPlacesPerPerson: number; emergencyContactsPerPerson: number };
export const PERSON_LIMITS_DEFAULT: PersonLimits = { savedPlacesPerPerson: 50, emergencyContactsPerPerson: 10 };
export const PERSON_LIMITS_RANGE: Record<keyof PersonLimits, [number, number]> = { savedPlacesPerPerson: [1, 500], emergencyContactsPerPerson: [1, 50] };
export function personLimitsOf(raw: unknown): PersonLimits {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (key: keyof PersonLimits) => {
    const v = value[key];
    const [lo, hi] = PERSON_LIMITS_RANGE[key];
    return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : PERSON_LIMITS_DEFAULT[key];
  };
  return { savedPlacesPerPerson: pick("savedPlacesPerPerson"), emergencyContactsPerPerson: pick("emergencyContactsPerPerson") };
}
/** contract.json#walletCredit.defaultMax (major units). */
export const WALLET_CREDIT_MAX: Record<MarketId, number> = { SE: 2900, FR: 250, TN: 800 };
/** contract.json#configDefaults.driverPayChangeMax (major units); v0.18.82 TN 100 DT (owner Q-S5-6, 2026-11-13: it limits the change; was 300). */
export const DRIVER_PAY_CHANGE_MAX: Record<MarketId, number> = { SE: 1000, FR: 100, TN: 100 };
export type TipRules = { cashAfterTrip: boolean; customAmount: boolean; customMax: number; cashInCarMinutes: number };
/**
 * Job C8 (contract v0.18.91 finish.tips.cashInCarAdmin; owner "Anything admin can adjust becomes an admin setting"): the
 * cash-tip time in the car, RiderAppConfig.tipRules.cashInCarMinutes — configDefaults.tipRules (5) and settings_ranges (0–60).
 */
export const TIP_CASH_IN_CAR_MINUTES = { default: 5, min: 0, max: 60 } as const;
const cashInCarOf = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isInteger(value) && value >= TIP_CASH_IN_CAR_MINUTES.min && value <= TIP_CASH_IN_CAR_MINUTES.max ? value : fallback);
export const TIP_FLAGS = ["cashAfterTrip", "customAmount"] as const;
export type MixedTipRules = Partial<Record<(typeof TIP_FLAGS)[number], string[]>>;
/** contract.json#configDefaults.tipRules.customMax (major units); v0.18.82 TN 30 DT (owner Q-S5-6; was 60). */
export const TIP_CUSTOM_MAX: Record<MarketId, number> = { SE: 200, FR: 20, TN: 30 };

/**
 * `zones` (contract v0.8.1, owner 2026-10-28, live panel): Tips & limits of a zone or a country's Standard, by its
 * id, as the server has them; a zone without its own shows its Standard's.
 */
export type CountrySettingsBook = { draftRev: number; countries: Record<MarketId, CountrySettings>; zones?: Record<string, CountrySettings> };

/** The fields each section owns: Pricing saves the money settings, Settings the payment methods and languages. */
/** v0.8.1: the live panel's Tips & limits per zone and Standard (read when the tab opens). */
export const ZONE_RULES_KEY = "countrySettingsZones";

/** v0.18.33 (owner answer 2026-11-05, contract.json#configDefaults.onTripOffers): 70 % of the route to the drop-off. */
export const ON_TRIP_MIN_DONE_PCT_DEFAULT = 70;
/** v0.18.33 (owner Q5): CountryRules.onTripOffers.lateFreeCancelMin default. */
export const CHAIN_LATE_FREE_CANCEL_MIN_DEFAULT = 10;

export const PRICING_FIELDS = ["tips", "raiseSteps", "promoCap", "driverBonusLimit", "tipRules", "mixedTipRules", "driverPayChangeMax", "personLimits", "onTripMinDonePct", "chainLateFreeCancelMin", "walletCreditMax", "calls", "chat", "dontMatchAgain", "emergencyNumbers"] as const satisfies readonly (keyof CountrySettings)[];
export const SETTINGS_FIELDS = ["paymentMethods", "walletFirst", "languages", "mixedMethods"] as const satisfies readonly (keyof CountrySettings)[];

export const PAYMENT_METHOD_LABEL: Record<ZonePaymentMethod, string> = { cash: "Pay in car", card: "Card", apple_pay: "Apple Pay" };
export const LANGUAGE_LABEL: Record<AppLanguage, string> = { en: "English", fr: "French", sv: "Swedish" };
export const APP_LABEL: Record<LanguageApp, string> = { rider: "Rider app", driver: "Driver app", admin: "Admin panel" };

/** At most this many amounts in a list, so the rider's buttons fit on one row. */
export const MAX_AMOUNTS = 8;
/** Sanity maximum of the promo cap, in kronor and converted like the default prices (about 190 € or 600 DT). */
const PROMO_CAP_MAX_SEK = 2_000;

const toMajor = (amountMinor: number, country: MarketId) => amountMinor / market(country).minorUnits;

/** The country's driver bonus hard max (Q17: 1000 kr, 95 €, 300 DT). Fixed: no admin setting can go above it. */
export function driverBonusHardMax(country: MarketId): number {
  return toMajor(CONFIG_DEFAULTS.countries[country].driverBonus.hardMax.amountMinor, country);
}

export function raiseStepMax(country: MarketId): number {
  return fromSek(RAISE_CAP_SEK, country);
}

export function promoCapMax(country: MarketId): number {
  return fromSek(PROMO_CAP_MAX_SEK, country);
}

/** The smallest money step of the country (0.01, or 0.001 for DT). */
export function moneyStep(country: MarketId): number {
  return 1 / market(country).minorUnits;
}

export function defaultCountrySettings(country: MarketId): CountrySettings {
  const defaults = CONFIG_DEFAULTS.countries[country];
  const options = (prefix: string, list: readonly { amountMinor: number }[]) => list.map((item, index) => ({ id: `${prefix}-${index + 1}`, amount: toMajor(item.amountMinor, country), enabled: true }));
  return {
    tips: options("tip", defaults.tips),
    raiseSteps: options("raise", defaults.raiseSteps),
    promoCap: null,
    driverBonusLimit: toMajor(defaults.driverBonus.defaultLimit.amountMinor, country),
    paymentMethods: Object.fromEntries(ZONE_PAYMENT_METHODS.map((method) => [method, true])) as Record<ZonePaymentMethod, boolean>,
    walletFirst: true,
    languages: { rider: defaults.defaultLanguage, driver: defaults.defaultLanguage, admin: defaults.defaultLanguage },
    tipRules: { cashAfterTrip: false, customAmount: false, customMax: TIP_CUSTOM_MAX[country], cashInCarMinutes: TIP_CASH_IN_CAR_MINUTES.default },
    driverPayChangeMax: DRIVER_PAY_CHANGE_MAX[country],
    personLimits: { ...PERSON_LIMITS_DEFAULT },
    onTripMinDonePct: ON_TRIP_MIN_DONE_PCT_DEFAULT,
    chainLateFreeCancelMin: CHAIN_LATE_FREE_CANCEL_MIN_DEFAULT,
    walletCreditMax: WALLET_CREDIT_MAX[country],
    calls: { ...CALL_DEFAULTS },
    chat: defaultChatSettings(),
    dontMatchAgain: { ...DONT_MATCH_DEFAULTS },
    emergencyNumbers: emergencyDefaults(country),
  };
}

export function emptyCountrySettingsBook(): CountrySettingsBook {
  return { draftRev: 1, countries: Object.fromEntries(MARKETS.map((item) => [item.id, defaultCountrySettings(item.id)])) as Record<MarketId, CountrySettings> };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** v0.18.56 §78: a saved chat block keeps its numbers as stored, for the checks to see. */
function keptNumbers(raw: object): Partial<ChatSettings> {
  const v = raw as Record<string, unknown>;
  return Object.fromEntries((["keepDays", "maxLength", "spamPerMin"] as const).filter((key) => finite(v[key])).map((key) => [key, v[key]]));
}

function completeOptions(stored: unknown, fallback: AmountOption[]): AmountOption[] {
  if (!Array.isArray(stored)) return fallback.map((item) => ({ ...item }));
  return stored.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Partial<AmountOption>;
    if (!finite(raw.amount)) return [];
    return [{ id: typeof raw.id === "string" && raw.id ? raw.id : `amount-${index + 1}`, amount: raw.amount, enabled: raw.enabled !== false }];
  });
}

/** One country from a save: anything missing or of the wrong kind comes from the defaults. Values are kept as stored, for the checks to see. */
export function completeCountrySettings(country: MarketId, stored: unknown): CountrySettings {
  const base = defaultCountrySettings(country);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return base;
  const raw = stored as Partial<Record<keyof CountrySettings, unknown>>;
  const methods = (raw.paymentMethods && typeof raw.paymentMethods === "object" ? raw.paymentMethods : {}) as Record<string, unknown>;
  const languages = (raw.languages && typeof raw.languages === "object" ? raw.languages : {}) as Record<string, unknown>;
  return {
    tips: completeOptions(raw.tips, base.tips),
    raiseSteps: completeOptions(raw.raiseSteps, base.raiseSteps),
    promoCap: raw.promoCap === null ? null : finite(raw.promoCap) ? raw.promoCap : base.promoCap,
    driverBonusLimit: finite(raw.driverBonusLimit) ? raw.driverBonusLimit : base.driverBonusLimit,
    paymentMethods: Object.fromEntries(ZONE_PAYMENT_METHODS.map((method) => [method, typeof methods[method] === "boolean" ? methods[method] : base.paymentMethods[method]])) as Record<ZonePaymentMethod, boolean>,
    walletFirst: typeof raw.walletFirst === "boolean" ? raw.walletFirst : base.walletFirst,
    languages: Object.fromEntries(APP_IDS.map((app) => [app, (APP_LANGUAGES as readonly unknown[]).includes(languages[app]) ? languages[app] : base.languages[app]])) as Record<LanguageApp, AppLanguage>,
    tipRules: completeTipRules(raw.tipRules, base.tipRules),
    driverPayChangeMax: finite(raw.driverPayChangeMax) && raw.driverPayChangeMax > 0 ? raw.driverPayChangeMax : base.driverPayChangeMax,
    personLimits: raw.personLimits ? { ...base.personLimits, ...(raw.personLimits as PersonLimits) } : base.personLimits,
    onTripMinDonePct: finite(raw.onTripMinDonePct) ? raw.onTripMinDonePct : base.onTripMinDonePct,
    chainLateFreeCancelMin: finite(raw.chainLateFreeCancelMin) ? raw.chainLateFreeCancelMin : base.chainLateFreeCancelMin,
    walletCreditMax: finite(raw.walletCreditMax) && raw.walletCreditMax > 0 ? raw.walletCreditMax : base.walletCreditMax,
    calls: callSettingsOf(raw.calls),
    chat: raw.chat && typeof raw.chat === "object" ? { ...chatSettingsOf(raw.chat), ...keptNumbers(raw.chat) } : defaultChatSettings(),
    dontMatchAgain: dontMatchOf(raw.dontMatchAgain),
    emergencyNumbers: emergencyNumbersOf(raw.emergencyNumbers, country),
    ...mixedOf(raw.mixedMethods),
    ...mixedTipOf(raw.mixedTipRules),
  };
}

function mixedTipOf(stored: unknown): Pick<CountrySettings, "mixedTipRules"> {
  if (!stored || typeof stored !== "object") return {};
  const raw = stored as Record<string, unknown>;
  const entries = TIP_FLAGS.flatMap((flag) => {
    const list = raw[flag];
    return Array.isArray(list) && list.length ? [[flag, list.filter((zone): zone is string => typeof zone === "string")] as const] : [];
  });
  return entries.length ? { mixedTipRules: Object.fromEntries(entries) } : {};
}

/** Live G8 round 3 item 2: the default app languages differ between two settings of a country. */
export function languagesChanged(before: CountrySettings, after: CountrySettings): boolean {
  return APP_IDS.some((app) => before.languages[app] !== after.languages[app]);
}

/** Live G8 round 3 item 1: the tip switches the given zones disagree on, with the zones where each is off. */
export function mixedTipAcross(zones: ReadonlyArray<readonly [string, TipRules]>): MixedTipRules | undefined {
  const mixed: MixedTipRules = {};
  for (const flag of TIP_FLAGS) {
    if (zones.every(([, rules]) => rules[flag] === zones[0][1][flag])) continue;
    mixed[flag] = zones.filter(([, rules]) => !rules[flag]).map(([zone]) => zone);
  }
  return Object.keys(mixed).length ? mixed : undefined;
}

function mixedOf(stored: unknown): Pick<CountrySettings, "mixedMethods"> {
  if (!stored || typeof stored !== "object") return {};
  const raw = stored as Record<string, unknown>;
  const entries = ZONE_PAYMENT_METHODS.flatMap((method) => {
    const list = raw[method];
    return Array.isArray(list) && list.length ? [[method, list.filter((zone): zone is string => typeof zone === "string")] as const] : [];
  });
  return entries.length ? { mixedMethods: Object.fromEntries(entries) } : {};
}

/** Live G8 fix 1: the methods whose value or mixed state differs between two settings of a country. */
/** v0.18.33: "Use wallet first" changed for the country. */
export function walletFirstChanged(before: CountrySettings, after: CountrySettings): boolean {
  return before.walletFirst !== after.walletFirst;
}

export function methodsChanged(before: CountrySettings, after: CountrySettings): boolean {
  return ZONE_PAYMENT_METHODS.some((method) => before.paymentMethods[method] !== after.paymentMethods[method] || Boolean(before.mixedMethods?.[method]?.length) !== Boolean(after.mixedMethods?.[method]?.length));
}

function completeTipRules(stored: unknown, base: TipRules): TipRules {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Partial<TipRules>;
  return {
    cashAfterTrip: typeof raw.cashAfterTrip === "boolean" ? raw.cashAfterTrip : base.cashAfterTrip,
    customAmount: typeof raw.customAmount === "boolean" ? raw.customAmount : base.customAmount,
    customMax: finite(raw.customMax) ? raw.customMax : base.customMax,
    cashInCarMinutes: cashInCarOf(raw.cashInCarMinutes, base.cashInCarMinutes),
  };
}

export function normalizeCountrySettingsBook(value: unknown): CountrySettingsBook {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<CountrySettingsBook>;
  const countries = (raw.countries && typeof raw.countries === "object" ? raw.countries : {}) as Record<string, unknown>;
  return {
    draftRev: finite(raw.draftRev) && raw.draftRev > 0 ? raw.draftRev : 1,
    countries: Object.fromEntries(MARKETS.map((item) => [item.id, completeCountrySettings(item.id, countries[item.id])])) as Record<MarketId, CountrySettings>,
  };
}

export function countrySettingsOf(book: CountrySettingsBook, country: MarketId): CountrySettings {
  return book.countries[country] ?? defaultCountrySettings(country);
}

/** v0.8.1: the Tips & limits of one zone (or Standard) in the live panel, else the country's. */
export function zoneSettingsOf(book: CountrySettingsBook, country: MarketId, zoneId: string): CountrySettings {
  return book.zones?.[zoneId] ?? countrySettingsOf(book, country);
}

/** A new amount for a list: one step above the highest, with an id the list does not use yet. */
export function addAmount(list: readonly AmountOption[], prefix: string, country: MarketId): AmountOption[] {
  const used = new Set(list.map((item) => item.id));
  let index = list.length + 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  const highest = list.reduce((max, item) => Math.max(max, item.amount), 0);
  const step = list.length > 1 ? Math.max(moneyStep(country), Math.abs(list[list.length - 1].amount - list[list.length - 2].amount)) : highest || 1;
  return [...list, { id: `${prefix}-${index}`, amount: roundTo(highest + step, moneyStep(country)), enabled: true }];
}

const symbolOf = (country: MarketId) => ({ SE: "kr", FR: "€", TN: "DT" })[country];
const short = (value: number) => (Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3))));
const hasMoreDecimals = (value: number, country: MarketId) => Math.abs(Math.round(value * market(country).minorUnits) - value * market(country).minorUnits) > 1e-6;

function listIssues(label: string, list: readonly AmountOption[], max: number, country: MarketId): string[] {
  const issues: string[] = [];
  const name = market(country).name;
  if (list.length > MAX_AMOUNTS) issues.push(`${name} ${label}: at most ${MAX_AMOUNTS} amounts.`);
  if (list.some((item) => !finite(item.amount) || item.amount <= 0)) issues.push(`${name} ${label}: every amount must be above 0.`);
  else if (list.some((item) => item.amount > max)) issues.push(`${name} ${label}: an amount can be at most ${short(max)} ${symbolOf(country)}.`);
  else if (list.some((item) => hasMoreDecimals(item.amount, country))) issues.push(`${name} ${label}: amounts have at most ${market(country).minorUnits === 1000 ? 3 : 2} decimals.`);
  const active = list.filter((item) => item.enabled).map((item) => item.amount);
  if (new Set(active).size !== active.length) issues.push(`${name} ${label}: two active amounts are the same.`);
  if (new Set(list.map((item) => item.id)).size !== list.length) issues.push(`${name} ${label}: two amounts have the same id.`);
  return issues;
}

/** Everything that stops a save of one country. Empty means it can be saved. */
export function countrySettingsIssues(country: MarketId, settings: CountrySettings): string[] {
  const name = market(country).name;
  const symbol = symbolOf(country);
  const issues = [
    ...listIssues("tips", settings.tips, tipMax(country), country),
    ...listIssues("raise-offer steps", settings.raiseSteps, raiseStepMax(country), country),
  ];
  if (settings.promoCap !== null) {
    if (!finite(settings.promoCap) || settings.promoCap <= 0) issues.push(`${name} promo cap: must be above 0, or switched off.`);
    else if (settings.promoCap > promoCapMax(country)) issues.push(`${name} promo cap: at most ${short(promoCapMax(country))} ${symbol}.`);
    else if (hasMoreDecimals(settings.promoCap, country)) issues.push(`${name} promo cap: too many decimals.`);
  }
  const hardMax = driverBonusHardMax(country);
  if (!finite(settings.driverBonusLimit) || settings.driverBonusLimit <= 0) issues.push(`${name} driver bonus limit: must be above 0.`);
  else if (settings.driverBonusLimit > hardMax) issues.push(`${name} driver bonus limit: at most ${short(hardMax)} ${symbol}, the hard max.`);
  else if (hasMoreDecimals(settings.driverBonusLimit, country)) issues.push(`${name} driver bonus limit: too many decimals.`);
  if (!ZONE_PAYMENT_METHODS.some((method) => settings.paymentMethods[method] || settings.mixedMethods?.[method]?.length)) issues.push(`${name}: at least one payment method must be on.`);
  for (const app of APP_IDS) if (!(APP_LANGUAGES as readonly string[]).includes(settings.languages[app])) issues.push(`${name}: choose a language for the ${APP_LABEL[app].toLowerCase()}.`);
  if (!(settings.tipRules.customMax > 0) || settings.tipRules.customMax > TIP_CUSTOM_MAX[country] * 10) issues.push(`${name}: the highest typed tip must be more than 0 and at most ${TIP_CUSTOM_MAX[country] * 10}.`);
  // v0.18.33: CountryRules.onTripOffers.minRouteDonePct, a whole percent 0–100.
  if (!Number.isInteger(settings.onTripMinDonePct) || settings.onTripMinDonePct < 0 || settings.onTripMinDonePct > 100) issues.push(tr("{0}: offers on a trip must start at a whole percent from 0 to 100.", [name]));
  if (!Number.isInteger(settings.chainLateFreeCancelMin) || settings.chainLateFreeCancelMin < 0 || settings.chainLateFreeCancelMin > 120) issues.push(tr("{0}: free cancel of a next trip must start at 0 to 120 minutes.", [name]));
  // v0.18.38 §62: CountryRules.calls ranges.
  issues.push(...callSettingsIssues(name, settings.calls));
  issues.push(...chatSettingsIssues(name, settings.chat));
  issues.push(...dontMatchIssues(name, settings.dontMatchAgain));
  issues.push(...emergencyNumbersIssues(name, settings.emergencyNumbers));
  // v0.18.26: limits per person, whole numbers in their range.
  for (const key of ["savedPlacesPerPerson", "emergencyContactsPerPerson"] as const) {
    const value = settings.personLimits[key];
    const [lo, hi] = PERSON_LIMITS_RANGE[key];
    if (!Number.isInteger(value) || value < lo || value > hi) issues.push(tr("{0}: {1} per person must be a whole number from {2} to {3}.", [name, tr(key === "savedPlacesPerPerson" ? "Saved places" : "Emergency contacts"), lo, hi]));
  }
  return issues;
}

const amounts = (list: readonly AmountOption[], symbol: string) => list.map((item) => `${short(item.amount)}${item.enabled ? "" : " (off)"}`).join(", ") + ` ${symbol}`;

/** Plain-language lines of what changed in one country, for the save dialog and My activity. */
export function countrySettingsLines(country: MarketId, before: CountrySettings, after: CountrySettings): string[] {
  const symbol = symbolOf(country);
  const lines: string[] = [];
  if (JSON.stringify(before.tips) !== JSON.stringify(after.tips)) lines.push(`Tips: ${amounts(before.tips, symbol)} → ${amounts(after.tips, symbol)}`);
  if (JSON.stringify(before.raiseSteps) !== JSON.stringify(after.raiseSteps)) lines.push(`Raise-offer steps: +${amounts(before.raiseSteps, symbol)} → +${amounts(after.raiseSteps, symbol)}`);
  if (before.promoCap !== after.promoCap) lines.push(`Promo cap: ${before.promoCap === null ? "none" : `${short(before.promoCap)} ${symbol}`} → ${after.promoCap === null ? "none" : `${short(after.promoCap)} ${symbol}`}`);
  if (before.driverBonusLimit !== after.driverBonusLimit) lines.push(`Driver bonus limit: ${short(before.driverBonusLimit)} → ${short(after.driverBonusLimit)} ${symbol}`);
  // Live G8 round 3 item 3: in the admin's language (it was English in the SV and FR panels).
  if (JSON.stringify(before.tipRules) !== JSON.stringify(after.tipRules) || JSON.stringify(before.mixedTipRules ?? {}) !== JSON.stringify(after.mixedTipRules ?? {})) lines.push(tr("Tip rules: cash after the trip {0}, typed amount {1} (max {2})", [tr(after.tipRules.cashAfterTrip ? "on" : "off"), tr(after.tipRules.customAmount ? "on" : "off"), short(after.tipRules.customMax)]));
  if (before.tipRules.cashInCarMinutes !== after.tipRules.cashInCarMinutes) lines.push(tr("Cash tip time in the car: {0} min", [String(after.tipRules.cashInCarMinutes)]));
  for (const method of ZONE_PAYMENT_METHODS) if (before.mixedMethods?.[method]?.length && !after.mixedMethods?.[method]?.length) lines.push(`${PAYMENT_METHOD_LABEL[method]}: mixed → ${after.paymentMethods[method] ? "on" : "off"}`);
    else if (before.paymentMethods[method] !== after.paymentMethods[method]) lines.push(`${PAYMENT_METHOD_LABEL[method]}: ${before.paymentMethods[method] ? "on" : "off"} → ${after.paymentMethods[method] ? "on" : "off"}`);
  for (const app of APP_IDS) if (before.languages[app] !== after.languages[app]) lines.push(`${APP_LABEL[app]} default language: ${before.languages[app]} → ${after.languages[app]}`);
  if (before.chainLateFreeCancelMin !== after.chainLateFreeCancelMin) lines.push(tr("Next trip free cancel after: {0} min → {1} min", [before.chainLateFreeCancelMin, after.chainLateFreeCancelMin]));
  if (before.onTripMinDonePct !== after.onTripMinDonePct) lines.push(tr("Offers on a trip from: {0} % → {1} %", [before.onTripMinDonePct, after.onTripMinDonePct]));
  lines.push(...callSettingsLines(before.calls, after.calls));
  lines.push(...chatSettingsLines(before.chat, after.chat));
  lines.push(...dontMatchLines(before.dontMatchAgain, after.dontMatchAgain));
  lines.push(...emergencyNumbersLines(before.emergencyNumbers, after.emergencyNumbers));
  if (before.personLimits.savedPlacesPerPerson !== after.personLimits.savedPlacesPerPerson) lines.push(tr("Saved places per person: {0} → {1}", [before.personLimits.savedPlacesPerPerson, after.personLimits.savedPlacesPerPerson]));
  if (before.personLimits.emergencyContactsPerPerson !== after.personLimits.emergencyContactsPerPerson) lines.push(tr("Emergency contacts per person: {0} → {1}", [before.personLimits.emergencyContactsPerPerson, after.personLimits.emergencyContactsPerPerson]));
  return lines;
}

/**
 * Q29: the money settings here (tips, raise steps, promo cap, driver bonus limit) that move more than 50 % from the
 * saved value. An amount is compared with the saved amount of the same id; a new amount has nothing to compare with.
 */
export function largeCountryChanges(country: MarketId, before: CountrySettings, after: CountrySettings): string[] {
  const symbol = symbolOf(country);
  const name = market(country).name;
  const lines: string[] = [];
  const pct = (from: number, to: number) => `${to > from ? "+" : "−"}${Math.round((Math.abs(to - from) / from) * 100)}%`;
  const line = (label: string, from: number, to: number) => `${name} · ${label}: ${short(from)} → ${short(to)} ${symbol} (${pct(from, to)})`;
  for (const [label, key] of [["Tip", "tips"], ["Raise-offer step", "raiseSteps"]] as const) {
    for (const item of after[key]) {
      const old = before[key].find((entry) => entry.id === item.id);
      if (old && isLargePriceChange(old.amount, item.amount)) lines.push(line(label, old.amount, item.amount));
    }
  }
  if (before.promoCap !== null && after.promoCap !== null && isLargePriceChange(before.promoCap, after.promoCap)) lines.push(line("Promo cap", before.promoCap, after.promoCap));
  if (isLargePriceChange(before.driverBonusLimit, after.driverBonusLimit)) lines.push(line("Driver bonus limit", before.driverBonusLimit, after.driverBonusLimit));
  return lines;
}

export type SettingsSection = "pricing" | "settings";

const FIELDS: Record<SettingsSection, readonly (keyof CountrySettings)[]> = { pricing: PRICING_FIELDS, settings: SETTINGS_FIELDS };

/**
 * A save from one section: only that section's fields are taken from `sent`, the rest stays as saved, so Pricing and
 * Settings never overwrite each other. Every country is checked. Used by the screens and by the fixture server.
 */
export function saveCountrySettings(current: CountrySettingsBook, sent: unknown, section: SettingsSection): { book: CountrySettingsBook; error?: string; lines: string[] } {
  const incoming = normalizeCountrySettingsBook(sent);
  const countries = { ...current.countries };
  const lines: string[] = [];
  for (const item of MARKETS) {
    const before = countrySettingsOf(current, item.id);
    const next = { ...before } as Record<keyof CountrySettings, unknown>;
    for (const field of FIELDS[section]) next[field] = structuredClone(incoming.countries[item.id][field]);
    const settings = next as CountrySettings;
    const issues = countrySettingsIssues(item.id, settings);
    if (issues.length) return { book: current, error: issues[0], lines: [] };
    countries[item.id] = settings;
    lines.push(...countrySettingsLines(item.id, before, settings).map((text) => `${item.name}: ${text}`));
  }
  if (!lines.length) return { book: current, error: "Nothing changed.", lines };
  return { book: { draftRev: current.draftRev + 1, countries }, lines };
}

/** One line of the Pricing settings of a country, for My activity's before and after. */
export function pricingSummary(country: MarketId, settings: CountrySettings): string {
  const symbol = symbolOf(country);
  return [
    `${country} tips ${amounts(settings.tips, symbol)}`,
    `raise +${amounts(settings.raiseSteps, symbol)}`,
    `promo cap ${settings.promoCap === null ? "none" : `${short(settings.promoCap)} ${symbol}`}`,
    `driver bonus limit ${short(settings.driverBonusLimit)} ${symbol}`,
  ].join(" · ");
}

/** One line of the Settings part (payment methods, languages) of every country. */
export function settingsSummary(book: CountrySettingsBook): string {
  return MARKETS.map((item) => {
    const settings = countrySettingsOf(book, item.id);
    const methods = ZONE_PAYMENT_METHODS.filter((method) => settings.paymentMethods[method]).join(", ") || "none";
    return `${item.id} ${methods}; ${APP_IDS.map((app) => `${app} ${settings.languages[app]}`).join(", ")}`;
  }).join(" · ");
}

/** The fields of one section, to tell whether a draft differs from what is saved. */
export function sectionPart(settings: CountrySettings, section: SettingsSection): Partial<CountrySettings> {
  return Object.fromEntries(FIELDS[section].map((field) => [field, settings[field]]));
}
