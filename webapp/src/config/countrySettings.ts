import { MARKETS, market, type MarketId } from "../markets/markets.ts";
import { tr } from "../i18n/core.ts";
import { CALL_DEFAULTS, callSettingsIssues, callSettingsLines, callSettingsOf, type CallSettings } from "./callSettings.ts";
import { emergencyDefaults, emergencyNumbersIssues, emergencyNumbersLines, emergencyNumbersOf, type EmergencyNumber } from "./emergencyNumbers.ts";
import { SOS_CONTACTS_SMS_DEFAULT, sosContactsSmsLines, sosContactsSmsOf } from "./sosContactsSms.ts";
import { SMS_SIGN_IN_DEFAULT, smsSignInIssues, smsSignInLines, smsSignInOf, type SmsSignIn } from "./smsSignIn.ts";
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
  /**
   * v0.18.91 job C8 (supervisor must-fix 1): the zones chosen at the top have different cash-tip times in the car (zone
   * name → minutes). While set, Save keeps each zone's own time; editing the field removes it (the value goes to all).
   * Shown only, never saved.
   */
  mixedCashInCar?: Record<string, number>;
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
  /**
   * v0.18.110 BQ-V44 (owner G10-5, Rules decisions/driver-g10.md:9; contract configDefaults.bonusCampaignMax D13): the
   * largest amount of one driver bonus campaign (CountryRules.bonusCampaignMax, per country standard or zone), local money.
   */
  bonusCampaignMax: number;
  /** v0.18.38 §62 (fix job 8, owner G15 "In-app calls only"): CountryRules.calls — on, mode, window after the trip, ring time, longest call. */
  calls: CallSettings;
  /** v0.18.56 §78 (G9 part 2, owner Q79–Q85): CountryRules.chat — keep days, length, spam limit, sound, sheet, read aloud, translate, quick replies, auto "I've arrived". */
  chat: ChatSettings;
  /** v0.18.43 §64 (fix job 10): CountryRules.dontMatchAgain — the 1-star "don't match again" tick in both apps. */
  dontMatchAgain: DontMatchSettings;
  /** v0.18.57 §79: CountryRules.emergencyNumbers (country standard only) — the call buttons of both apps and the case page. */
  emergencyNumbers: EmergencyNumber[];
  /** v0.18.101 §92 (BQ-V34, owner G14 Q2): CountryRules.sosContactsSms (country standard only) — the driver's SOS texts his emergency contacts. */
  sosContactsSms: boolean;
  /** v0.18.133 (contract.json#smsSignIn): CountryRules.smsSignIn (country standard only) — real sign-in codes by SMS, and the daily SMS limit. */
  smsSignIn: SmsSignIn;
  /**
   * S5 J9 (v0.18.84 debtModel.maxRiderDebt; owner Q-M1, Q-S5-3/4/5, 2026-11-13 15:00 "Any amount"): CountryRules.maxRiderDebt,
   * country standard only, local money, any amount above 0 (no upper bound; the server's DB floor follows it). At or
   * above it a rider cannot book a pay-in-car trip (409 rider_debt_above_max).
   */
  maxRiderDebt: number;
  /**
   * S5 J9 (v0.18.84 debtModel.driverOwes.limit; owner 2026-11-13 14:22 / 14:32 / 14:54): CountryRules.driverOwesLimit,
   * country standard only: a switch and an amount (local money, null = none). Shipped OFF; TN 150 DT stored. At or over
   * it the driver gets no cash trips; he is never refused online. ON needs an amount above 0 (400 owes_limit_needs_amount).
   */
  driverOwesLimit: DriverOwesLimit;
  /**
   * v0.18.136 stripeFees.setting (DRAFT; owner 2026-11-20 "So we use stripe"): CountryRules.riderFeeStripe.enabled, country
   * standard only, default OFF: the rider can pay an owed cancel or no-show fee by card or Apple Pay in the app.
   */
  riderFeeStripe: boolean;
  /**
   * v0.18.139 driverPayRequest.setting (owner 2026-11-20 "ask driver monthly to pay how much due to Movera ... link to
   * pay", "Link sumup for exp"; TEMPORARY): CountryRules.driverPayRequest, country standard only: a switch, the day of
   * the month (1-28), the payment link (https) and the minimum amount (local money, null = none). Shipped OFF. ON needs
   * the link (400 pay_request_needs_link) and an amount of 0 or above (400 pay_request_needs_amount).
   */
  driverPayRequest: DriverPayRequest;
};
export type DriverOwesLimit = { enabled: boolean; max: number | null };
export type DriverPayRequest = { enabled: boolean; dayOfMonth: number; payLink: string; minAmount: number | null };
/** contract.json#configDefaults.driverPayRequest: off, day 1, no link, no amount, in every country. */
export const DRIVER_PAY_REQUEST_DEFAULT: DriverPayRequest = { enabled: false, dayOfMonth: 1, payLink: "", minAmount: null };
export const PAY_LINK_MAX = 500;
/** An https link with no white space, at most 500 characters (the server's rule, src/drivers/payRequestSetting.ts). */
export const isPayLink = (value: unknown): value is string => typeof value === "string" && value.length <= PAY_LINK_MAX && /^https:\/\/[^\s]+$/.test(value) && URL.canParse(value);
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
/** contract.json#configDefaults.maxRiderDebt (major units): SE 300 kr, FR 30 €, TN 84 DT (owner Q-S5-5). */
export const MAX_RIDER_DEBT: Record<MarketId, number> = { SE: 300, FR: 30, TN: 84 };
/** contract.json#configDefaults.driverOwesLimit (major units): OFF everywhere; TN 150 DT stored (owner 2026-11-13 14:22, 14:32). */
export const DRIVER_OWES_LIMIT: Record<MarketId, DriverOwesLimit> = { SE: { enabled: false, max: null }, FR: { enabled: false, max: null }, TN: { enabled: false, max: 150 } };
/** contract.json#configDefaults.driverPayChangeMax (major units); v0.18.82 TN 100 DT (owner Q-S5-6, 2026-11-13: it limits the change; was 300). */
export const DRIVER_PAY_CHANGE_MAX: Record<MarketId, number> = { SE: 1000, FR: 100, TN: 100 };
/** contract.json#configDefaults.bonusCampaignMax (0.18.110, D13; major units): SE 2 000 kr, FR 200 €, TN 200 DT. */
export const BONUS_CAMPAIGN_MAX_MAJOR: Record<MarketId, number> = { SE: 2000, FR: 200, TN: 200 };
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

