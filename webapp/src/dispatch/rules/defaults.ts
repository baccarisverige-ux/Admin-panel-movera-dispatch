import { MARKETS, zoneById, type MarketId, type MarketZone } from "../../markets/markets.ts";
import contract from "../../../../contracts/contract.json" with { type: "json" };
import { fromSek } from "../../pricing/zonePricing.ts";
import { CONFIG_DEFAULTS } from "../../config/zoneDefaults.ts";
import { RAISE_MAX_FACTOR_DEFAULT } from "../offerRules.ts";
import { cancelFeeDefaults, completeCancelFees, legacyCancelFees } from "../cancelFees.ts";
import { CANCEL_RATE_LIMIT_DEFAULT, cancelReasonsDefault, completeCancelReasons, completeExclusiveReasons, completeOfferCard, completePickupWait, exclusiveReasonsDefault, offerCardDefault, pickupWaitDefault } from "../offers.ts";
import { completeDestinationMode, completeNextTrips, destinationModeDefault, nextTripsDefault } from "../tripRules.ts";
import { EARLY_END_DEFAULT, completeEarlyEnd, EXTRAS, type RideTypeId, type LateEtaReassignTo, type RideTypeRule, RESERVATION_LIST_TO, HOME_POPUP_TO, RIDE_TYPES, RAISE_CAP_SEK, RESERVATION_CANCEL_TO, LATE_ETA_REASSIGN_TO, type LateEtaRules, BOOKING_WINDOW_DEFAULT, completeBookingWindow, type ReservationRules, type WaitStep, type RideCheckRules, RIDE_CHECK_LIMITS, rideCheckDefault, type ZoneDispatch, type CountryDispatch, type DispatchEvent, type DriverGroup, type Preset, type DispatchBook } from "./model.ts";

/** Dispatch rules, part: Defaults, presets and filling older saves (was rules.ts lines 588–956). rules.ts re-exports everything; import from "../rules.ts" as before. */
/** v0.18.39 §63: the contract defaults of the far reach and "No driver nearby" (one source). */
const NO_DRIVER_NEARBY = (contract as unknown as { noDriverNearby: { defaults: { noDriverNearby: { on: boolean; afterSec: number; message: string }; farReachKm: number } } }).noDriverNearby.defaults;

export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function waitingDefault(): WaitStep[] {
  return [
    { id: "w1", kind: "raise_price", on: true, afterMin: 1, message: "Drivers are busy. Raise your price to be picked up faster." },
    { id: "w2", kind: "upgrade", on: true, afterMin: 2, message: "A Priority or Comfort car can come sooner. Upgrade?" },
    { id: "w3", kind: "alert_admin", on: true, afterMin: 3, message: "We are looking for a driver for you." },
    { id: "w4", kind: "keep_waiting", on: true, afterMin: 5, message: "Still searching. Keep waiting?", extraMin: 3 },
    { id: "w5", kind: "busy", on: true, afterMin: 8, message: "It is very busy right now. Please try again in a few minutes." },
  ];
}

function rideTypesDefault(): Record<RideTypeId, RideTypeRule> {
  return {
    // v0.18.17 (owner Q5 2026-11-03): online 60 min before a normal ride (the zone may set 30), first reminder 2 h before; owner M6-a: no second reminder by default (0 = off).
    normal: { onlineBeforeMin: 60, spareMin: 15, remindFirstMin: 120, remindLastMin: 0 },
    airport: { onlineBeforeMin: 60, spareMin: 15, remindFirstMin: 120, remindLastMin: 0 },
    long: { onlineBeforeMin: 60, spareMin: 15, remindFirstMin: 120, remindLastMin: 0 },
    premium: { onlineBeforeMin: 45, spareMin: 15, remindFirstMin: 120, remindLastMin: 0 },
    event: { onlineBeforeMin: 45, spareMin: 15, remindFirstMin: 120, remindLastMin: 0 },
  };
}

