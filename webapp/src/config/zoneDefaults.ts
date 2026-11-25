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
  /** v0.18.160 (owner 2026-11-23 "rider can adjust the pickup up to 300 m for free"): was 200 (v0.18.7), before that 500. */
  maxPickupMoveMeters: 300,
  /** v0.18.30 (owner Q9): pickup ≈ drop-off warning under this many metres (contract configDefaults.samePointWarnMeters). */
  samePointWarnMeters: 100,
  /** v0.18.115 BQ-V21 (owner: default on): the rider's approximate pickup entrance chips (contract configDefaults.pickupSpotsOn). */
  pickupSpotsOn: true,
  /** v0.18.116 BQ-S10 (owner S10 Q6: default on): riders can share a live trip link (contract configDefaults.shareTripOn). */
  shareTripOn: true,
  /** v0.18.158 (owner 2026-11-24 "Add to admin all kind of crash"): the apps send crash reports (contract configDefaults.crashReportsOn). */
  crashReportsOn: true,
  /** v0.18.144 (owner 2026-11-20; supervisor: OFF until the load test passes): two-way live location (contract configDefaults.liveLocationShare). */
  liveLocationShare: false,
  /** v0.18.144: the rider app's adjust-pickup banner shows when the rider is farther than this from the pickup (contract configDefaults.adjustPickupMeters). */
  adjustPickupMeters: 30,
  /** v0.18.155 driver profile (owner 2026-11-20 "Now build all"): the rider sees the driver profile sheet (contract configDefaults.driverProfileOn). */
  driverProfileOn: true,
  /** v0.18.155: written reviews on the profile, each shown only after an admin approves it; off until a zone has moderators (contract configDefaults.driverReviewsOn). */
  driverReviewsOn: false,
  /** v0.18.122 L20 stream (owner 2026-11-17 "Yes, with switch (Rec.)", off until tested): one live connection per driver phone (contract configDefaults.driverOneStream). */
  driverOneStream: false,
  /**
   * v0.18.150 L20 stream backup (owner 2026-11-21 "Switch to old two (Rec.)"): after failuresInARow failed tries of the one
   * connection in a row the driver phone uses the two old connections for retryOneAfterMinutes (contract
   * configDefaults.driverOneStreamFallback; ranges 1-10 and 1-60, contract.json#driverOneStreamFallback.setting).
   */
  driverOneStreamFallback: { failuresInARow: 3, retryOneAfterMinutes: 10 },
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
