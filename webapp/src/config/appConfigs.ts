import { marketOfZone, type MarketId } from "../markets/markets.ts";
import { fromMajor, type CurrencyCode, type Money } from "../domain/money.ts";
import { activeCategories, normalizeStore, zoneBook, type PricingStore } from "../pricing/zonePricing.ts";
import type { PickupRate } from "../pricing/pickupPay.ts";
import { liveCountry, liveRules, normalizeDispatchBook, type DispatchBook, type RideTypeId, type ZoneDispatch } from "../dispatch/rules.ts";
import { radarRuleFor, radarZonesOf } from "../dispatch/radarZones.ts";
import { feeRow, type CancelFeeKind, type CancelFeeRow, type CancelFeeTable } from "../dispatch/cancelFees.ts";
import { LANGS, reasonText, type CancelReason, type LangId, type WaitOverride } from "../dispatch/offers.ts";
import { destinationModeForDriverApp, nextTripsForDriverApp } from "../dispatch/tripRules.ts";
import { advanceConfigClock, effectiveValue, normalizeConfig, type AppId, type AppUpdate, type ConfigBook } from "./book.ts";
import { normalizeFinanceBook, paymentPolicy, type FinanceBook } from "../payments/finance.ts";
import { PAYMENT_METHODS } from "../payments/book.ts";
import { normalizeReservationBook, type ReservationBook } from "../reservations/book.ts";
import { driverAppTexts, normalizeDriverTextBook, type DriverTextBook } from "../content/driverTexts.ts";
import { driverAppNotices, normalizeDriverNoticeBook, type DriverNoticeBook } from "../messages/driverNotices.ts";
import { normalizeRideCheckSettings, type RideCheckSettings } from "../safety/rideCheckSettings.ts";
import { seedZones } from "../zones/releases.ts";
import { APP_LANGUAGES, CONFIG_DEFAULTS, countryDefaults, ZONE_PAYMENT_METHODS, zonePaymentMethodOf, type ZonePaymentMethod } from "./zoneDefaults.ts";
import { countrySettingsOf, normalizeCountrySettingsBook, type AmountOption, type CountrySettingsBook } from "./countrySettings.ts";

/**
 * The two per-zone config documents of contracts/CONTRACT.md §6, RiderAppConfig and DriverAppConfig, built from the
 * live (published) admin state. Money is { amountMinor, currency } in the currency's ISO 4217 exponent (SEK/EUR 2,
 * TND 3); cancel fees are FeeRule per Pricing category id. Pure functions: same state in, same document out.
 * The legacy dispatch rules file (dispatch/rules.ts rulesFile) is separate and unchanged.
 *
 * Keys beyond the contract sample are additive ("unknown keys are ignored"): pickupPay.byCategory,
 * cancelCheck, sourceRevisions, and a few on/off switches next to the numbers they gate.
 *
 * Contract v0.4.0 per-zone fields (and v0.4.1 reservations) come from the admin settings: languages, tips, raiseSteps, promoCap, paymentMethods and
 * the driver bonus limit from the country settings (Pricing and Settings, countrySettings.ts); booking.maxStops,
 * booking.maxPickupMoveMeters, offers.autoOffline.missedExclusive and the no-show fee share from Dispatch; waiting per
 * category from Pricing. Only the fixed values (driverBonus.hardMax, the 100 % waiting share) are CONFIG_DEFAULTS.
 */

/** contract §6 FeeRule. fixed: value in minor units. percent: value 0–100 of the fare. */
export type FeeRule = { freeMin: number; type: "fixed" | "percent"; value: number; min: Money | null; max: Money | null };

/** Everything the documents are made from. Each part is the stored slice; missing parts fall back to the app's defaults. */
export type AppConfigState = {
  dispatch: DispatchBook;
  pricing: PricingStore;
  config: ConfigBook;
  finance: FinanceBook;
  reservations: ReservationBook;
  driverTexts: DriverTextBook;
  driverNotices: DriverNoticeBook;
  rideCheck: RideCheckSettings;
  countrySettings: CountrySettingsBook;
  /** Used for publishedAt when nothing was ever published, and for timed feature overrides. */
  now: string;
  /** Language of the rider document's cancel reason titles. */
  riderLang: LangId;
};