export function defaultZone(zone: Pick<MarketZone, "id" | "kind">): ZoneDispatch {
  const airport = zone.kind === "airport";
  return {
    zoneId: zone.id,
    radar: { on: true, drivers: airport ? 8 : 5, seconds: 15, then: "widen_then_exclusive" },
    exclusive: { on: true, seconds: 15, drivers: 3, then: "widen_then_radar" },
    radarApp: { fullOn: true, full: 8, fullLockWhileDriving: true, popupOn: true, popup: 2, popupSplitByDriving: false, popupWhileDriving: 1 },
    // Owner decision 35 (2026-10-26, contract v0.5.6): offline after 10 missed or declined Exclusive offers in a row
    // (contract.json#configDefaults; Q46 had 3).
    // G3-R1 (2026-10-30, contract v0.18.4): offline after 5 min with no position (0 = never), independent of the switch.
    autoOffline: { on: true, after: 10, noFixMinutes: CONFIG_DEFAULTS.noFixMinutesBeforeOffline },
    offerCard: offerCardDefault(),
    exclusiveReasons: exclusiveReasonsDefault(),
    raisePrice: { maxFactor: RAISE_MAX_FACTOR_DEFAULT },
    hiddenComesBackMin: 2,
    exclusiveWhileDriving: { on: true, count: 1 },
    // v0.18.33 (fix job 5, owner Q7, contract.json#configDefaults.dispatch.zone.bookedNext): on, 60 min.
    bookedNext: { on: true, withinMin: 60 },
    pickupWait: pickupWaitDefault(),
    reservation: {
      on: true, searchBeforeMin: 30, assignEarly: true, assignHoursBefore: 12, backup: true,
      listTo: "all", listMinRating: 4.5, listGroupSize: 10, listHomeKm: 5, listNearKm: 5, listAreaTrips: 5,
      listOpenAll: true, listOpenAllAfterMin: 30,
      homePopup: true, homePopupAfterMin: 10,
      toExclusive: true, exclusiveBeforeMin: 20, toRadar: true, radarBeforeMin: 15,
      onDriverCancel: "byTime",
      listGroupId: "", homePopupTo: "list", popupClosedExclusive: true,
      hideClashing: true, lateWarn: true, lateBackupAfterMin: 5, towardPickup: true, towardPickupBeforeMin: 60,
      lateEta: { on: true, toleranceMin: 3, checkEverySeconds: 60, reassignTo: "exclusive" },
      booking: { ...BOOKING_WINDOW_DEFAULT },
      types: rideTypesDefault(),
      riderFees: cancelFeeDefaults("reservation"), driverLateCancelHours: 1,
      latePause: true, latePauseAfter: 2, latePeriodDays: 7, latePauseDays: 7,
      showDriverOnAccept: true,
      raiseFare: true, raiseMax: RAISE_CAP_SEK,
      assignAcceptSec: 30,
    },
    choose: { how: "auto", radarAbove: 1.5, main: "exclusive", backup: "radar", times: [{ id: "t1", on: false, from: "22:00", to: "04:00", mode: "radar" }] },
    rulesFrom: "driver",
    start: { mode: "auto", nearKm: 2 },
    // v0.18.39 §63 (contract.json#noDriverNearby.defaults): far reach 12 km; "No driver nearby" on, after 300 s.
    limits: { maxPickupKm: 0, maxPickupEtaMin: 0, farReachKm: NO_DRIVER_NEARBY.farReachKm },
    noDriverNearby: { ...NO_DRIVER_NEARBY.noDriverNearby },
    neighbours: { on: false, zoneIds: [], afterStep: 0 },
    factors: [
      { id: "eta", on: true, weight: 40 },
      { id: "rating", on: true, weight: 15 },
      { id: "acceptance", on: true, weight: 15 },
      { id: "cancel", on: true, weight: 10 },
      { id: "idle", on: true, weight: 10 },
      { id: "finishing", on: true, weight: 5 },
      { id: "favourite", on: true, weight: 5 },
    ],
    radius: { steps: airport ? [3, 6, 10] : [3, 5, 8], maxWaitMin: 10 },
    batching: { on: false, seconds: 3, fromRatio: 2 },
    finishing: { radar: false, exclusive: true, withinMin: 3, withinKm: 1.5 },
    favourite: { on: true, maxKm: 4, waitSec: 15 },
    waiting: waitingDefault(),
    driverCancel: { on: true, commissionCutPct: 5 },
    riderCancel: { on: true, closerPct: 25, priority: true, priorityMin: 10, fees: cancelFeeDefaults("live"), driverSharePct: 100, earlyEnd: { ...EARLY_END_DEFAULT } },
    extras: EXTRAS.map((extra) => ({ id: extra.id, on: true, badge: true })),
    longTripKm: 50,
    // Owner Q39: 3 stops at most by default (contract.json#configDefaults.maxStops).
    // v0.18.9 (owner G7 decision 4): no free minutes at a middle stop by default (contract configDefaults.stopFreeWaitMin 0).
    stops: { on: true, max: CONFIG_DEFAULTS.maxStops, freeWaitMin: 0, perMin: 0, perStop: 0, changeDuring: true, driverCanRefuse: true, answerSeconds: 60, beforePickup: true, fixedPriceTrips: "block" },
    pickupMove: { maxMeters: CONFIG_DEFAULTS.maxPickupMoveMeters },
    samePoint: { warnMeters: CONFIG_DEFAULTS.samePointWarnMeters },
    airport: { on: airport, order: "fifo", maxQueueMin: 120, queueAreas: [] },
    goingHome: { on: true, perDay: 2, maxOffDeg: 45 },
    destinationMode: destinationModeDefault(),
    nextTrips: nextTripsDefault(),
    fairness: { idleBoost: true, idlePoints: 10, hourCap: false, hourRides: 4, skipPause: true, skips: 3, pauseMin: 5 },
    decline: { on: true, countsAcceptance: true, pauseAfter: 3, pauseMin: 5, longTripFree: true, farPickupFree: true, farPickupKm: 5 },
    safety: { minRating: true, ratingBelow: 4.3, maxCancel: true, doNotMatch: true, womenOnly: true },
    pickupPin: { ...CONFIG_DEFAULTS.pickupPin },
    rideCheck: rideCheckDefault(),
    alerts: [
      { id: "long_wait", on: true, limit: 5, panel: true, email: false, sms: false },
      { id: "few_drivers", on: true, limit: 2, panel: true, email: false, sms: false },
      { id: "no_driver", on: true, limit: 5, panel: true, email: true, sms: false },
    ],
  };
}

