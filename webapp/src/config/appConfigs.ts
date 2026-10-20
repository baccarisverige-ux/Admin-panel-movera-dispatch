import { marketOfZone, type MarketId } from "../markets/markets.ts";
import { fromMajor, type CurrencyCode, type Money } from "../domain/money.ts";
import { activeCategories, normalizeStore, zoneBook, type PricingStore } from "../pricing/zonePricing.ts";
import type { PickupRate } from "../pricing/pickupPay.ts";
import { liveCountry, liveRules, normalizeDispatchBook, type DispatchBook } from "../dispatch/rules.ts";
import { feeRow, type CancelFeeKind, type CancelFeeRow, type CancelFeeTable } from "../dispatch/cancelFees.ts";
import { exclusiveReasonList, LANGS, reasonText, type CancelReason, type LangId, type WaitOverride } from "../dispatch/offers.ts";
import { destinationModeForDriverApp, nextTripsForDriverApp } from "../dispatch/tripRules.ts";
import { advanceConfigClock, effectiveValue, normalizeConfig, type AppId, type AppUpdate, type ConfigBook } from "./book.ts";
import { normalizeFinanceBook, paymentPolicy, type FinanceBook } from "../payments/finance.ts";
import { PAYMENT_METHODS, type PaymentMethod } from "../payments/book.ts";
import { normalizeReservationBook, type ReservationBook } from "../reservations/book.ts";
import { driverAppTexts, normalizeDriverTextBook, type DriverTextBook } from "../content/driverTexts.ts";
import { driverAppNotices, normalizeDriverNoticeBook, type DriverNoticeBook } from "../messages/driverNotices.ts";
import { normalizeRideCheckSettings, type RideCheckSettings } from "../safety/rideCheckSettings.ts";
import { seedZones } from "../zones/releases.ts";
import { APP_LANGUAGES, CONFIG_DEFAULTS, countryDefaults, ZONE_PAYMENT_METHODS, zonePaymentMethodOf, type ZonePaymentMethod } from "./zoneDefaults.ts";

/**
 * The two per-zone config documents of contracts/CONTRACT.md §6, RiderAppConfig and DriverAppConfig, built from the
 * live (published) admin state. Money is { amountMinor, currency } in the currency's ISO 4217 exponent (SEK/EUR 2,
 * TND 3); cancel fees are FeeRule per Pricing category id. Pure functions: same state in, same document out.
 * The legacy dispatch rules file (dispatch/rules.ts rulesFile) is separate and unchanged.
 *
 * Keys beyond the contract sample are additive ("unknown keys are ignored"): pickupPay.byCategory,
 * cancelCheck, sourceRevisions, and a few on/off switches next to the numbers they gate.
 *
 * Contract v0.4.0 per-zone fields (country, languages, tips, raiseSteps, promoCap, wallet, booking.maxPickupMoveMeters,
 * driverBonus, waiting.byCategory) come from the admin settings where one exists, else from CONFIG_DEFAULTS (zoneDefaults.ts).
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
  return { info, currency, zone, country, pricing, categories, categoryIds, config };
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

/** Owner Q48/Q49: en / fr / sv in every app; the country's default for the rider, driver and admin apps (no admin setting yet). */
function languages(base: Common) {
  const lang = countryDefaults(base.info.id).defaultLanguage;
  return { available: [...APP_LANGUAGES], default: { rider: lang, driver: lang, admin: lang } };
}

/** Tips and raise-offer steps of the country (owner Q5/Q6), all on: no admin setting yet. */
function amountOptions(amounts: readonly Money[]) {
  return amounts.map((amount) => ({ amount: { ...amount }, enabled: true }));
}

function driverBonus(base: Common) {
  const limits = countryDefaults(base.info.id).driverBonus;
  return { defaultLimit: { ...limits.defaultLimit }, hardMax: { ...limits.hardMax } };
}

function booking(base: Common) {
  return { maxStops: base.zone.stops.on ? base.zone.stops.max : 0, maxPickupMoveMeters: CONFIG_DEFAULTS.maxPickupMoveMeters };
}