/** Normalises raw slices (as useSlice returns them; null or missing = never saved) into an AppConfigState. */
export function appConfigState(raw: Partial<Record<Exclude<keyof AppConfigState, "now" | "riderLang">, unknown>> & { now: string; riderLang?: LangId }): AppConfigState {
  return {
    dispatch: normalizeDispatchBook(raw.dispatch),
    pricing: normalizeStore(raw.pricing),
    // Scheduled config publications that are due by `now` count as live, like the Config page applies them.
    config: advanceConfigClock(normalizeConfig((raw.config ?? null) as Partial<ConfigBook> | null), raw.now),
    finance: normalizeFinanceBook(raw.finance),
    reservations: normalizeReservationBook(raw.reservations),
    driverTexts: normalizeDriverTextBook(raw.driverTexts),
    driverNotices: normalizeDriverNoticeBook(raw.driverNotices),
    rideCheck: normalizeRideCheckSettings(raw.rideCheck),
    countrySettings: normalizeCountrySettingsBook(raw.countrySettings),
    now: raw.now,
    riderLang: raw.riderLang ?? "en",
  };
}

/* ---------- money and fee rules ---------- */

function zoneMarket(zoneId: string) {
  const found = marketOfZone(zoneId);
  if (!found) throw new RangeError(`Unknown zone ${zoneId}`);
  return found;
}

/** A stored major-unit amount (kr, €, DT) as wire Money. */
function wire(major: number, currency: CurrencyCode): Money {
  return fromMajor(major, currency);
}

/** One admin cancel-fee row (major units) as a contract FeeRule (minor units). min/max only count for a percent fee. */
export function feeRuleOf(row: CancelFeeRow, currency: CurrencyCode): FeeRule {
  if (row.type === "fixed") return { freeMin: row.freeMin, type: "fixed", value: wire(row.value, currency).amountMinor, min: null, max: null };
  return { freeMin: row.freeMin, type: "percent", value: row.value, min: row.min === null ? null : wire(row.min, currency), max: row.max === null ? null : wire(row.max, currency) };
}

function feeRules(table: CancelFeeTable, categoryIds: readonly string[], currency: CurrencyCode): Record<string, FeeRule> {
  return Object.fromEntries(categoryIds.map((id) => [id, feeRuleOf(feeRow(table, id), currency)]));
}

/**
 * The rider cancel fee a FeeRule gives (contracts/fixtures/cancel_fees.json). Live: free while minutesSinceAccept < freeMin.
 * Reservation: free while minutesBeforePickup >= freeMin. Else fixed value, or percent of the fare rounded half-up to a
 * whole minor unit, then clamped to min/max.
 */
export function feeFor(rule: FeeRule, fare: Money, kind: CancelFeeKind, minutes: number): Money {
  const free = kind === "live" ? minutes < rule.freeMin : minutes >= rule.freeMin;
  if (free) return { amountMinor: 0, currency: fare.currency };
  if (rule.type === "fixed") return { amountMinor: Math.max(0, rule.value), currency: fare.currency };
  let amount = Math.round((Math.max(0, fare.amountMinor) * rule.value) / 100);
  if (rule.min) amount = Math.max(amount, rule.min.amountMinor);
  if (rule.max) amount = Math.min(amount, rule.max.amountMinor);
  return { amountMinor: Math.max(0, amount), currency: fare.currency };
}

/* ---------- shared parts ---------- */

type Common = ReturnType<typeof common>;

function common(zoneId: string, state: AppConfigState) {
  const info = zoneMarket(zoneId);
  const currency = info.currency;
  const zone = liveRules(state.dispatch, zoneId);
  const country = liveCountry(state.dispatch, info.id);
  const pricing = zoneBook(state.pricing, zoneId);
  const categories = activeCategories(state.pricing).filter((category) => pricing.prices[category.id]?.enabled);
  const categoryIds = categories.map((category) => category.id);
  const config = state.config.published;
  const settings = countrySettingsOf(state.countrySettings, info.id);
  return { info, currency, zone, country, pricing, categories, categoryIds, config, settings };
}