/** Money defaults per country, in major units, for the fees the rider pays. fee is the one cancel fee older saves started from. */
export function feeDefaults(country: MarketId): { fee: number; perMin: number; perStop: number } {
  if (country === "FR") return { fee: 5, perMin: 0.5, perStop: 1 };
  if (country === "TN") return { fee: 3, perMin: 0.3, perStop: 1 };
  return { fee: 50, perMin: 5, perStop: 10 };
}

export function zoneDefault(zoneId: string): ZoneDispatch {
  const zone = zoneById(zoneId);
  const base = defaultZone({ id: zoneId, kind: zone?.kind ?? "operating" });
  const country = countryOfZone(zoneId);
  const money = feeDefaults(country);
  return {
    ...base,
    riderCancel: { ...base.riderCancel, fees: cancelFeeDefaults("live", country) },
    stops: { ...base.stops, perMin: money.perMin, perStop: money.perStop },
    reservation: { ...base.reservation, riderFees: cancelFeeDefaults("reservation", country), raiseMax: raiseCap(country) },
    pickupWait: pickupWaitDefault(country),
  };
}

/** The highest fare raise in a country: 500 kr in Sweden, the same value in local money elsewhere. */
export function raiseCap(country: MarketId): number {
  return fromSek(RAISE_CAP_SEK, country);
}

export function countryOfZone(zoneId: string): MarketId {
  return MARKETS.find((item) => item.zones.some((entry) => entry.id === zoneId))?.id ?? "SE";
}