function catalog(base: Common) {
  return { categories: base.categories.map((category, index) => ({ id: category.id, label: category.label, seats: category.seats, sort: index + 1, line: category.line })) };
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
  const top = head ? waitingFor(base, head) : { freeWaitMin: 0, perMin: wire(0, base.currency), noShowAfterMin: base.zone.pickupWait.noShowAfterMin, noShowFee: wire(0, base.currency) };
  return { ...top, byCategory: Object.fromEntries(base.categoryIds.map((id) => [id, waitingFor(base, id)])) };
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

function rideCheck(base: Common, state: AppConfigState) {
  const rules = base.zone.rideCheck;
  return {
    stopMinutes: state.rideCheck.longStopMinutes,
    offRouteKm: rules.routeKm,
    finishFarFromDropoffKm: state.rideCheck.finishFarFromDropoffKm,
    farOn: rules.farOn, stopOn: rules.stopOn, routeOn: rules.routeOn, longerOn: rules.longerOn, longerPct: rules.longerPct, crashOn: rules.crashOn,
  };
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

/** Config switches that gate a payment method; methods without one are only gated by Finance. */
const METHOD_SWITCH: Partial<Record<PaymentMethod, string>> = { cash: "cash", apple: "applePay", google: "googlePay" };

/**
 * Contract v0.4 (owner Q7): the zone's methods are a subset of cash, card, apple_pay, google_pay, in that order. A method
 * is offered when Finance has it on for at least one of the zone's categories on one platform, and its config switch is on.
 * Finance-only ids without a contract method (swish, klarna, paypal) are never exported; the wallet is separate (features.wallet).
 */
function paymentMethods(base: Common, state: AppConfigState, zoneId: string): ZonePaymentMethod[] {
  const contexts = base.categoryIds.flatMap((category) => (["ios", "android"] as const).map((platform) => ({ zoneId, category, platform })));
  const on = PAYMENT_METHODS.filter((method) => {
    const gate = METHOD_SWITCH[method] ? switchOn(base, "rider", METHOD_SWITCH[method]!) : true;
    return gate && contexts.some((context) => paymentPolicy(state.finance, context)[method]);
  }).map(zonePaymentMethodOf);
  return ZONE_PAYMENT_METHODS.filter((method) => on.includes(method));
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
    tips: amountOptions(countryDefaults(base.info.id).tips),
    raiseSteps: amountOptions(countryDefaults(base.info.id).raiseSteps),
    /** Owner Q10: set by admin per country; no setting yet, so no cap. */
    promoCap: null,
    booking: { ...booking(base), bookingHorizonDays: state.reservations.currentPolicy.bookingHorizonDays },
    cancelFees: cancelFees(base),
    cancelCheck: { on: base.zone.riderCancel.on, closerPct: base.zone.riderCancel.closerPct },
    waiting: waiting(base),
    cancelReasons: base.country.cancelReasons.groups.rider.map((item) => ({ code: item.code, title: reasonText(item.title, state.riderLang) })),
    rideCheck: rideCheck(base, state),
    appUpdate: appUpdate(base, "rider"),
    sourceRevisions: sourceRevisions(state),
  };
}

/* ---------- DriverAppConfig ---------- */

function pickupRate(rate: PickupRate | undefined, currency: CurrencyCode) {
  const own = rate ?? { enabled: false, perKm: 0, perMin: 0, freeKmOn: false, freeKm: 0, freeMinOn: false, freeMin: 0 };
  return {
    enabled: own.enabled,
    perKm: wire(own.perKm, currency),
    perMin: wire(own.perMin, currency),
    freeKm: own.freeKmOn ? own.freeKm : 0,
    freeMin: own.freeMinOn ? own.freeMin : 0,
    ranges: (own.ranges ?? []).map((range) => ({ fromKm: range.fromKm, toKm: range.toKm, perKm: wire(range.krPerKm, currency), perMin: wire(range.krPerMinute, currency) })),
  };
}

function pickupPay(base: Common) {
  const pay = base.pricing.pickupPay;
  const head = headlineCategory(base);
  const { enabled: _enabled, ...top } = pickupRate(head ? pay.rates[head] : undefined, base.currency);
  void _enabled;
  return { ...top, display: pay.display, offers: { ...pay.offers }, byCategory: Object.fromEntries(base.categoryIds.map((id) => [id, pickupRate(pay.rates[id], base.currency)])) };
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

export function driverAppConfig(zoneId: string, state: AppConfigState) {
  const base = common(zoneId, state);
  const { zone, country, currency } = base;
  const wait = waiting(base);
  const share = { driverSharePct: zone.pickupWait.driverShareNoShowPct, driverShareWaitPct: zone.pickupWait.driverShareWaitPct };
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
      exclusiveReasons: exclusiveReasonList(zone.exclusiveReasons),
      autoOffline: { on: zone.autoOffline.on, missedExclusive: zone.autoOffline.after, hiddenComesBackMin: zone.hiddenComesBackMin },
      radarApp: { ...zone.radarApp },
      exclusiveWhileDriving: { ...zone.exclusiveWhileDriving },
    },
    pickupPay: pickupPay(base),
    driverBonus: driverBonus(base),
    cancelFees: cancelFees(base),
    waiting: {
      freeWaitMin: wait.freeWaitMin, perMin: wait.perMin, noShowAfterMin: wait.noShowAfterMin, noShowFee: wait.noShowFee, ...share,
      byCategory: wait.byCategory,
      farPickup: { on: zone.pickupWait.farPickupOn, km: zone.pickupWait.farPickupKm, ...waitOverride(zone.pickupWait.farPickup, currency) },
      rideTypes: {
        scheduled: { on: zone.pickupWait.rideTypes.scheduled.on, ...waitOverride({ ...zone.pickupWait.rideTypes.scheduled, freeWaitMin: state.reservations.currentPolicy.includedWaitingMinutes }, currency) },
        airport: { on: zone.pickupWait.rideTypes.airport.on, ...waitOverride(zone.pickupWait.rideTypes.airport, currency) },
        event: { on: zone.pickupWait.rideTypes.event.on, ...waitOverride(zone.pickupWait.rideTypes.event, currency) },
      },
    },
    destinationMode: { perDay: zone.destinationMode.perDay, ...destinationModeForDriverApp(zone.destinationMode) },
    nextTrips: { on: true, ...nextTripsForDriverApp(zone.nextTrips) },
    cancelReasons: {
      driverBeforeTrip: codes(country.cancelReasons.groups.driverBeforeTrip),
      driverDuringTrip: codes(country.cancelReasons.groups.driverDuringTrip),
      driverNextTrip: codes(country.cancelReasons.groups.driverNextTrip),
      scheduled: codes(country.cancelReasons.groups.scheduled),
      noShow: [country.cancelReasons.noShow.code],
    },
    drivingLimits: { maxHoursPerDay: country.rest.workHours, restMinutes: country.rest.restHours * 60, on: country.rest.on, warnFirstMin: country.rest.warnFirstMin, warnLastMin: country.rest.warnLastMin, blockOnline: country.rest.blockOnline },
    rideCheck: rideCheck(base, state),
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