function sourceRevisions(state: AppConfigState) {
  return {
    dispatch: state.dispatch.draftRev,
    pricing: state.pricing.draftRev,
    config: state.config.rev,
    finance: state.finance.draftRev,
    reservations: state.reservations.draftRev,
    rideCheck: state.rideCheck.draftRev,
    driverTexts: state.driverTexts.draftRev,
    driverNotices: state.driverNotices.draftRev,
    countrySettings: state.countrySettings.draftRev,
  };
}

/** Sum of the source revisions: each only goes up, so the document version only goes up. */
function versionOf(revisions: Record<string, number>): number {
  return Object.values(revisions).reduce((sum, rev) => sum + rev, 0);
}

/** The newest publish of any source, else `now`. */
function publishedAtOf(state: AppConfigState): string {
  const times = [
    ...state.dispatch.versions.map((item) => item.at),
    ...state.config.publications.map((item) => item.at),
    ...state.pricing.history.map((item) => item.at),
  ].filter((at) => typeof at === "string" && !Number.isNaN(Date.parse(at)));
  if (!times.length) return state.now;
  return new Date(Math.max(...times.map((at) => Date.parse(at)))).toISOString().replace(/\.000Z$/, "Z");
}

function header(zoneId: string, state: AppConfigState, base: Common) {
  const revisions = sourceRevisions(state);
  return { version: versionOf(revisions), publishedAt: publishedAtOf(state), zoneId, currency: base.currency, timeZone: base.info.timeZone, country: base.info.id, languages: languages(base) };
}

/** Owner Q48/Q49: en / fr / sv in every app; the country's default for the rider, driver and admin apps (Settings › Languages). */
function languages(base: Common) {
  return { available: [...APP_LANGUAGES], default: { ...base.settings.languages } };
}

/** Tips and raise-offer steps of the country (owner Q5/Q6, Pricing › Tips & limits), in the admin's order; a deactivated one has enabled: false. */
function amountOptions(list: readonly AmountOption[], currency: CurrencyCode) {
  return list.map((item) => ({ amount: wire(item.amount, currency), enabled: item.enabled }));
}

/** Q17: the limit is the Pricing setting; the hard max is fixed per country (contract.json#configDefaults). */
function driverBonus(base: Common) {
  const hardMax = countryDefaults(base.info.id).driverBonus.hardMax;
  const limit = wire(base.settings.driverBonusLimit, base.currency);
  return { defaultLimit: limit.amountMinor > hardMax.amountMinor ? { ...hardMax } : limit, hardMax: { ...hardMax } };
}

/** Q39/Q40: max stops and the pickup move limit after accept, from the zone's live Dispatch rules. */
function booking(base: Common) {
  return { maxStops: base.zone.stops.on ? base.zone.stops.max : 0, maxPickupMoveMeters: base.zone.pickupMove.maxMeters };
}

/** v0.7.1/v0.7.2 contract sample: the sub-line goes to the rider app as { sv, fr, en } (contract.json#categoryCatalog). */
function catalog(base: Common) {
  return { categories: base.categories.map((category, index) => ({ id: category.id, label: category.label, seats: category.seats, sort: index + 1, line: category.lines ?? { sv: category.line, fr: category.line, en: category.line } })) };
}

/** The config page's override context for a market zone: its shape id ("op-norrmalm") and market ("SE-STO"). */
function featureContext(zoneId: string, country: MarketId, app: AppId, now: string) {
  const shapes = seedZones();
  const shape = shapes.find((item) => item.marketZoneId === zoneId);
  const service = shapes.find((item) => item.kind === "service" && item.country === country);
  return { market: service ? `${country}-${service.code}` : country, zoneId: shape?.id ?? zoneId, app, nowIso: now };
}

function switchOn(base: Common, app: AppId, id: string): boolean {
  return base.config.switches.find((item) => item.app === app && item.id === id)?.on ?? true;
}

function featureOn(base: Common, key: "reservations" | "wallet", zoneId: string, app: AppId, now: string): boolean {
  return effectiveValue(base.config, key, featureContext(zoneId, base.info.id, app, now)).value === "on";
}

/**
 * One flag per app (contract §5), owned by Dispatch › Reservations (Q26, X18). The old Settings switches
 * (Scheduled rides, Book later, Reservations row, per-zone Reservations) are read-only and no longer decide it.
 */