export function countryDefault(country: MarketId): CountryDispatch {
  return { country, rest: { on: true, workHours: 12, restHours: 6, warnFirstMin: 30, warnLastMin: 10, blockOnline: true }, cancelRateLimitPct: CANCEL_RATE_LIMIT_DEFAULT, cancelReasons: cancelReasonsDefault(), noShowDriverSharePct: CONFIG_DEFAULTS.noShowDriverSharePct };
}

/** Country rules from an older save: new settings come from the defaults. */
export function completeCountry(country: MarketId, stored: Partial<CountryDispatch> | undefined): CountryDispatch {
  const base = countryDefault(country);
  if (!stored || typeof stored !== "object") return base;
  return {
    ...base,
    ...stored,
    country,
    rest: { ...base.rest, ...(stored.rest ?? {}) },
    cancelRateLimitPct: typeof stored.cancelRateLimitPct === "number" ? stored.cancelRateLimitPct : base.cancelRateLimitPct,
    cancelReasons: completeCancelReasons(stored.cancelReasons),
    noShowDriverSharePct: typeof stored.noShowDriverSharePct === "number" && Number.isFinite(stored.noShowDriverSharePct) ? stored.noShowDriverSharePct : base.noShowDriverSharePct,
  };
}

function presetValues(change: (zone: ZoneDispatch) => void): Omit<ZoneDispatch, "zoneId"> {
  const zone = defaultZone({ id: "preset", kind: "operating" });
  change(zone);
  const { zoneId: _drop, ...values } = zone;
  void _drop;
  return values;
}

export const BUILT_IN_PRESETS: Preset[] = [
  { id: "busy", name: "Busy city", note: "Radar first, more drivers see each request, smart waiting on.", builtIn: true, values: presetValues((zone) => {
    zone.choose = { ...zone.choose, how: "manual", main: "radar" };
    zone.radar = { ...zone.radar, drivers: 8, seconds: 12 };
    zone.batching = { on: true, seconds: 3, fromRatio: 1.5 };
  }) },
  { id: "calm", name: "Calm suburb", note: "Exclusive first, wider search, longer time to accept.", builtIn: true, values: presetValues((zone) => {
    zone.choose = { ...zone.choose, how: "manual", main: "exclusive" };
    zone.exclusive = { ...zone.exclusive, seconds: 20, drivers: 4 };
    zone.radius = { steps: [4, 7, 12], maxWaitMin: 12 };
  }) },
  { id: "airport", name: "Airport", note: "Queue order (first in, first out), Radar as backup.", builtIn: true, values: presetValues((zone) => {
    zone.airport = { on: true, order: "fifo", maxQueueMin: 120, queueAreas: [] };
    zone.radar = { ...zone.radar, drivers: 10 };
    zone.radius = { steps: [3, 6, 10], maxWaitMin: 10 };
  }) },
  { id: "night", name: "Night", note: "Radar with a wider area, safety checks stricter.", builtIn: true, values: presetValues((zone) => {
    zone.choose = { ...zone.choose, how: "manual", main: "radar" };
    zone.radius = { steps: [4, 8, 12], maxWaitMin: 12 };
    zone.safety = { ...zone.safety, ratingBelow: 4.5 };
  }) },
];

export function emptyDispatchBook(): DispatchBook {
  return { draftRev: 1, draft: {}, live: {}, countries: {}, liveCountries: {}, events: seedEvents(), groups: seedGroups(), presets: [], control: {}, approvals: [], versions: [], cancelChecks: {}, liveActions: [], radarZones: [], radarZoneRules: [] };
}

function seedEvents(): DispatchEvent[] {
  return [{
    id: "EV-arena",
    country: "SE",
    name: "Concert at Friends Arena",
    ring: [[59.3745, 17.9955], [59.3745, 18.0035], [59.3695, 18.0035], [59.3695, 17.9955]],
    from: "2026-10-24T21:30",
    until: "2026-10-24T23:59",
    on: true,
    mode: "radar",
    radarDrivers: 12,
    pickupNote: "Pickup at the north gate, lane P2.",
    driverMessage: "Concert ends at 22:30. Wait at the north gate, lane P2.",
  }];
}

function seedGroups(): DriverGroup[] {
  return [
    { id: "G-airport", country: "SE", name: "Airport drivers", driverIds: [] },
    { id: "G-comfort", country: "SE", name: "Comfort drivers", driverIds: [] },
  ];
}

