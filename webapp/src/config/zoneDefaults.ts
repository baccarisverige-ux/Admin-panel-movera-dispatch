import type { MarketId } from "../markets/markets.ts";
import type { CurrencyCode, Money } from "../domain/money.ts";

/**
 * Defaults for the per-zone config fields of contract v0.4.0 (contracts/CONTRACT.md §6, contract.json#configDefaults).
 * They are the starting values of the admin settings (config/countrySettings.ts, Dispatch, Pricing); the exporters read
 * those settings. Only driverBonus.hardMax and waitingDriverSharePct (100 %) are fixed and used as they are.
 * `zoneDefaults.test.ts` keeps them equal to contract.json.
 */

export const APP_LANGUAGES = ["en", "fr", "sv"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

/** contract.json#zonePaymentMethods: at most these (owner Q7; v0.18.10 owner G8: no Google Pay). The wallet is separate. */
export const ZONE_PAYMENT_METHODS = ["cash", "card", "apple_pay"] as const;
export type ZonePaymentMethod = (typeof ZONE_PAYMENT_METHODS)[number];

export type CountryDefaults = {
  currency: CurrencyCode;
  defaultLanguage: AppLanguage;
  tips: Money[];
  raiseSteps: Money[];
  driverBonus: { defaultLimit: Money; hardMax: Money };
};

const money = (currency: CurrencyCode) => (amountMinor: number): Money => ({ amountMinor, currency });
const sek = money("SEK");
const eur = money("EUR");
const tnd = money("TND");

export const CONFIG_DEFAULTS = {
  maxStops: 3,
  /** v0.18.7 (owner 2026-10-29 "200 m default, admin can change"): was 500. */
  maxPickupMoveMeters: 200,
  /** v0.18.30 (owner Q9): pickup ≈ drop-off warning under this many metres (contract configDefaults.samePointWarnMeters). */
  samePointWarnMeters: 100,
  freeWaitMin: { default: 5, xl: 3 },
  waitingDriverSharePct: 100,
  noShowDriverSharePct: 80,
  missedExclusiveBeforeOffline: 10,
  /** G3-R1 (v0.18.4): no position for this many minutes → the server sets the driver offline (0 = never). */
  noFixMinutesBeforeOffline: 5,
  /** v0.18.8 (G6): Rider PIN before Start — off, 5 wrong tries, then 5 min lock. */
  pickupPin: { required: false, maxAttempts: 5, lockMinutes: 5 },
  /**
   * BQ-V22 (owner G5-8, decisions/driver-g5.md:9,16 "80 % default, admin can change"; contract.json#configDefaults.headingCheck
   * + pickupWaiting.headingCheck): heading to the pickup = at least headingPct % of what normal road speed allows; not
   * heading for notHeadingMinutes in a row = free rider cancel. Per zone. Ranges as the contract / server (50-100 %, 1-30 min).
   */
  headingCheck: { headingPct: 80, notHeadingMinutes: 2 },
  countries: {
    SE: { currency: "SEK", defaultLanguage: "sv", tips: [sek(1000), sek(2000), sek(3000)], raiseSteps: [sek(5000), sek(10000), sek(15000), sek(20000)], driverBonus: { defaultLimit: sek(20000), hardMax: sek(100000) } },
    FR: { currency: "EUR", defaultLanguage: "fr", tips: [eur(100), eur(200), eur(500)], raiseSteps: [eur(200), eur(400), eur(600), eur(800)], driverBonus: { defaultLimit: eur(2000), hardMax: eur(9500) } },
    TN: { currency: "TND", defaultLanguage: "fr", tips: [tnd(1000), tnd(2000), tnd(3000)], raiseSteps: [tnd(2000), tnd(4000), tnd(6000), tnd(8000)], driverBonus: { defaultLimit: tnd(60000), hardMax: tnd(300000) } },
  } satisfies Record<MarketId, CountryDefaults>,
} as const;

/** BQ-V22: the ranges the server accepts (src/trips/headingCheck.ts; openapi DriverAppConfig.headingCheck). */
export const HEADING_RANGE = { headingPct: [50, 100], notHeadingMinutes: [1, 30] } as const;

/** BQ-V22: a heading value inside its range, else the contract default (older saves, a bad server value). */
export function headingValue(key: keyof typeof HEADING_RANGE, value: unknown): number {
  const [min, max] = HEADING_RANGE[key];
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : CONFIG_DEFAULTS.headingCheck[key];
}

export function countryDefaults(country: MarketId): CountryDefaults {
  return CONFIG_DEFAULTS.countries[country];
}

/** The default free wait of a category in minutes (= its no-show wait, owner Q41). */
export function defaultFreeWaitMin(categoryId: string): number {
  return categoryId === "xl" ? CONFIG_DEFAULTS.freeWaitMin.xl : CONFIG_DEFAULTS.freeWaitMin.default;
}

/** Admin payment method ids (Finance) as contract zone payment methods; ids with no contract counterpart give null. */
export function zonePaymentMethodOf(method: string): ZonePaymentMethod | null {
  if (method === "cash" || method === "card") return method;
  if (method === "apple" || method === "apple_pay") return "apple_pay";
  return null;
}