function scheduledRides(base: Common): boolean {
  return base.zone.reservation.on;
}

/** Owner Q41/Q42: no-show is allowed once the category's free wait (Pricing) is over; the waiting fee per minute starts then. */
function waitingFor(base: Common, categoryId: string) {
  const price = base.pricing.prices[categoryId];
  return { freeWaitMin: price.freeWaitMin, perMin: wire(price.waitPerMin, base.currency), noShowAfterMin: price.freeWaitMin, noShowFee: wire(price.noShowFee, base.currency) };
}

/** The category whose terms are the zone's headline terms: Economy, else the first in the catalog. */
function headlineCategory(base: Common): string | null {
  return base.categoryIds.includes("economy") ? "economy" : base.categoryIds[0] ?? null;
}

function waiting(base: Common) {
  const head = headlineCategory(base);
  const top = head ? waitingFor(base, head) : { freeWaitMin: 0, perMin: wire(0, base.currency), noShowAfterMin: 0, noShowFee: wire(0, base.currency) };
  return { ...top, byCategory: Object.fromEntries(base.categoryIds.map((id) => [id, waitingFor(base, id)])) };
}

/**
 * The extra waiting rules (far pickup, ride types) and v0.18.8 (G6) the free wait at each stop (Dispatch › Rides ›
 * Stops, 0 while stops are off). The server enforces them from the driver document and copies them to the rider one.
 */
function waitingRules(base: Common, state: AppConfigState) {
  const { zone, currency } = base;
  return {
    farPickup: { on: zone.pickupWait.farPickupOn, km: zone.pickupWait.farPickupKm, ...waitOverride(zone.pickupWait.farPickup, currency) },
    rideTypes: {
      scheduled: { on: zone.pickupWait.rideTypes.scheduled.on, ...waitOverride({ ...zone.pickupWait.rideTypes.scheduled, freeWaitMin: state.reservations.currentPolicy.includedWaitingMinutes }, currency) },
      airport: { on: zone.pickupWait.rideTypes.airport.on, ...waitOverride(zone.pickupWait.rideTypes.airport, currency) },
      event: { on: zone.pickupWait.rideTypes.event.on, ...waitOverride(zone.pickupWait.rideTypes.event, currency) },
    },
    stopFreeWaitMin: zone.stops.on ? zone.stops.freeWaitMin : 0,
  };
}

function waitOverride(rule: WaitOverride, currency: CurrencyCode) {
  return { freeWaitMin: rule.freeWaitMin, perMin: rule.perMin === null ? null : wire(rule.perMin, currency), noShowAfterMin: rule.noShowAfterMin, noShowFee: rule.noShowFee === null ? null : wire(rule.noShowFee, currency) };
}

function cancelFees(base: Common) {
  return {
    live: feeRules(base.zone.riderCancel.fees, base.categoryIds, base.currency),
    reservation: feeRules(base.zone.reservation.riderFees, base.categoryIds, base.currency),
  };
}

/** DriverAppConfig.cancelFees (v0.8.0): the tables plus the driver's share of a rider's cancel fee (Dispatch, per zone). */
function driverCancelFees(base: Common) {
  return { ...cancelFees(base), driverSharePct: base.zone.riderCancel.driverSharePct ?? 100 };
}

function rideCheck(base: Common, state: AppConfigState) {
  const rules = base.zone.rideCheck;
  return {
    // v0.18.9 (G7, contract.json#onTrip.rideCheck.settings): the server's per-zone ride check (stopMinutes, offRouteKm too).
    on: rules.on, endFarMeters: rules.endFarMeters, noAnswerSeconds: rules.noAnswerSeconds, repeatMinutes: rules.repeatMinutes, noAnswerAlarm: rules.noAnswerAlarm,
    stopMinutes: rules.stopMinutes ?? state.rideCheck.longStopMinutes,
    offRouteKm: rules.routeKm,
    finishFarFromDropoffKm: state.rideCheck.finishFarFromDropoffKm,
    farOn: rules.farOn, stopOn: rules.stopOn, routeOn: rules.routeOn, longerOn: rules.longerOn, longerPct: rules.longerPct, crashOn: rules.crashOn,
  };
}