export function normalizeDispatchBook(value: unknown): DispatchBook {
  const base = emptyDispatchBook();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<DispatchBook>;
  return {
    draftRev: typeof raw.draftRev === "number" && raw.draftRev > 0 ? raw.draftRev : 1,
    draft: raw.draft && typeof raw.draft === "object" ? raw.draft : {},
    live: raw.live && typeof raw.live === "object" ? raw.live : {},
    countries: raw.countries ?? {},
    liveCountries: raw.liveCountries ?? {},
    events: Array.isArray(raw.events) ? raw.events : base.events,
    groups: Array.isArray(raw.groups) ? raw.groups : base.groups,
    presets: Array.isArray(raw.presets) ? raw.presets : [],
    control: raw.control ?? {},
    approvals: Array.isArray(raw.approvals) ? raw.approvals : [],
    versions: Array.isArray(raw.versions) ? raw.versions : [],
    cancelChecks: raw.cancelChecks ?? {},
    liveActions: Array.isArray(raw.liveActions) ? raw.liveActions : [],
    radarZones: Array.isArray(raw.radarZones) ? raw.radarZones : [],
    radarZoneRules: Array.isArray(raw.radarZoneRules) ? raw.radarZoneRules : [],
  };
}

/**
 * Reservation settings from an older save: new settings come from the defaults, unknown choices fall back.
 * Saves from before the Radar step get a Radar time that fits under their own Exclusive and search times, so they stay valid.
 */
export function completeReservation(base: ReservationRules, stored: unknown, legacyFee = 0): ReservationRules {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...base };
  const raw = stored as Partial<ReservationRules> & { freeCancelMinutesBeforePickup?: unknown; lateCancelFee?: unknown };
  const next = { ...base, ...raw } as ReservationRules & { freeCancelMinutesBeforePickup?: unknown; lateCancelFee?: unknown };
  // Saves from before cancel fees per car type had one free time and one late cancel fee: every car type gets them.
  next.riderFees = completeCancelFees(raw.riderFees, raw.riderFees === undefined && (raw.freeCancelMinutesBeforePickup !== undefined || raw.lateCancelFee !== undefined)
    ? legacyCancelFees(typeof raw.freeCancelMinutesBeforePickup === "number" ? raw.freeCancelMinutesBeforePickup : 60, typeof raw.lateCancelFee === "number" ? raw.lateCancelFee : legacyFee)
    : base.riderFees);
  delete next.freeCancelMinutesBeforePickup;
  delete next.lateCancelFee;
  // Owner decision 1: the Leave now switch is gone; Leave now always opens the trip.
  delete (next as { leaveNow?: unknown }).leaveNow;
  if (!RESERVATION_LIST_TO.some((item) => item.id === next.listTo)) next.listTo = base.listTo;
  if (!RESERVATION_CANCEL_TO.some((item) => item.id === next.onDriverCancel)) next.onDriverCancel = base.onDriverCancel;
  if (!HOME_POPUP_TO.some((item) => item.id === next.homePopupTo)) next.homePopupTo = base.homePopupTo;
  if (typeof next.listGroupId !== "string") next.listGroupId = base.listGroupId;
  // Running late came later: an older save gets the defaults, a broken part falls back on its own.
  const lateEta = raw.lateEta && typeof raw.lateEta === "object" && !Array.isArray(raw.lateEta) ? raw.lateEta as Partial<LateEtaRules> : {};
  next.lateEta = {
    on: typeof lateEta.on === "boolean" ? lateEta.on : base.lateEta.on,
    toleranceMin: typeof lateEta.toleranceMin === "number" && Number.isFinite(lateEta.toleranceMin) ? lateEta.toleranceMin : base.lateEta.toleranceMin,
    checkEverySeconds: typeof lateEta.checkEverySeconds === "number" && Number.isFinite(lateEta.checkEverySeconds) ? lateEta.checkEverySeconds : base.lateEta.checkEverySeconds,
    reassignTo: LATE_ETA_REASSIGN_TO.some((item) => item.id === lateEta.reassignTo) ? lateEta.reassignTo as LateEtaReassignTo : base.lateEta.reassignTo,
  };
  // v0.18.17: an older save has no booking policy yet: the owner's defaults.
  next.booking = completeBookingWindow(raw.booking);
  // Every kind of ride gets its own times; kinds or times missing from an older save come from the defaults.
  const storedTypes = raw.types && typeof raw.types === "object" && !Array.isArray(raw.types) ? raw.types as Partial<Record<RideTypeId, Partial<RideTypeRule>>> : {};
  next.types = Object.fromEntries(RIDE_TYPES.map((type) => {
    const own = storedTypes[type.id];
    return [type.id, { ...base.types[type.id], ...(own && typeof own === "object" && !Array.isArray(own) ? own : {}) }];
  })) as Record<RideTypeId, RideTypeRule>;
  if (raw.radarBeforeMin === undefined) {
    const limit = next.toExclusive ? Math.min(next.exclusiveBeforeMin, next.searchBeforeMin) : next.searchBeforeMin;
    if (next.radarBeforeMin >= limit) {
      const fit = Math.floor(limit / 2);
      if (fit >= 1) next.radarBeforeMin = fit;
      else if (raw.toRadar === undefined) next.toRadar = false;
    }
  }
  return next;
}