export const PRICING_FIELDS = ["tips", "raiseSteps", "promoCap", "driverBonusLimit", "tipRules", "mixedTipRules", "mixedCashInCar", "driverPayChangeMax", "personLimits", "onTripMinDonePct", "chainLateFreeCancelMin", "walletCreditMax", "bonusCampaignMax", "calls", "chat", "dontMatchAgain", "emergencyNumbers", "sosContactsSms", "smsSignIn", "maxRiderDebt", "driverOwesLimit", "riderFeeStripe", "driverPayRequest"] as const satisfies readonly (keyof CountrySettings)[];
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
    bonusCampaignMax: BONUS_CAMPAIGN_MAX_MAJOR[country],
    calls: { ...CALL_DEFAULTS },
    chat: defaultChatSettings(),
    dontMatchAgain: { ...DONT_MATCH_DEFAULTS },
    emergencyNumbers: emergencyDefaults(country),
    sosContactsSms: SOS_CONTACTS_SMS_DEFAULT,
    smsSignIn: { ...SMS_SIGN_IN_DEFAULT },
    maxRiderDebt: MAX_RIDER_DEBT[country],
    driverOwesLimit: { ...DRIVER_OWES_LIMIT[country] },
    riderFeeStripe: false,
    driverPayRequest: { ...DRIVER_PAY_REQUEST_DEFAULT },
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
    bonusCampaignMax: finite(raw.bonusCampaignMax) && raw.bonusCampaignMax > 0 ? raw.bonusCampaignMax : base.bonusCampaignMax,
    calls: callSettingsOf(raw.calls),
    chat: raw.chat && typeof raw.chat === "object" ? { ...chatSettingsOf(raw.chat), ...keptNumbers(raw.chat) } : defaultChatSettings(),
    dontMatchAgain: dontMatchOf(raw.dontMatchAgain),
    emergencyNumbers: emergencyNumbersOf(raw.emergencyNumbers, country),
    sosContactsSms: sosContactsSmsOf(raw.sosContactsSms),
    smsSignIn: smsSignInOf(raw.smsSignIn),
    // S5 J9: no upper bound (owner "Any amount"); a stored value is kept as it is, for the checks to see.
    maxRiderDebt: finite(raw.maxRiderDebt) ? raw.maxRiderDebt : base.maxRiderDebt,
    driverOwesLimit: owesLimitOf(raw.driverOwesLimit, base.driverOwesLimit),
    riderFeeStripe: raw.riderFeeStripe === true,
    driverPayRequest: payRequestOf(raw.driverPayRequest),
    ...mixedOf(raw.mixedMethods),
    ...mixedTipOf(raw.mixedTipRules),
  };
}

