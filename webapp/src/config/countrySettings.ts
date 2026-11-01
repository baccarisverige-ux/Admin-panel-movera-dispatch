import { MARKETS, market, type MarketId } from "../markets/markets.ts";
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
  languages: Record<LanguageApp, AppLanguage>;
  /**
   * v0.18.10 (G8, contract.json#finish.tips.settings → RiderAppConfig.tipRules): cash tips after the trip (default off =
   * only in the car), a typed amount (default off) and its maximum in local money (SE 200 kr, FR 20 €).
   */
  tipRules: TipRules;
  /** v0.18.10 checker: the largest single change of a driver's pay on a trip (CountryRules.driverPayChangeMax), local money. */
  driverPayChangeMax: number;
};
export const DRIVER_PAY_CHANGE_MAX: Record<MarketId, number> = { SE: 1000, FR: 100, TN: 300 };
export type TipRules = { cashAfterTrip: boolean; customAmount: boolean; customMax: number };
/** contract.json#configDefaults.tipRules.customMax (major units); TN (closed) like FR in its own money. */
export const TIP_CUSTOM_MAX: Record<MarketId, number> = { SE: 200, FR: 20, TN: 60 };

/**
 * `zones` (contract v0.8.1, owner 2026-10-28, live panel): Tips & limits of a zone or a country's Standard, by its
 * id, as the server has them; a zone without its own shows its Standard's.
 */
export type CountrySettingsBook = { draftRev: number; countries: Record<MarketId, CountrySettings>; zones?: Record<string, CountrySettings> };

/** The fields each section owns: Pricing saves the money settings, Settings the payment methods and languages. */
/** v0.8.1: the live panel's Tips & limits per zone and Standard (read when the tab opens). */
export const ZONE_RULES_KEY = "countrySettingsZones";

export const PRICING_FIELDS = ["tips", "raiseSteps", "promoCap", "driverBonusLimit", "tipRules", "driverPayChangeMax"] as const satisfies readonly (keyof CountrySettings)[];
export const SETTINGS_FIELDS = ["paymentMethods", "languages"] as const satisfies readonly (keyof CountrySettings)[];

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
    languages: { rider: defaults.defaultLanguage, driver: defaults.defaultLanguage, admin: defaults.defaultLanguage },
    tipRules: { cashAfterTrip: false, customAmount: false, customMax: TIP_CUSTOM_MAX[country] },
    driverPayChangeMax: DRIVER_PAY_CHANGE_MAX[country],
  };
}

export function emptyCountrySettingsBook(): CountrySettingsBook {
  return { draftRev: 1, countries: Object.fromEntries(MARKETS.map((item) => [item.id, defaultCountrySettings(item.id)])) as Record<MarketId, CountrySettings> };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

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
    languages: Object.fromEntries(APP_IDS.map((app) => [app, (APP_LANGUAGES as readonly unknown[]).includes(languages[app]) ? languages[app] : base.languages[app]])) as Record<LanguageApp, AppLanguage>,
    tipRules: completeTipRules(raw.tipRules, base.tipRules),
    driverPayChangeMax: finite(raw.driverPayChangeMax) && raw.driverPayChangeMax > 0 ? raw.driverPayChangeMax : base.driverPayChangeMax,
  };
}

function completeTipRules(stored: unknown, base: TipRules): TipRules {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Partial<TipRules>;
  return {
    cashAfterTrip: typeof raw.cashAfterTrip === "boolean" ? raw.cashAfterTrip : base.cashAfterTrip,
    customAmount: typeof raw.customAmount === "boolean" ? raw.customAmount : base.customAmount,
    customMax: finite(raw.customMax) ? raw.customMax : base.customMax,
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
  if (!ZONE_PAYMENT_METHODS.some((method) => settings.paymentMethods[method])) issues.push(`${name}: at least one payment method must be on.`);
  for (const app of APP_IDS) if (!(APP_LANGUAGES as readonly string[]).includes(settings.languages[app])) issues.push(`${name}: choose a language for the ${APP_LABEL[app].toLowerCase()}.`);
  if (!(settings.tipRules.customMax > 0) || settings.tipRules.customMax > TIP_CUSTOM_MAX[country] * 10) issues.push(`${name}: the highest typed tip must be more than 0 and at most ${TIP_CUSTOM_MAX[country] * 10}.`);
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
  if (JSON.stringify(before.tipRules) !== JSON.stringify(after.tipRules)) lines.push(`Tip rules: cash after the trip ${after.tipRules.cashAfterTrip ? "on" : "off"}, typed amount ${after.tipRules.customAmount ? "on" : "off"} (max ${after.tipRules.customMax})`);
  for (const method of ZONE_PAYMENT_METHODS) if (before.paymentMethods[method] !== after.paymentMethods[method]) lines.push(`${PAYMENT_METHOD_LABEL[method]}: ${before.paymentMethods[method] ? "on" : "off"} → ${after.paymentMethods[method] ? "on" : "off"}`);
  for (const app of APP_IDS) if (before.languages[app] !== after.languages[app]) lines.push(`${APP_LABEL[app]} default language: ${before.languages[app]} → ${after.languages[app]}`);
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