/** Ride check settings from an older save: missing or broken values come from the defaults. */
export function completeRideCheck(base: RideCheckRules, stored: unknown): RideCheckRules {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { ...base };
  const raw = stored as Record<string, unknown>;
  const next = { ...base } as Record<string, boolean | number>;
  for (const [key, fallback] of Object.entries(base)) {
    const value = raw[key];
    if (typeof fallback === "boolean" && typeof value === "boolean") next[key] = value;
    if (typeof fallback === "number" && typeof value === "number" && Number.isFinite(value)) next[key] = value;
  }
  return next as RideCheckRules;
}

/** Only triggers that are on are checked. */
export function rideCheckIssues(check: RideCheckRules): string[] {
  const issues: string[] = [];
  const out = (value: number, limit: { min: number; max: number }) => !Number.isFinite(value) || value < limit.min || value > limit.max;
  if (check.routeOn && out(check.routeKm, RIDE_CHECK_LIMITS.routeKm)) issues.push(`Ride check: off the route must be ${RIDE_CHECK_LIMITS.routeKm.min} to ${RIDE_CHECK_LIMITS.routeKm.max} km.`);
  if (check.longerOn && out(check.longerPct, RIDE_CHECK_LIMITS.longerPct)) issues.push(`Ride check: longer than expected must be ${RIDE_CHECK_LIMITS.longerPct.min} to ${RIDE_CHECK_LIMITS.longerPct.max}%.`);
  if (check.on) {
    if (out(check.stopMinutes, RIDE_CHECK_LIMITS.stopMinutes)) issues.push(`Ride check: long stop must be ${RIDE_CHECK_LIMITS.stopMinutes.min} to ${RIDE_CHECK_LIMITS.stopMinutes.max} min.`);
    if (out(check.endFarMeters, RIDE_CHECK_LIMITS.endFarMeters)) issues.push(`Ride check: ended far from the drop-off must be ${RIDE_CHECK_LIMITS.endFarMeters.min} to ${RIDE_CHECK_LIMITS.endFarMeters.max} m.`);
    if (out(check.noAnswerSeconds, RIDE_CHECK_LIMITS.noAnswerSeconds)) issues.push(`Ride check: time to answer must be ${RIDE_CHECK_LIMITS.noAnswerSeconds.min} to ${RIDE_CHECK_LIMITS.noAnswerSeconds.max} s.`);
    if (out(check.repeatMinutes, RIDE_CHECK_LIMITS.repeatMinutes)) issues.push(`Ride check: ask again after must be ${RIDE_CHECK_LIMITS.repeatMinutes.min} to ${RIDE_CHECK_LIMITS.repeatMinutes.max} min.`);
  }
  return issues;
}