/** S5 J9: a stored owes-limit { enabled, max } (max a number or null); anything else is the default. */
function owesLimitOf(stored: unknown, fallback: DriverOwesLimit): DriverOwesLimit {
  if (!stored || typeof stored !== "object") return { ...fallback };
  const raw = stored as Record<string, unknown>;
  if (typeof raw["enabled"] !== "boolean") return { ...fallback };
  return { enabled: raw["enabled"], max: finite(raw["max"]) ? raw["max"] : null };
}

/** v0.18.139: a stored pay request { enabled, dayOfMonth, payLink, minAmount } in local money; anything else is the default (off). */
function payRequestOf(stored: unknown): DriverPayRequest {
  if (!stored || typeof stored !== "object") return { ...DRIVER_PAY_REQUEST_DEFAULT };
  const raw = stored as Record<string, unknown>;
  if (typeof raw["enabled"] !== "boolean") return { ...DRIVER_PAY_REQUEST_DEFAULT };
  // Kept as they are (also a wrong day or link), for the checks to see before Save.
  return { enabled: raw["enabled"], dayOfMonth: finite(raw["dayOfMonth"]) ? raw["dayOfMonth"] : 1, payLink: typeof raw["payLink"] === "string" ? raw["payLink"] : "", minAmount: finite(raw["minAmount"]) ? raw["minAmount"] : null };
}

/**
 * v0.18.139: driverPayRequest of a country_rules document (the standard's) in local money. Missing or not an object is
 * left out (the panel shows the default: off); a minimum in another currency reads as none.
 */
export function payRequestOfRules(document: unknown, country: MarketId): Partial<Pick<CountrySettings, "driverPayRequest">> {
  const set = (document && typeof document === "object" ? (document as { driverPayRequest?: unknown }).driverPayRequest : undefined) as { enabled?: unknown; dayOfMonth?: unknown; payLink?: unknown; minAmount?: unknown } | undefined;
  if (!set || typeof set !== "object" || typeof set.enabled !== "boolean") return {};
  const { currency, minorUnits } = market(country);
  const min = set.minAmount as { amountMinor?: unknown; currency?: unknown } | null | undefined;
  return {
    driverPayRequest: {
      enabled: set.enabled,
      dayOfMonth: typeof set.dayOfMonth === "number" ? set.dayOfMonth : 1,
      payLink: typeof set.payLink === "string" ? set.payLink : "",
      minAmount: min && typeof min.amountMinor === "number" && min.currency === currency ? min.amountMinor / minorUnits : null,
    },
  };
}

/**
 * S5 J9 (v0.18.84): maxRiderDebt and driverOwesLimit of a country_rules document (the standard's) in local money.
 * A missing field, or one in another currency, is left out (the panel shows the default, like the server).
 */