/** v0.18.9 (G7, contract.json#onTrip.routeChange): Dispatch › Rides › Stops, per zone; off while stops are off. */
function routeChange(base: Common) {
  const stops = base.zone.stops;
  return { on: stops.on && stops.changeDuring, driverCanRefuse: stops.driverCanRefuse, answerSeconds: stops.answerSeconds, beforePickup: stops.beforePickup, fixedPriceTrips: stops.fixedPriceTrips };
}

function semver(value: string): number[] {
  return value.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function higher(a: string, b: string): string {
  const x = semver(a);
  const y = semver(b);
  for (let index = 0; index < Math.max(x.length, y.length); index += 1) {
    if ((x[index] ?? 0) !== (y[index] ?? 0)) return (x[index] ?? 0) > (y[index] ?? 0) ? a : b;
  }
  return a;
}

/** Top level: the highest minimum and latest over the platforms that have an update rule on; byPlatform has each. */
function appUpdate(base: Common, app: AppId) {
  const rows = base.config.updates.filter((item) => item.app === app);
  const on = rows.filter((item) => item.enabled);
  const pick = (key: "minimumVersion" | "latestVersion") => (on.length ? on : rows).map((item) => item[key]).reduce(higher, "0.0.0");
  const one = (item: AppUpdate) => ({ enabled: item.enabled, minimumVersion: item.minimumVersion, latestVersion: item.latestVersion, mandatory: item.mandatory, title: item.title, message: item.message, actionLabel: item.actionLabel, dismissLabel: item.dismissLabel, updateUrl: item.updateUrl });
  return { minimumVersion: pick("minimumVersion"), latestVersion: pick("latestVersion"), byPlatform: Object.fromEntries(rows.map((item) => [item.platform, one(item)])) };
}

/* ---------- RiderAppConfig ---------- */

/**
 * Contract v0.4 (owner Q7 FINAL): the zone's methods are a subset of cash, card, apple_pay, google_pay, in that order.
 * A method is offered when it is ticked for the country (Settings › Payment methods) and Finance has it on for at least
 * one of the zone's categories on one platform. The wallet is separate (features.wallet, one balance per currency).
 */
function paymentMethods(base: Common, state: AppConfigState, zoneId: string): ZonePaymentMethod[] {
  const contexts = base.categoryIds.flatMap((category) => (["ios", "android"] as const).map((platform) => ({ zoneId, category, platform })));
  const on = PAYMENT_METHODS.filter((method) => contexts.some((context) => paymentPolicy(state.finance, context)[method])).map(zonePaymentMethodOf);
  return ZONE_PAYMENT_METHODS.filter((method) => base.settings.paymentMethods[method] && on.includes(method));
}

export function riderAppConfig(zoneId: string, state: AppConfigState) {
  const base = common(zoneId, state);
  return {
    ...header(zoneId, state, base),
    catalog: catalog(base),
    features: {
      scheduledRides: scheduledRides(base),
      wallet: switchOn(base, "rider", "wallet") && featureOn(base, "wallet", zoneId, "rider", state.now),
      pin: switchOn(base, "rider", "pin"),
      shareTrip: switchOn(base, "rider", "shareTrip"),
    },
    paymentMethods: paymentMethods(base, state, zoneId),
    wallet: { usedFirst: true },
    tips: amountOptions(base.settings.tips, base.currency),
    raiseSteps: amountOptions(base.settings.raiseSteps, base.currency),
    /** Owner Q10: set per country in Pricing › Tips & limits, in local money; null = no cap. */
    promoCap: base.settings.promoCap === null ? null : wire(base.settings.promoCap, base.currency),
    pickupFee: riderPickupFee(base),
    booking: { ...booking(base), bookingHorizonDays: state.reservations.currentPolicy.bookingHorizonDays },
    cancelFees: cancelFees(base),
    cancelCheck: { on: base.zone.riderCancel.on, closerPct: base.zone.riderCancel.closerPct },
    // v0.18.7 (G5 Q2): the same switch as the driver document (contract RiderAppConfig.waiting); the server copies the
    // driver zone's value when serving, so the rider's Terms can show the rule. Set in Dispatch › Waiting at pickup.
    waiting: { ...waiting(base), cancelAfterArrivedIsNoShow: base.zone.pickupWait.cancelAfterArrivedIsNoShow, ...waitingRules(base, state) },
    cancelReasons: base.country.cancelReasons.groups.rider.map((item) => ({ code: item.code, title: reasonText(item.title, state.riderLang) })),
    rideCheck: rideCheck(base, state),
    // v0.18.9 (G7): the server serves the driver document's routeChange to riders; the same value here.
    routeChange: routeChange(base),
    appUpdate: appUpdate(base, "rider"),
    /**
     * v0.18.6 (owner G4-E4): the zone's Dispatch rider raise limit (contract.json#configDocs.mustMatch). The server
     * writes the same value when Dispatch is published and when it serves GET /rider/config.
     */
    raisePrice: { maxFactor: base.zone.raisePrice.maxFactor },
    sourceRevisions: sourceRevisions(state),
  };
}

/* ---------- DriverAppConfig ---------- */

/**
 * One category's pickup pay for the driver app: tiered ranges (each km at its range's rate, minutes split by km share),
 * an optional maximum per ride, and the rider's fixed pickup fee (null when off). The driver app shows only the total.
 */
/** Radar zones drawn inside the zone, each with the rule it follows (a rule naming it wins over the rule for all). */
function radarZonesFor(zoneId: string, state: AppConfigState) {
  return radarZonesOf(state.dispatch, zoneId).map((zone) => {
    const rule = radarRuleFor(state.dispatch, zone.id, zone.country);
    return { id: zone.id, name: zone.name, ring: zone.ring.map(([lat, lng]) => ({ lat, lng })), rule: rule ? { id: rule.id, name: rule.name, seconds: rule.seconds, maxDrivers: rule.maxDrivers, repeat: rule.repeat } : null };
  });
}

/** RiderAppConfig.pickupFee (contract v0.5.0 §3.2): the rider's fixed pickup fee per category, live rides and reservations; null = off. */
function riderPickupFee(base: Common) {
  const fee = (own: { on: boolean; amount: number } | undefined) => (own?.on ? wire(own.amount, base.currency) : null);
  return {
    byCategory: Object.fromEntries(base.categoryIds.map((id) => {
      const rate = base.pricing.pickupPay.rates[id];
      return [id, { live: fee(rate?.riderFee.live), reservation: fee(rate?.riderFee.reservation) }];
    })),
  };
}

function pickupRate(rate: PickupRate | undefined, currency: CurrencyCode) {
  const fee = (own: { on: boolean; amount: number } | undefined) => (own?.on ? wire(own.amount, currency) : null);
  return {
    enabled: rate?.enabled ?? false,
    maxPerRide: rate && rate.maxPerRide !== null ? wire(rate.maxPerRide, currency) : null,
    ranges: (rate?.ranges ?? []).map((range) => ({ fromKm: range.fromKm, toKm: range.toKm, perKm: wire(range.krPerKm, currency), perMin: wire(range.krPerMinute, currency) })),
    riderFee: { live: fee(rate?.riderFee.live), reservation: fee(rate?.riderFee.reservation) },
  };
}

/**
 * The contract sample's top-level keys (one rate, free km, display), filled from the headline category so an app on
 * the older shape still reads something sensible: the first paid range's rate, a leading 0-rate range as free km.
 */
function pickupPay(base: Common) {
  const pay = base.pricing.pickupPay;
  const head = headlineCategory(base);
  const headRate = head ? pay.rates[head] : undefined;
  const ranges = headRate?.ranges ?? [];
  const paid = ranges.find((range) => range.krPerKm > 0 || range.krPerMinute > 0);
  const leadingFree = ranges[0] && ranges[0].krPerKm === 0 && ranges[0].krPerMinute === 0 && ranges[0].toKm !== null ? ranges[0].toKm : 0;
  const top = pickupRate(headRate, base.currency);
  return {
    perKm: wire(paid?.krPerKm ?? 0, base.currency),
    perMin: wire(paid?.krPerMinute ?? 0, base.currency),
    freeKm: leadingFree,
    freeMin: 0,
    ranges: top.ranges,
    maxPerRide: top.maxPerRide,
    display: "total" as const,
    offers: { ...pay.offers },
    byCategory: Object.fromEntries(base.categoryIds.map((id) => [id, pickupRate(pay.rates[id], base.currency)])),
  };
}

const codes = (list: readonly CancelReason[]) => list.map((item) => item.code);

/** Driver texts (Content › Driver texts) plus the cancel reason titles as "cancelReason.<code>" and ".subtitle", English where a language is empty. */
function driverTexts(base: Common, state: AppConfigState) {
  const own = driverAppTexts(state.driverTexts).byLanguage;
  const book = base.country.cancelReasons;
  const reasons = [book.noShow, ...(["driverBeforeTrip", "driverDuringTrip", "driverNextTrip", "scheduled"] as const).flatMap((group) => book.groups[group])];
  return {
    byLanguage: Object.fromEntries(LANGS.map(({ id: lang }) => [lang, {
      ...own[lang],
      ...Object.fromEntries(reasons.flatMap((item) => {
        const subtitle = reasonText(item.subtitle, lang);
        return [[`cancelReason.${item.code}`, reasonText(item.title, lang)], ...(subtitle ? [[`cancelReason.${item.code}.subtitle`, subtitle]] : [])];
      })),
    }])),
  };
}

/** Admin ride type ids → contract DriverAppConfig.reservations.rideTypes keys. */
export const RESERVATION_RIDE_TYPE_KEYS = { normal: "normal", airport: "airport", long: "longTrip", premium: "comfortPremium", event: "event" } as const satisfies Record<RideTypeId, string>;

/**
 * Contract v0.4.1 DriverAppConfig.reservations: the zone's Dispatch › Reservations timings for the driver app
 * (CONTRACT.md §6.1). v0.4.2: no leaveNow, Leave now always opens the trip. lateBackupAfterMin is the offline rule (offlineBackupAfterMin); lateEta is the running-late ETA watch.
 */
function driverReservations(zone: ZoneDispatch) {
  const resv = zone.reservation;
  return {
    on: resv.on,
    lateWarn: resv.lateWarn,
    offlineBackupAfterMin: resv.lateBackupAfterMin,
    homePopupAfterMin: resv.homePopupAfterMin,
    exclusiveBeforeMin: resv.exclusiveBeforeMin,
    radarBeforeMin: resv.radarBeforeMin,
    onDriverCancel: resv.onDriverCancel,
    hideClashing: resv.hideClashing,
    towardPickup: resv.towardPickup,
    towardPickupBeforeMin: resv.towardPickupBeforeMin,
    longTripKm: zone.longTripKm,
    driverLateCancelHours: resv.driverLateCancelHours,
    lateCancelLimit: resv.latePauseAfter,
    lateCancelPeriodDays: resv.latePeriodDays,
    pauseDays: resv.latePauseDays,
    assignAcceptSeconds: resv.assignAcceptSec,
    rideTypes: Object.fromEntries((Object.keys(RESERVATION_RIDE_TYPE_KEYS) as RideTypeId[]).map((id) => {
      const rule = resv.types[id];
      return [RESERVATION_RIDE_TYPE_KEYS[id], { onlineBeforeMin: rule.onlineBeforeMin, spareMin: rule.spareMin, reminderMin: [rule.remindFirstMin, rule.remindLastMin] }];
    })) as Record<(typeof RESERVATION_RIDE_TYPE_KEYS)[RideTypeId], { onlineBeforeMin: number; spareMin: number; reminderMin: number[] }>,
    lateEta: { on: resv.lateEta.on, toleranceMin: resv.lateEta.toleranceMin, checkEverySeconds: resv.lateEta.checkEverySeconds, reassignTo: resv.lateEta.reassignTo },
  };
}

export function driverAppConfig(zoneId: string, state: AppConfigState) {
  const base = common(zoneId, state);
  const { zone, country } = base;
  const wait = waiting(base);
  // Q43: the waiting fee is all the driver's; Q44: the no-show fee share is a country rule in Dispatch.
  const share = { driverSharePct: country.noShowDriverSharePct, driverShareWaitPct: CONFIG_DEFAULTS.waitingDriverSharePct };
  return {
    ...header(zoneId, state, base),
    catalog: catalog(base),
    features: {
      scheduledRides: scheduledRides(base),
      performance: ["showRating", "showAcceptance", "showCancellation"].some((id) => switchOn(base, "driver", id)),
      showRating: switchOn(base, "driver", "showRating"),
      showAcceptance: switchOn(base, "driver", "showAcceptance"),
      showCancellation: switchOn(base, "driver", "showCancellation"),
    },
    paymentMethods: paymentMethods(base, state, zoneId),
    booking: booking(base),
    offers: {
      radarSeconds: zone.radar.seconds,
      exclusiveSeconds: zone.exclusive.seconds,
      radarOn: zone.radar.on,
      exclusiveOn: zone.exclusive.on,
      assignAcceptSeconds: zone.reservation.assignAcceptSec,
      offerCard: { ...zone.offerCard },
      // v0.18.6 (owner G4-E7): no exclusiveReasons any more (deprecated and ignored, contract.json#driverOffers.whyYouRemoved).
      autoOffline: { on: zone.autoOffline.on, missedExclusive: zone.autoOffline.after, noFixMinutes: zone.autoOffline.noFixMinutes, hiddenComesBackMin: zone.hiddenComesBackMin },
      radarApp: { ...zone.radarApp },
      exclusiveWhileDriving: { ...zone.exclusiveWhileDriving },
      // Radar zones drawn inside this zone and the rules that apply to them (Radar · Exclusive · Reservations). Additive keys.
      radarZones: radarZonesFor(zoneId, state),
    },
    pickupPay: pickupPay(base),
    driverBonus: driverBonus(base),
    cancelFees: driverCancelFees(base),
    waiting: {
      freeWaitMin: wait.freeWaitMin, perMin: wait.perMin, noShowAfterMin: wait.noShowAfterMin, noShowFee: wait.noShowFee, ...share,
      // v0.18.7 (G5 Q2): the server copies it into the rider document when serving GET /rider/config.
      cancelAfterArrivedIsNoShow: zone.pickupWait.cancelAfterArrivedIsNoShow,
      byCategory: wait.byCategory,
      ...waitingRules(base, state),
    },
    // v0.18.8 (G6, contract.json#arrivedWaiting.pin): Dispatch › Safety "Rider PIN before Start", per zone, default off.
    pickupPin: { required: zone.pickupPin.required, maxAttempts: zone.pickupPin.maxAttempts, lockMinutes: zone.pickupPin.lockMinutes },
    destinationMode: { perDay: zone.destinationMode.perDay, ...destinationModeForDriverApp(zone.destinationMode) },
    nextTrips: { on: true, ...nextTripsForDriverApp(zone.nextTrips) },
    reservations: driverReservations(zone),
    cancelReasons: {
      driverBeforeTrip: codes(country.cancelReasons.groups.driverBeforeTrip),
      driverDuringTrip: codes(country.cancelReasons.groups.driverDuringTrip),
      driverNextTrip: codes(country.cancelReasons.groups.driverNextTrip),
      scheduled: codes(country.cancelReasons.groups.scheduled),
      noShow: [country.cancelReasons.noShow.code],
    },
    drivingLimits: { maxHoursPerDay: country.rest.workHours, restMinutes: country.rest.restHours * 60, on: country.rest.on, warnFirstMin: country.rest.warnFirstMin, warnLastMin: country.rest.warnLastMin, blockOnline: country.rest.blockOnline },
    rideCheck: rideCheck(base, state),
    routeChange: routeChange(base),
    texts: driverTexts(base, state),
    notices: driverAppNotices(state.driverNotices, base.info.id),
    appUpdate: appUpdate(base, "driver"),
    sourceRevisions: sourceRevisions(state),
  };
}

export type RiderAppConfig = ReturnType<typeof riderAppConfig>;
export type DriverAppConfig = ReturnType<typeof driverAppConfig>;

/** "movera-rider-app-config-Z001-v12.json" */
export function appConfigFileName(app: AppId, doc: { zoneId: string; version: number }): string {
  return `movera-${app}-app-config-${doc.zoneId}-v${doc.version}.json`;
}