/** Fill anything missing (older saves, new settings) from the zone's defaults. */
export function complete(zoneId: string, stored: Partial<ZoneDispatch> | undefined): ZoneDispatch {
  const base = zoneDefault(zoneId);
  if (!stored) return base;
  const merged = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(stored)) {
    const fallback = (base as Record<string, unknown>)[key];
    merged[key] = value && typeof value === "object" && !Array.isArray(value) && fallback && typeof fallback === "object" && !Array.isArray(fallback) ? { ...fallback, ...value } : value;
  }
  // Round 3 offer rules. Q18: offers while driving a rider are Exclusive only; older saves had "Radar offers while driving".
  const oldApp = (stored.radarApp ?? {}) as Record<string, unknown>;
  const radarApp = { ...(merged.radarApp as Record<string, unknown>) };
  delete radarApp.drivingOn;
  delete radarApp.driving;
  merged.radarApp = radarApp;
  if (!stored.exclusiveWhileDriving && (typeof oldApp.drivingOn === "boolean" || typeof oldApp.driving === "number")) {
    merged.exclusiveWhileDriving = { on: typeof oldApp.drivingOn === "boolean" ? oldApp.drivingOn : base.exclusiveWhileDriving.on, count: Math.min(5, Math.max(1, typeof oldApp.driving === "number" ? oldApp.driving : base.exclusiveWhileDriving.count)) };
  }
  merged.finishing = { ...(merged.finishing as ZoneDispatch["finishing"]), radar: false };
  // One cancel rate number: the country's cancel rate limit. Older saves had their own "Highest cancel rate" here.
  const safety = { ...(merged.safety as Record<string, unknown>) };
  delete safety.cancelAbove;
  merged.safety = safety;
  merged.offerCard = completeOfferCard(stored.offerCard);
  merged.exclusiveReasons = completeExclusiveReasons(stored.exclusiveReasons);
  merged.pickupWait = completePickupWait(base.pickupWait, stored.pickupWait);
  const legacyFee = feeDefaults(countryOfZone(zoneId)).fee;
  merged.reservation = completeReservation(base.reservation, stored.reservation, legacyFee);
  // Live cancel fees per car type. Older saves had one free time (freeMin) and one fixed fee for every car type.
  const oldCancel = (stored.riderCancel ?? {}) as Record<string, unknown>;
  const riderCancel = { ...(merged.riderCancel as Record<string, unknown>) };
  delete riderCancel.freeMin;
  delete riderCancel.fee;
  riderCancel.fees = completeCancelFees(oldCancel.fees, oldCancel.fees === undefined && (oldCancel.freeMin !== undefined || oldCancel.fee !== undefined)
    ? legacyCancelFees(typeof oldCancel.freeMin === "number" ? oldCancel.freeMin : 2, typeof oldCancel.fee === "number" ? oldCancel.fee : legacyFee)
    : base.riderCancel.fees);
  const share = oldCancel.driverSharePct;
  riderCancel.driverSharePct = typeof share === "number" && share >= 0 && share <= 100 ? share : 100;
  riderCancel.earlyEnd = completeEarlyEnd(oldCancel.earlyEnd);
  merged.riderCancel = riderCancel;
  merged.rideCheck = completeRideCheck(base.rideCheck, stored.rideCheck);
  merged.destinationMode = completeDestinationMode(stored.destinationMode);
  merged.nextTrips = completeNextTrips(stored.nextTrips);
  return { ...(merged as ZoneDispatch), zoneId };
}

export function liveRules(book: DispatchBook, zoneId: string): ZoneDispatch {
  return complete(zoneId, book.live[zoneId]);
}

export function draftRules(book: DispatchBook, zoneId: string): ZoneDispatch {
  return complete(zoneId, book.draft[zoneId] ?? book.live[zoneId]);
}

export function liveCountry(book: DispatchBook, country: MarketId): CountryDispatch {
  return completeCountry(country, book.liveCountries[country]);
}

export function draftCountry(book: DispatchBook, country: MarketId): CountryDispatch {
  return completeCountry(country, book.countries[country] ?? book.liveCountries[country]);
}