export function debtSettingsOfRules(document: unknown, country: MarketId): Partial<Pick<CountrySettings, "maxRiderDebt" | "driverOwesLimit" | "riderFeeStripe">> {
  const doc = (document && typeof document === "object" ? document : {}) as { maxRiderDebt?: unknown; driverOwesLimit?: unknown; riderFeeStripe?: { enabled?: unknown } };
  const { currency, minorUnits } = market(country);
  const money = (value: unknown): number | null | undefined => {
    if (value === null) return null;
    const amount = value as { amountMinor?: unknown; currency?: unknown } | undefined;
    return amount && typeof amount.amountMinor === "number" && amount.currency === currency ? amount.amountMinor / minorUnits : undefined;
  };
  const debt = money(doc.maxRiderDebt);
  const limit = doc.driverOwesLimit as { enabled?: unknown; max?: unknown } | undefined;
  const max = limit && typeof limit === "object" ? money(limit.max ?? null) : undefined;
  return {
    ...(typeof debt === "number" && debt > 0 ? { maxRiderDebt: debt } : {}),
    ...(limit && typeof limit === "object" && typeof limit.enabled === "boolean" && max !== undefined ? { driverOwesLimit: { enabled: limit.enabled, max } } : {}),
    // v0.18.136 stripeFees.setting: missing = off.
    ...(doc.riderFeeStripe && typeof doc.riderFeeStripe === "object" && typeof doc.riderFeeStripe.enabled === "boolean" ? { riderFeeStripe: doc.riderFeeStripe.enabled } : {}),
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

/** v0.18.91 job C8: the zones' cash-tip times in the car (name → minutes) when they differ; undefined when all are the same. */
export function mixedCashInCarAcross(zones: ReadonlyArray<readonly [string, TipRules]>): Record<string, number> | undefined {
  if (zones.length < 2 || zones.every(([, rules]) => rules.cashInCarMinutes === zones[0]![1].cashInCarMinutes)) return undefined;
  return Object.fromEntries(zones.map(([zone, rules]) => [zone, rules.cashInCarMinutes]));
}

/**
 * v0.18.91 job C8 (supervisor must-fix 1): what Save writes for each chosen zone — the shown settings, but while the
 * cash-tip time is still mixed (not edited) each zone keeps its own time. The mixed note itself is never saved.
 */
export function zoneValuesForSave(shown: CountrySettings, targets: readonly string[], own: (zoneId: string) => CountrySettings, shownId?: string): Record<string, CountrySettings> {
  const { mixedCashInCar, ...rest } = shown;
  return Object.fromEntries(targets.map((id) => {
    const values = mixedCashInCar ? { ...rest, tipRules: { ...rest.tipRules, cashInCarMinutes: own(id).tipRules.cashInCarMinutes } } : rest;
    // Security review of the SMS switch (2026-11-19): the country-wide values can only be edited while the Standard
    // is the shown scope. Saved for several scopes with a ZONE shown, the Standard got the zone's values (the
    // defaults: SMS sign-in off / 200, the default emergency numbers, SOS SMS on) without a word in the confirm.
    // Every scope that is not the shown one keeps its own.
    return [id, shownId !== undefined && id !== shownId ? { ...values, ...countryWideOf(own(id)) } : values];
  }));
}

/** The values that belong to the country Standard alone (the server refuses them on a zone's own rules). */
export const COUNTRY_WIDE_FIELDS = ["smsSignIn", "emergencyNumbers", "sosContactsSms"] as const satisfies readonly (keyof CountrySettings)[];
const countryWideOf = (settings: CountrySettings): Pick<CountrySettings, (typeof COUNTRY_WIDE_FIELDS)[number]> => ({ smsSignIn: settings.smsSignIn, emergencyNumbers: settings.emergencyNumbers, sosContactsSms: settings.sosContactsSms });

/**
 * Security review of the SMS switch (2026-11-19, should-fix): an unsaved draft started while ANOTHER scope was shown
 * (same chosen zones, another zone picked at the top) carries that scope's country-wide values — a zone's are the
 * defaults (SMS sign-in off / 200). Shown on the Standard they would be saved to it. The draft keeps its other
 * edits; the country-wide values are the newly shown scope's saved ones until the admin edits there.
 */
export function draftForShownScope(draft: CountrySettings, madeOn: string | undefined, shownId: string | undefined, saved: CountrySettings): CountrySettings {
  return madeOn === shownId ? draft : { ...draft, ...countryWideOf(saved) };
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

/**
 * The Tips & limits values that belong to the country Standard alone: the server reads the money limits from the
 * Standard only and refuses the emergency numbers and the SOS SMS switch on a zone's own rules. On a zone the panel
 * shows them locked.
 */
export const STANDARD_ONLY_FIELDS = ["walletCreditMax", "maxRiderDebt", "driverOwesLimit", "emergencyNumbers", "sosContactsSms", "riderFeeStripe"] as const satisfies readonly (keyof CountrySettings)[];

/**
 * What the live Tips & limits panel shows for a scope: its own settings, and for a ZONE the Standard's values of the
 * Standard-only fields. Live bug 2026-11-19 (Rules audits/impact/admin-tipslimits-reset.md): the panel showed what it
 * read from the zone's OWN document for them (the default emergency numbers, SOS SMS on, and any money limit left in
 * that document), and Save sends the shown values to every chosen scope. With the Standard also chosen, the Standard
 * was reset to them, with no line in the confirm.
 */
export function shownSettingsOf(book: CountrySettingsBook, country: MarketId, zoneId: string): CountrySettings {
  const own = zoneSettingsOf(book, country, zoneId);
  const standardId = `standard-${country}`;
  if (zoneId === standardId) return own;
  const standard = zoneSettingsOf(book, country, standardId);
  return { ...own, ...Object.fromEntries(STANDARD_ONLY_FIELDS.map((field) => [field, standard[field]])) };
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
  // v0.18.110 BQ-V44: CountryRules.bonusCampaignMax, above 0 with the currency's decimals.
  if (!finite(settings.bonusCampaignMax) || settings.bonusCampaignMax <= 0) issues.push(tr("{0}: Largest campaign bonus must be above 0.", [name]));
  else if (hasMoreDecimals(settings.bonusCampaignMax, country)) issues.push(tr("{0}: Largest campaign bonus has too many decimals.", [name]));
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
  // v0.18.133 (contract.json#smsSignIn.dailyCapRange).
  issues.push(...smsSignInIssues(name, settings.smsSignIn));
  // S5 J9 (v0.18.84): Max rider debt is any amount above 0; the owes-limit ON needs an amount above 0.
  if (!finite(settings.maxRiderDebt) || settings.maxRiderDebt <= 0) issues.push(tr("{0}: Max rider debt must be above 0.", [name]));
  else if (hasMoreDecimals(settings.maxRiderDebt, country)) issues.push(tr("{0}: Max rider debt has too many decimals.", [name]));
  const owes = settings.driverOwesLimit;
  if (owes.max !== null && (!finite(owes.max) || owes.max < 0)) issues.push(tr("{0}: the driver owes-limit must be above 0.", [name]));
  else if (owes.enabled && !(owes.max !== null && owes.max > 0)) issues.push(tr("{0}: set an amount above 0 to switch the driver owes-limit on.", [name]));
  else if (owes.max !== null && hasMoreDecimals(owes.max, country)) issues.push(tr("{0}: the driver owes-limit has too many decimals.", [name]));
  // v0.18.139 driverPayRequest: day 1-28, an https link, a minimum of 0 or above; ON needs the link and the minimum.
  const ask = settings.driverPayRequest;
  if (!Number.isInteger(ask.dayOfMonth) || ask.dayOfMonth < 1 || ask.dayOfMonth > 28) issues.push(tr("{0}: the day of the monthly pay request must be 1 to 28.", [name]));
  if (ask.payLink !== "" && !isPayLink(ask.payLink)) issues.push(tr("{0}: the payment link must start with https:// and have no spaces (at most {1} characters).", [name, PAY_LINK_MAX]));
  // Owner 2026-11-20 "So we use stripe ... for the driver to pay his monthly invoice": Stripe replaces the link; no link is
  // needed to switch it on. A stored link stays hidden legacy (Rule D) and is still checked above.
  if (ask.minAmount !== null && (!finite(ask.minAmount) || ask.minAmount < 0)) issues.push(tr("{0}: the smallest amount to ask for must be 0 or above.", [name]));
  else if (ask.enabled && ask.minAmount === null) issues.push(tr("{0}: set the smallest amount to ask for to switch the monthly pay request on.", [name]));
  else if (ask.minAmount !== null && hasMoreDecimals(ask.minAmount, country)) issues.push(tr("{0}: the smallest amount to ask for has too many decimals.", [name]));
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
  if (before.mixedCashInCar && !after.mixedCashInCar) lines.push(tr("Cash tip time in the car: mixed → {0} min", [String(after.tipRules.cashInCarMinutes)]));
  else if (!after.mixedCashInCar && before.tipRules.cashInCarMinutes !== after.tipRules.cashInCarMinutes) lines.push(tr("Cash tip time in the car: {0} min", [String(after.tipRules.cashInCarMinutes)]));
  for (const method of ZONE_PAYMENT_METHODS) if (before.mixedMethods?.[method]?.length && !after.mixedMethods?.[method]?.length) lines.push(`${PAYMENT_METHOD_LABEL[method]}: mixed → ${after.paymentMethods[method] ? "on" : "off"}`);
    else if (before.paymentMethods[method] !== after.paymentMethods[method]) lines.push(`${PAYMENT_METHOD_LABEL[method]}: ${before.paymentMethods[method] ? "on" : "off"} → ${after.paymentMethods[method] ? "on" : "off"}`);
  for (const app of APP_IDS) if (before.languages[app] !== after.languages[app]) lines.push(`${APP_LABEL[app]} default language: ${before.languages[app]} → ${after.languages[app]}`);
  if (before.bonusCampaignMax !== after.bonusCampaignMax) lines.push(tr("Largest campaign bonus: {0} → {1} {2}", [short(before.bonusCampaignMax), short(after.bonusCampaignMax), symbol]));
  if (before.chainLateFreeCancelMin !== after.chainLateFreeCancelMin) lines.push(tr("Next trip free cancel after: {0} min → {1} min", [before.chainLateFreeCancelMin, after.chainLateFreeCancelMin]));
  if (before.onTripMinDonePct !== after.onTripMinDonePct) lines.push(tr("Offers on a trip from: {0} % → {1} %", [before.onTripMinDonePct, after.onTripMinDonePct]));
  lines.push(...callSettingsLines(before.calls, after.calls));
  lines.push(...chatSettingsLines(before.chat, after.chat));
  lines.push(...dontMatchLines(before.dontMatchAgain, after.dontMatchAgain));
  lines.push(...emergencyNumbersLines(before.emergencyNumbers, after.emergencyNumbers));
  lines.push(...sosContactsSmsLines(before.sosContactsSms, after.sosContactsSms));
  lines.push(...smsSignInLines(before.smsSignIn, after.smsSignIn));
  if (before.maxRiderDebt !== after.maxRiderDebt) lines.push(tr("Max rider debt: {0} → {1}", [`${short(before.maxRiderDebt)} ${symbol}`, `${short(after.maxRiderDebt)} ${symbol}`]));
  if (before.riderFeeStripe !== after.riderFeeStripe) lines.push(tr("Card payment of fees: {0} → {1}", [tr(before.riderFeeStripe ? "on" : "off"), tr(after.riderFeeStripe ? "on" : "off")]));
  if (JSON.stringify(before.driverOwesLimit) !== JSON.stringify(after.driverOwesLimit)) {
    const owes = (limit: DriverOwesLimit) => `${tr(limit.enabled ? "on" : "off")}${limit.max !== null ? `, ${short(limit.max)} ${symbol}` : ""}`;
    lines.push(tr("Driver owes-limit: {0} → {1}", [owes(before.driverOwesLimit), owes(after.driverOwesLimit)]));
  }
  // v0.18.139: each part of the monthly pay request on its own line (the link in full: it is where the money goes).
  const askBefore = before.driverPayRequest, askAfter = after.driverPayRequest;
  if (askBefore.enabled !== askAfter.enabled) lines.push(tr("Monthly pay request: {0} → {1}", [tr(askBefore.enabled ? "on" : "off"), tr(askAfter.enabled ? "on" : "off")]));
  if (askBefore.dayOfMonth !== askAfter.dayOfMonth) lines.push(tr("Monthly pay request, day of the month: {0} → {1}", [askBefore.dayOfMonth, askAfter.dayOfMonth]));
  if (askBefore.payLink !== askAfter.payLink) lines.push(tr("Monthly pay request, payment link: {0} → {1}", [askBefore.payLink || tr("none"), askAfter.payLink || tr("none")]));
  if (askBefore.minAmount !== askAfter.minAmount) {
    const amount = (value: number | null) => (value === null ? tr("none") : `${short(value)} ${symbol}`);
    lines.push(tr("Monthly pay request, smallest amount: {0} → {1}", [amount(askBefore.minAmount), amount(askAfter.minAmount)]));
  }
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
