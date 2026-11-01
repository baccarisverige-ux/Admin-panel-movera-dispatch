import { market, MARKETS, zoneById, type MarketId, type MarketZone } from "../markets/markets.ts";
import { currencySymbol, fromSek } from "../pricing/zonePricing.ts";
import { CONFIG_DEFAULTS } from "../config/zoneDefaults.ts";
import { PICKUP_MOVE_RANGE, RAISE_MAX_FACTOR_DEFAULT, validRaiseFactor } from "./offerRules.ts";
import { rulesOfDispatch } from "../live/configDocs.ts";
import {
  DEFAULT_FEE_CATEGORIES, RESERVATION_FREE_MAX_MIN, cancelFeeAmount, cancelFeeDefaults, cancelFeeIssues, completeCancelFees, feeRow, legacyCancelFees,
  type CancelFeeKind, type CancelFeeTable, type CancelFeeType, type FeeCategory,
} from "./cancelFees.ts";
import { RIDE_CHECK_SETTINGS_DEFAULT, rideCheckThresholds, type RideCheckThresholds } from "../safety/rideCheckSettings.ts";
import {
  CANCEL_RATE_LIMIT_DEFAULT, EXCLUSIVE_REASONS as EXCLUSIVE_REASON_LIST, LANGS as LANG_LIST, WAIT_FIELDS as WAIT_FIELD_LIST, cancelReasonsFor, cancelReasonIssues, cancelReasonLines, cancelReasonsDefault, completeCancelReasons, completeExclusiveReasons, completeOfferCard,
  completePickupWait, exclusiveReasonIssues, exclusiveReasonsDefault, offerCardDefault, pickupWaitDefault, pickupWaitIssues,
  type CancelReasonBook, type ExclusiveReason, type ExclusiveReasonId, type OfferCardDetails, type PickupWait,
} from "./offers.ts";
import {
  TRIP_RULE_LABELS, completeDestinationMode, completeNextTrips, destinationModeDefault, destinationModeForDriverApp, destinationModeIssues, nextTripsDefault, nextTripsForDriverApp, nextTripsIssues,
  type DestinationModeRules, type NextTripRules,
} from "./tripRules.ts";
import { tr, trx } from "../i18n/core.ts";

/** Dispatch rules: how a ride request finds its driver. One set per zone, plus country rules, events and driver groups. */

/** v0.18.10 (G8 Q2, contract.json#finish.earlyEnd.settings): defaults and ranges. */
export type EarlyEnd = { repriceOverKm: number; repriceOverMin: number };
export const EARLY_END_DEFAULT: EarlyEnd = { repriceOverKm: 2, repriceOverMin: 8 };
export const EARLY_END_LIMITS = { repriceOverKm: { min: 0, max: 50 }, repriceOverMin: { min: 0, max: 120 } } as const;
export function completeEarlyEnd(stored: unknown): EarlyEnd {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const pick = (key: keyof EarlyEnd) => {
    const v = raw[key];
    return typeof v === "number" && Number.isFinite(v) && v >= EARLY_END_LIMITS[key].min && v <= EARLY_END_LIMITS[key].max ? v : EARLY_END_DEFAULT[key];
  };
  return { repriceOverKm: pick("repriceOverKm"), repriceOverMin: pick("repriceOverMin") };
}

export const DISPATCH_KEY = "dispatchRules";

export type OfferMode = "radar" | "exclusive";
export type FactorId = "eta" | "rating" | "acceptance" | "cancel" | "idle" | "finishing" | "favourite";
export type ExtraId = "child_seat" | "pet" | "wheelchair" | "luggage" | "long_trip";
export type WaitKind = "raise_price" | "upgrade" | "alert_admin" | "keep_waiting" | "busy";
export type AlertId = "long_wait" | "few_drivers" | "no_driver";
export type TabId = "modes" | "radar" | "exclusive" | "reservations" | "best" | "waiting" | "rides" | "drivers" | "destination" | "safety" | "alerts";

/** The Dispatch rules tabs. Radar, Exclusive and reservation rules live in their own section (OFFER_TABS). */
export const TABS: { id: TabId; label: string }[] = [
  { id: "modes", label: "Modes" },
  { id: "best", label: "Best driver" },
  { id: "waiting", label: "Rider waiting" },
  { id: "rides", label: "Rides & stops" },
  { id: "drivers", label: "Drivers" },
  { id: "destination", label: "Destination & next trips" },
  { id: "safety", label: "Safety" },
  { id: "alerts", label: "Alerts" },
];

/** Radar · Exclusive · Reservations: every offer rule in one section, three tabs. */
export const OFFER_TABS: { id: TabId; label: string }[] = [
  { id: "radar", label: "Radar" },
  { id: "exclusive", label: "Exclusive" },
  { id: "reservations", label: "Reservations" },
];

export const FACTORS: { id: FactorId; label: string; help: string }[] = [
  { id: "eta", label: "Time to pickup", help: "Closer by driving time scores higher." },
  { id: "rating", label: "Rating", help: "Higher driver rating scores higher." },
  { id: "acceptance", label: "Acceptance rate", help: "Drivers who accept more often score higher. Only Exclusive and other one-driver offers count, never Radar." },
  { id: "cancel", label: "Cancel rate", help: "Drivers who cancel less score higher." },
  { id: "idle", label: "Waiting without a ride", help: "Drivers who waited longer score higher." },
  { id: "finishing", label: "Finishing a ride nearby", help: "A driver ending a ride close to the pickup can take it next." },
  { id: "favourite", label: "Rider's favourite", help: "The rider marked this driver as a favourite." },
];

export const EXTRAS: { id: ExtraId; label: string; badge: string }[] = [
  { id: "child_seat", label: "Child seat", badge: "Child seat" },
  { id: "pet", label: "Pet", badge: "Pet" },
  { id: "wheelchair", label: "Wheelchair access", badge: "Wheelchair" },
  { id: "luggage", label: "Extra luggage", badge: "Luggage" },
  { id: "long_trip", label: "Long trip", badge: "Long trip" },
];

export const WAIT_KINDS: { id: WaitKind; label: string; help: string }[] = [
  { id: "raise_price", label: "Suggest a higher price", help: "Opens the raise-price screen the rider app already has." },
  { id: "upgrade", label: "Suggest an upgrade", help: "Offer Priority or Comfort while still searching." },
  { id: "alert_admin", label: "Alert the admin", help: "The ride shows in Live with an alert, so an admin can pick a driver." },
  { id: "keep_waiting", label: "Ask to keep waiting", help: "The rider can wait more minutes or stop." },
  { id: "busy", label: "Busy, try later", help: "The search stops and the rider sees this message." },
];

export const ALERTS: { id: AlertId; label: string; unit: string; help: string }[] = [
  { id: "long_wait", label: "A rider waits too long", unit: "min", help: "Alert when a rider has waited this many minutes." },
  { id: "few_drivers", label: "Few free drivers", unit: "drivers", help: "Alert when free drivers in the zone drop to this number or less." },
  { id: "no_driver", label: "Many requests without a driver", unit: "requests", help: "Alert when this many requests are waiting without a driver." },
];

/** Who gets a new reservation in the driver app's Scheduled rides list. */
export type ReservationListTo = "all" | "category" | "rating" | "random" | "homeNear" | "nearNow" | "favourites" | "areaRegulars" | "group";
/** Who sees the Home popup: the same drivers as the Scheduled rides list, or every online driver in the zone. */
export type HomePopupTo = "list" | "zone";
/** Kinds of scheduled ride, each with its own times before pickup. */
export type RideTypeId = "normal" | "airport" | "long" | "premium" | "event";
export type RideTypeRule = { onlineBeforeMin: number; spareMin: number; remindFirstMin: number; remindLastMin: number };
/** Where a reservation goes back to when the driver who took it cancels. */
export type ReservationCancelTo = "byTime" | "list" | "home" | "exclusive";
/** Running late (contract DriverAppConfig.reservations.lateEta.reassignTo): where the ride goes when the driver would arrive too late. */
export type LateEtaReassignTo = "exclusive" | "radar" | "dispatch";
/** The steps an untaken reservation goes through, in this order. */
export type ReservationStep = "list" | "home" | "exclusive" | "radar";

export const RESERVATION_LIST_TO: { id: ReservationListTo; label: string; help: string }[] = [
  { id: "all", label: "All drivers", help: "Every driver in the zone sees it in Scheduled rides." },
  { id: "category", label: "Drivers of the category", help: "Only drivers who drive the ride's category, for example Comfort." },
  { id: "rating", label: "High rating only", help: "Only drivers with at least the rating you set." },
  { id: "random", label: "Random group", help: "A random group of drivers in the zone, as many as you set. A new group is picked for each reservation." },
  { id: "homeNear", label: "Home near pickup", help: "Drivers whose home address is near the pickup, within the distance you set. Good for early-morning rides." },
  { id: "nearNow", label: "Near pickup now", help: "Drivers who are near the pickup when the rider books, within the distance you set." },
  { id: "favourites", label: "Rider's favourites", help: "Drivers this rider marked as favourite or rated 5 stars before." },
  { id: "areaRegulars", label: "Often in the area", help: "Drivers who did at least the number of trips you set from the pickup area in the last 30 days." },
  { id: "group", label: "A driver group", help: "Only the drivers in one saved group. Groups are made in Events & groups." },
];

export const HOME_POPUP_TO: { id: HomePopupTo; label: string; help: string }[] = [
  { id: "list", label: "Same drivers as the list", help: "Only the drivers who can see it in Scheduled rides." },
  { id: "zone", label: "All drivers in the zone", help: "Every online driver in the zone, even outside the list's group." },
];

export const RIDE_TYPES: { id: RideTypeId; label: string; help: string }[] = [
  { id: "normal", label: "Normal", help: "Every scheduled ride that is none of the kinds below." },
  { id: "airport", label: "Airport", help: "Pickup or drop-off at an airport." },
  { id: "long", label: "Long trip", help: "Trips longer than the long-trip distance." },
  { id: "premium", label: "Comfort and Premium", help: "Rides in Comfort or Premium." },
  { id: "event", label: "Events", help: "Pickup in an event area while the event runs." },
];

/** Highest fare raise for a ride nobody takes, in Sweden. Other countries get the same value in their own money. */
export const RAISE_CAP_SEK = 500;
/** Q40: the pickup move limit after accept can be set up to this many metres (v0.18.7: the contract's range, 2000). */
export const PICKUP_MOVE_MAX_METERS = PICKUP_MOVE_RANGE[1];
/** Longest free-cancel window the rider app accepts: one week. */
export const RIDER_FREE_CANCEL_MAX_MIN = RESERVATION_FREE_MAX_MIN;

/** One car type's late cancel rule for the rider app. feeMinor for a fixed fee, feePct (with optional min/max) for a % of the price. */
export type RiderCancelFeeRule = { freeCancelMinutesBeforePickup: number; feeType: CancelFeeType; feeMinor: number | null; feePct: number | null; minFeeMinor: number | null; maxFeeMinor: number | null };

/**
 * The rider app's scheduled-ride rules, as GET /api/v1/rider/scheduled-rides/rules answers them.
 * byCategory has the rule per car type. The top-level free time and fee are the Economy row, for older rider apps (a % fee gives its lowest fee, or 0).
 */
export type RiderScheduledRules = { freeCancelMinutesBeforePickup: number; lateCancelFeeMinor: number; currency: string; showDriverOnAccept: boolean; byCategory: Record<string, RiderCancelFeeRule> };

/** categories: the car types Pricing lists; each one is in byCategory, with the Economy row for a car type without its own. */
export function riderScheduledRules(resv: Pick<ReservationRules, "riderFees" | "showDriverOnAccept">, country: MarketId, categories: readonly FeeCategory[] = DEFAULT_FEE_CATEGORIES): RiderScheduledRules {
  const info = market(country);
  const minor = (value: number | null) => (value === null ? null : Math.round(value * info.minorUnits));
  const economy = feeRow(resv.riderFees, "economy");
  return {
    freeCancelMinutesBeforePickup: economy.freeMin,
    lateCancelFeeMinor: minor(economy.type === "fixed" ? economy.value : economy.min ?? 0) ?? 0,
    currency: info.currency,
    showDriverOnAccept: resv.showDriverOnAccept,
    byCategory: Object.fromEntries(categories.map(({ id }) => {
      const row = feeRow(resv.riderFees, id);
      const fixed = row.type === "fixed";
      return [id, { freeCancelMinutesBeforePickup: row.freeMin, feeType: row.type, feeMinor: fixed ? minor(row.value) : null, feePct: fixed ? null : row.value, minFeeMinor: fixed ? null : minor(row.min), maxFeeMinor: fixed ? null : minor(row.max) }];
    })),
  };
}

export const RESERVATION_CANCEL_TO: { id: ReservationCancelTo; label: string; help: string }[] = [
  { id: "byTime", label: "By time left", help: "The step the time before pickup says, as if nobody had taken it." },
  { id: "list", label: "Scheduled rides", help: "Back to the list. The Home popup waits its minutes again, counted from the cancel." },
  { id: "home", label: "Home popup", help: "Shows as the Home popup at once, and in the list." },
  { id: "exclusive", label: "Exclusive", help: "Offered as Exclusive at once." },
];

export const LATE_ETA_REASSIGN_TO: { id: LateEtaReassignTo; label: string; help: string }[] = [
  { id: "exclusive", label: "Exclusive offer to nearest driver", help: "The nearest available driver gets it as an Exclusive offer." },
  { id: "radar", label: "Radar", help: "It goes to Radar trips for drivers nearby." },
  { id: "dispatch", label: "Back to dispatch", help: "It comes back to Live for an admin to give it to a driver." },
];

/** Running late: from Leave now until arrival the driver's arrival time is checked; too late and the ride goes to another driver early. */
export type LateEtaRules = {
  on: boolean;
  /** Reassign when now + the driver's ETA is later than pickup + this many minutes. 0 to 30. */
  toleranceMin: number;
  /** How often the arrival time is checked. 15 to 600 seconds. */
  checkEverySeconds: number;
  reassignTo: LateEtaReassignTo;
};

export const RESERVATION_STEP_LABEL: Record<ReservationStep, string> = { list: "Scheduled rides", home: "Home popup", exclusive: "Exclusive", radar: "Radar trips" };

export type ReservationRules = {
  on: boolean;
  searchBeforeMin: number;
  assignEarly: boolean;
  assignHoursBefore: number;
  backup: boolean;
  /** L1: who sees a new reservation in Scheduled rides; with "rating", only drivers rated at least listMinRating. */
  listTo: ReservationListTo;
  listMinRating: number;
  /** With "random": how many drivers get it. With "homeNear" / "nearNow": how close to the pickup. With "areaRegulars": trips from the area in 30 days. */
  listGroupSize: number;
  listHomeKm: number;
  listNearKm: number;
  listAreaTrips: number;
  /** When the list goes to a smaller group: after this many minutes untaken it opens to every driver in the zone. */
  listOpenAll: boolean;
  listOpenAllAfterMin: number;
  /** L2: nobody took it yet, so it also pops up on Home this many minutes after the rider booked. */
  homePopup: boolean;
  homePopupAfterMin: number;
  /** L3: close to pickup it becomes Exclusive, then also comes into Radar trips (never labelled Exclusive there). */
  toExclusive: boolean;
  exclusiveBeforeMin: number;
  toRadar: boolean;
  radarBeforeMin: number;
  onDriverCancel: ReservationCancelTo;
  /** With "group": the saved driver group (Events & groups) that sees it in Scheduled rides. */
  listGroupId: string;
  homePopupTo: HomePopupTo;
  /** A driver closed the Home popup with ×: if nobody took it, it can come back to that driver as an Exclusive. */
  popupClosedExclusive: boolean;
  /**
   * Smart gap: the first ride's trip time + the drive to the next pickup + spare minutes must fit before the next pickup.
   * When a driver takes a ride, the rides that do not fit leave that driver's Scheduled rides list.
   */
  hideClashing: boolean;
  /**
   * Leave now (no switch, owner decision 1, contract v0.4.2): at the driver's estimated drive time to the pickup + spare minutes
   * the ride always lands on the driver's screen as the active trip. When it cannot start then: a warning on the island ("Head to
   * your 07:40 pickup").
   */
  lateWarn: boolean;
  /** Only an OFFLINE driver loses the ride, this many minutes after Leave now (contract offlineBackupAfterMin). An online driver keeps it. */
  lateBackupAfterMin: number;
  /** Running late: an online driver who would arrive more than toleranceMin late loses the ride early (contract lateEta). */
  lateEta: LateEtaRules;
  /** Before the ride, offers head toward the scheduled pickup (like destination mode), from this many minutes before. */
  towardPickup: boolean;
  towardPickupBeforeMin: number;
  /** Be online before, spare minutes and reminders, per kind of ride. */
  types: Record<RideTypeId, RideTypeRule>;
  /**
   * Cancels. Drivers never pay. Per car type, riders cancel for free until freeMin minutes before pickup, then pay the late
   * cancel fee: fixed (major units of the zone's money) or % of the price with an optional min and max. The same rules hold for
   * Exclusive reservations. The rider app reads these as GET /api/v1/rider/scheduled-rides/rules, see riderScheduledRules.
   */
  riderFees: CancelFeeTable;
  /** A driver cancel with less than this many hours to pickup is a late cancel. */
  driverLateCancelHours: number;
  /** latePauseAfter late cancels within latePeriodDays: no scheduled rides for latePauseDays. */
  latePause: boolean;
  latePauseAfter: number;
  latePeriodDays: number;
  latePauseDays: number;
  /** The rider sees the driver's name, photo and car as soon as a driver accepts, and sees a new driver if it changes. */
  showDriverOnAccept: boolean;
  /** Nobody took it near pickup: the admin can raise the driver's fare, paid from Movera's commission, up to raiseMax. */
  raiseFare: boolean;
  raiseMax: number;
  /** An admin gives the ride to a driver: it comes like an Exclusive, "Assigned by Movera", with this long to accept. */
  assignAcceptSec: number;
};

export type WaitStep = { id: string; kind: WaitKind; on: boolean; afterMin: number; message: string; extraMin?: number };
export type TimeRule = { id: string; on: boolean; from: string; to: string; mode: OfferMode };
export type Factor = { id: FactorId; on: boolean; weight: number };

/**
 * Ride check: when the driver and rider apps show "Is everything OK?". Each trigger can be off.
 * Off the route has two parts: km away from the route, or the trip that much longer than expected.
 * The far-from-drop-off km and the long-stop minutes are shared by every zone (safety/rideCheckSettings).
 */
export type RideCheckRules = {
  /**
   * v0.18.9 (G7, contract.json#onTrip.rideCheck): the server's own ride check, per zone (DriverAppConfig.rideCheck):
   * on, long stop minutes, off-route km (routeKm), unexpected end metres, seconds to answer before the safety team is
   * alerted, minutes before the same reason asks again, and whether a no-answer case rings.
   */
  on: boolean;
  stopMinutes: number;
  endFarMeters: number;
  noAnswerSeconds: number;
  repeatMinutes: number;
  noAnswerAlarm: boolean;
  farOn: boolean;
  stopOn: boolean;
  routeOn: boolean;
  routeKm: number;
  longerOn: boolean;
  longerPct: number;
  crashOn: boolean;
};

/** Lowest and highest value for each Ride check number, used by the fields and the checks. */
export const RIDE_CHECK_LIMITS = {
  routeKm: { min: 0.5, max: 20 },
  stopMinutes: { min: 1, max: 30 },
  endFarMeters: { min: 100, max: 5000 },
  noAnswerSeconds: { min: 30, max: 600 },
  repeatMinutes: { min: 1, max: 120 },
  longerPct: { min: 10, max: 300 },
} as const;

export function rideCheckDefault(): RideCheckRules {
  return { on: true, stopMinutes: 2, endFarMeters: 500, noAnswerSeconds: 120, repeatMinutes: 10, noAnswerAlarm: false, farOn: true, stopOn: true, routeOn: true, routeKm: 2, longerOn: true, longerPct: 50, crashOn: true };
}

export type ZoneDispatch = {
  /** Live test 2026-11-01: seconds the loaded document held as 0 or missing, set to the contract default on load (not published). */
  secondsDefaulted?: ("radar" | "exclusive")[];
  zoneId: string;
  radar: { on: boolean; drivers: number; seconds: number; then: "widen" | "exclusive" | "widen_then_exclusive" };
  exclusive: { on: boolean; seconds: number; drivers: number; then: "radar" | "widen" | "widen_then_radar" };
  /**
   * How many Radar offers a driver sees at once, one setting per screen. The full-screen list (full) and the offer cards
   * over the map (popup) are independent. fullLockWhileDriving: the list cannot be opened while the car is moving.
   * popupSplitByDriving: the cards have their own limit while driving (popupWhileDriving); off = one number all the time.
   * Never while driving a rider (Q18).
   */
  radarApp: { fullOn: boolean; full: number; fullLockWhileDriving: boolean; popupOn: boolean; popup: number; popupSplitByDriving: boolean; popupWhileDriving: number };
  /** After this many offers in a row not accepted, the driver goes offline. */
  autoOffline: { on: boolean; after: number; noFixMinutes: number };
  /** Q14: what the offer cards show in the driver app (Radar, Exclusive and the reservation popup). */
  offerCard: OfferCardDetails;
  /**
   * Q15: the short text that said why an offer is Exclusive. v0.18.6 (owner G4-E7 "Remove short line explain"): no
   * longer shown in the driver app, not sent to it and no editor in the panel (contract.json#driverOffers.whyYouRemoved).
   * Kept only so older saved books still read.
   */
  exclusiveReasons: Record<ExclusiveReasonId, ExclusiveReason>;
  /**
   * v0.18.6 (owner G4-E4 "2×, admin can change"): the rider may raise the fare to at most maxFactor × the booked fare
   * (DispatchDocument.raisePrice.maxFactor, contract range 1–3, default 2). The server copies it to the rider app.
   */
  raisePrice: { maxFactor: number };
  /** Q17: a trip hidden with × in the Live list can come back after this many minutes if it is still in Radar. */
  hiddenComesBackMin: number;
  /** Q18: while driving a rider only Exclusive offers come, at most `count` at a time. */
  exclusiveWhileDriving: { on: boolean; count: number };
  /** Q19/Q20: waiting at pickup. The free wait, price per minute and no-show fee per category come from Pricing. */
  pickupWait: PickupWait;
  reservation: ReservationRules;
  choose: { how: "auto" | "manual"; radarAbove: number; main: OfferMode; backup: OfferMode | "none"; times: TimeRule[] };
  rulesFrom: "driver" | "pickup";
  factors: Factor[];
  radius: { steps: number[]; maxWaitMin: number };
  batching: { on: boolean; seconds: number; fromRatio: number };
  finishing: { radar: boolean; exclusive: boolean; withinMin: number; withinKm: number };
  favourite: { on: boolean; maxKm: number; waitSec: number };
  waiting: WaitStep[];
  driverCancel: { on: boolean; commissionCutPct: number };
  /** Live trips (Radar and live Exclusive): the smart check, and per car type free minutes after accept, then the fee. */
  /** v0.8.0 (owner 2026-10-27): driverSharePct, the driver's share of the rider's cancel fee, per zone; default 100 %. */
  /** v0.18.10 (G8 Q2): earlyEnd = DriverAppConfig.cancelFees.earlyEnd — a driver's early end re-prices only when more than repriceOverKm km or repriceOverMin min shorter (default 2 / 8). */
  riderCancel: { on: boolean; closerPct: number; priority: boolean; priorityMin: number; fees: CancelFeeTable; driverSharePct: number; earlyEnd: EarlyEnd };
  extras: { id: ExtraId; on: boolean; badge: boolean }[];
  longTripKm: number;
  /**
   * v0.18.9 (G7): changeDuring / driverCanRefuse / answerSeconds / beforePickup / fixedPriceTrips are
   * DriverAppConfig.routeChange; max is booking.maxStops (server-checked); freeWaitMin is waiting.stopFreeWaitMin
   * (default 0: paid from minute 1); perMin is shown from Pricing (stopWaitPerMin), not set here.
   */
  stops: { on: boolean; max: number; freeWaitMin: number; perMin: number; perStop: number; changeDuring: boolean; driverCanRefuse: boolean; answerSeconds: number; beforePickup: boolean; fixedPriceTrips: "block" | "switch_to_normal" };
  /** Q40: after the driver accepts, the rider can move the pickup up to maxMeters; further means cancel and book again. The driver is told. */
  pickupMove: { maxMeters: number };
  airport: { on: boolean; order: "fifo" | "best"; maxQueueMin: number; queueAreas: { id: string; name: string; ring: [number, number][] }[] };
  goingHome: { on: boolean; perDay: number; maxOffDeg: number };
  /** R13-9: Destination mode, each part on or off with its own number. */
  destinationMode: DestinationModeRules;
  /** R13-18: when next-trip offers (Exclusive and Exclusive reservations only) start during a trip. */
  nextTrips: NextTripRules;
  fairness: { idleBoost: boolean; idlePoints: number; hourCap: boolean; hourRides: number; skipPause: boolean; skips: number; pauseMin: number };
  decline: { on: boolean; countsAcceptance: boolean; pauseAfter: number; pauseMin: number; longTripFree: boolean; farPickupFree: boolean; farPickupKm: number };
  /** maxCancel: drivers over the country's cancel rate limit (CountryDispatch.cancelRateLimitPct) get no requests in this zone. */
  safety: { minRating: boolean; ratingBelow: number; maxCancel: boolean; doNotMatch: boolean; womenOnly: boolean };
  /** v0.18.8 (G6): DriverAppConfig.pickupPin — the driver enters the rider's 4-digit code before Start (default off). */
  pickupPin: { required: boolean; maxAttempts: number; lockMinutes: number };
  rideCheck: RideCheckRules;
  alerts: { id: AlertId; on: boolean; limit: number; panel: boolean; email: boolean; sms: boolean }[];
};

export type CountryDispatch = {
  country: MarketId;
  /** Q25: warnings at warnFirstMin and warnLastMin before the limit; blockOnline: at the limit the driver can't go online. */
  rest: { on: boolean; workHours: number; restHours: number; warnFirstMin: number; warnLastMin: number; blockOnline: boolean };
  /** Q22: the cancel rate drivers should stay under. Never shown to drivers. */
  cancelRateLimitPct: number;
  /** Q21: cancel reasons in this country, per language. */
  cancelReasons: CancelReasonBook;
  /** Q44: the driver's share of the no-show fee, the same in every zone of the country. The waiting fee is always 100 % to the driver (Q43). */
  noShowDriverSharePct: number;
};

export type DispatchEvent = {
  id: string;
  country: MarketId;
  name: string;
  ring: [number, number][];
  from: string;
  until: string;
  on: boolean;
  mode: OfferMode;
  radarDrivers: number;
  pickupNote: string;
  driverMessage: string;
  /**
   * v0.18.6 (owner G4-F6, contract.json#dispatchTools.events): the exact point where the drivers' event icon stands
   * ([lat, lng]); `ring` is the optional area. `from` / `until` are local times of the country ("YYYY-MM-DDTHH:MM").
   */
  location?: [number, number] | null;
  /** G4-F6: what drivers read when they tap the icon, in sv / fr / en (pickup note optional). */
  details?: { title: EventText; description: EventText; pickupNote: EventText };
  /** The server's version (live), for the next change or delete. */
  version?: number;
};

export type EventText = { sv: string; fr: string; en: string };

/** A saved driver group (G4-F3: per country on the server; the server sends to its free members, nearest first, max 10). */
export type DriverGroup = { id: string; country: MarketId; name: string; driverIds: string[]; version?: number };
/**
 * A dispatch preset. G4-F2 (owner "Per country only"): saved ones are per country on the server; `doc` is the server's
 * values (a dispatch document's parts) and applying it only changes those parts of a zone.
 */
export type Preset = { id: string; name: string; note: string; builtIn: boolean; values: Omit<ZoneDispatch, "zoneId">; country?: MarketId; doc?: Record<string, unknown>; version?: number };

export type Control = { paused: boolean; mode: OfferMode | null; by: string; at: string };

export type Approval = {
  id: string;
  kind: "publish" | "control";
  zoneIds: string[];
  lines: string[];
  by: string;
  at: string;
  /** For publish: the zone rules to make live. For control: the live switch to apply. */
  zones?: Record<string, ZoneDispatch>;
  control?: { zoneId: string; value: Control };
};

export type Version = {
  rev: number;
  at: string;
  actorId: string;
  approvedBy?: string;
  note: string;
  zoneIds: string[];
  lines: string[];
  live: Record<string, ZoneDispatch>;
  liveCountries: Record<string, CountryDispatch>;
};

export type CancelDecision = { fee: boolean; by: string; reason: string; at: string };
export type LiveAction = { id: string; tripId: string; kind: "group" | "radar_group" | "radar_zone" | "exclusive" | "cancel"; target: string; by: string; at: string };

/**
 * A radar zone: an area drawn on the map inside a market zone. A radar sent to it goes to the free drivers inside it
 * at that moment. Radar zones are independent and may overlap; there is no nesting. Made in Radar · Exclusive · Reservations.
 */
export type RadarZone = {
  id: string;
  country: MarketId;
  /** The market zone it belongs to (where it is listed and offered). */
  zoneId: string;
  name: string;
  /** [lat, lng] ring, like a bonus area. */
  ring: [number, number][];
  createdAt: string;
  /** The server's version (live, G4-F4). */
  version?: number;
};

/** A radar rule for one or more radar zones; "all" is the default and a rule naming a zone wins over it. */
export type RadarZoneRule = {
  id: string;
  country: MarketId;
  name: string;
  /** "all" or the ids of the radar zones it applies to. */
  radarZoneIds: "all" | string[];
  /** Seconds the radar stays open. */
  seconds: number;
  /** Most drivers who can see the ride at once (1–10). */
  maxDrivers: number;
  /** Send again by itself when nobody accepts. */
  repeat: boolean;
  /** The server's version (live, G4-F4). */
  version?: number;
};

export type DispatchBook = {
  draftRev: number;
  draft: Record<string, ZoneDispatch>;
  live: Record<string, ZoneDispatch>;
  countries: Record<string, CountryDispatch>;
  liveCountries: Record<string, CountryDispatch>;
  events: DispatchEvent[];
  groups: DriverGroup[];
  presets: Preset[];
  control: Record<string, Control>;
  approvals: Approval[];
  versions: Version[];
  cancelChecks: Record<string, CancelDecision>;
  liveActions: LiveAction[];
  radarZones: RadarZone[];
  radarZoneRules: RadarZoneRule[];
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
    normal: { onlineBeforeMin: 30, spareMin: 15, remindFirstMin: 60, remindLastMin: 15 },
    airport: { onlineBeforeMin: 60, spareMin: 15, remindFirstMin: 60, remindLastMin: 15 },
    long: { onlineBeforeMin: 60, spareMin: 15, remindFirstMin: 60, remindLastMin: 15 },
    premium: { onlineBeforeMin: 45, spareMin: 15, remindFirstMin: 60, remindLastMin: 15 },
    event: { onlineBeforeMin: 45, spareMin: 15, remindFirstMin: 60, remindLastMin: 15 },
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
      types: rideTypesDefault(),
      riderFees: cancelFeeDefaults("reservation"), driverLateCancelHours: 1,
      latePause: true, latePauseAfter: 2, latePeriodDays: 7, latePauseDays: 7,
      showDriverOnAccept: true,
      raiseFare: true, raiseMax: RAISE_CAP_SEK,
      assignAcceptSec: 30,
    },
    choose: { how: "auto", radarAbove: 1.5, main: "exclusive", backup: "radar", times: [{ id: "t1", on: false, from: "22:00", to: "04:00", mode: "radar" }] },
    rulesFrom: "driver",
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

function countryOfZone(zoneId: string): MarketId {
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
    zone.choose = { ...zone.choose, how: "manual", main: "radar", backup: "exclusive" };
    zone.radar = { ...zone.radar, drivers: 8, seconds: 12 };
    zone.batching = { on: true, seconds: 3, fromRatio: 1.5 };
  }) },
  { id: "calm", name: "Calm suburb", note: "Exclusive first, wider search, longer time to accept.", builtIn: true, values: presetValues((zone) => {
    zone.choose = { ...zone.choose, how: "manual", main: "exclusive", backup: "radar" };
    zone.exclusive = { ...zone.exclusive, seconds: 20, drivers: 4 };
    zone.radius = { steps: [4, 7, 12], maxWaitMin: 12 };
  }) },
  { id: "airport", name: "Airport", note: "Queue order (first in, first out), Radar as backup.", builtIn: true, values: presetValues((zone) => {
    zone.airport = { on: true, order: "fifo", maxQueueMin: 120, queueAreas: [] };
    zone.radar = { ...zone.radar, drivers: 10 };
    zone.radius = { steps: [3, 6, 10], maxWaitMin: 10 };
  }) },
  { id: "night", name: "Night", note: "Radar with a wider area, safety checks stricter.", builtIn: true, values: presetValues((zone) => {
    zone.choose = { ...zone.choose, how: "manual", main: "radar", backup: "exclusive" };
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
function complete(zoneId: string, stored: Partial<ZoneDispatch> | undefined): ZoneDispatch {
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

/** Problems that stop a save. Empty means the rules are fine. */
/** categories: the car types Pricing lists for the zone; the cancel fee rows are checked for these. */
export function zoneIssues(zone: ZoneDispatch, categories: readonly FeeCategory[] = DEFAULT_FEE_CATEGORIES): string[] {
  const issues: string[] = [];
  if (!zone.radar.on && !zone.exclusive.on) issues.push("Switch on Radar or Exclusive, or both. A zone needs a way to offer rides.");
  if (zone.radar.on && (zone.radar.drivers < 1 || zone.radar.drivers > 30)) issues.push("Radar: drivers who see a request must be 1 to 30.");
  if (zone.radar.on && (zone.radar.seconds < 5 || zone.radar.seconds > 120)) issues.push("Radar: time on the radar must be 5 to 120 seconds.");
  if (zone.exclusive.on && (zone.exclusive.seconds < 5 || zone.exclusive.seconds > 60)) issues.push("Exclusive: time to accept must be 5 to 60 seconds.");
  if (zone.radar.on && zone.radarApp.fullOn && (zone.radarApp.full < 1 || zone.radarApp.full > 20)) issues.push("Radar in the driver app: full screen must show 1 to 20 offers.");
  if (zone.radar.on && zone.radarApp.popupOn && (zone.radarApp.popup < 1 || zone.radarApp.popup > 5)) issues.push("Radar in the driver app: the popup must show 1 to 5 offers.");
  if (zone.radar.on && !zone.radarApp.fullOn && !zone.radarApp.popupOn) issues.push("Radar in the driver app: switch on the full screen or the popup, or drivers cannot see Radar offers.");
  if (zone.radar.on && zone.radarApp.popupOn && zone.radarApp.popupSplitByDriving && (zone.radarApp.popupWhileDriving < 1 || zone.radarApp.popupWhileDriving > zone.radarApp.popup || !Number.isInteger(zone.radarApp.popupWhileDriving))) issues.push("Radar in the driver app: offer cards while driving must be 1 to the number shown while stopped.");
  if (!Number.isInteger(zone.autoOffline.noFixMinutes) || zone.autoOffline.noFixMinutes < 0 || zone.autoOffline.noFixMinutes > 120) issues.push("Set offline without position: must be 0 to 120 minutes (0 = never).");
  if (zone.autoOffline.on && (zone.autoOffline.after < 1 || zone.autoOffline.after > 99 || !Number.isInteger(zone.autoOffline.after))) issues.push("Go offline automatically: must be after 1 to 99 offers.");
  if (zone.exclusive.on && zone.exclusiveWhileDriving.on && (zone.exclusiveWhileDriving.count < 1 || zone.exclusiveWhileDriving.count > 5)) issues.push("Exclusive while driving: must be 1 to 5 offers at a time.");
  if (zone.radar.on && (zone.hiddenComesBackMin < 1 || zone.hiddenComesBackMin > 60)) issues.push("Radar in the driver app: a hidden trip can come back after 1 to 60 minutes.");
  // v0.18.6 (G4-E4): contract.json#dispatch.raisePrice.range; the server answers 400 invalid_document outside it.
  if (validRaiseFactor(zone.raisePrice.maxFactor) === null) issues.push("Rider raise limit: must be 1× to 3× the booked price.");
  issues.push(...exclusiveReasonIssues(zone.exclusiveReasons));
  issues.push(...pickupWaitIssues(zone.pickupWait, countryOfZone(zone.zoneId)));
  if (zone.exclusive.on && (zone.exclusive.drivers < 1 || zone.exclusive.drivers > 10)) issues.push("Exclusive: drivers to try must be 1 to 10.");
  if (zone.choose.how === "manual" && !zone[zone.choose.main].on) issues.push(`The main mode (${modeLabel(zone.choose.main)}) is off. Switch it on or pick the other mode.`);
  if (zone.choose.how === "manual" && zone.choose.backup !== "none" && zone.choose.backup === zone.choose.main) issues.push("The backup mode must be different from the main mode.");
  if (zone.choose.how === "auto" && (!zone.radar.on || !zone.exclusive.on)) issues.push("Automatic choice needs both Radar and Exclusive on. Switch both on or choose by hand.");
  if (zone.choose.how === "auto" && (zone.choose.radarAbove <= 0 || zone.choose.radarAbove > 10)) issues.push("Automatic choice: the busy level must be above 0 and at most 10.");
  for (const rule of zone.choose.times.filter((item) => item.on)) {
    if (!/^\d\d:\d\d$/.test(rule.from) || !/^\d\d:\d\d$/.test(rule.to) || rule.from === rule.to) issues.push("Each time rule needs a start and an end time that differ.");
    if (!zone[rule.mode].on) issues.push(`A time rule uses ${modeLabel(rule.mode)}, which is off.`);
  }
  const steps = zone.radius.steps;
  if (!steps.length || steps.some((km) => km <= 0 || km > 50)) issues.push("Search distance steps must be above 0 and at most 50 km.");
  if (steps.some((km, index) => index > 0 && km <= steps[index - 1])) issues.push("Each search distance step must be larger than the one before.");
  if (zone.radius.maxWaitMin < 1 || zone.radius.maxWaitMin > 30) issues.push("Longest search must be 1 to 30 minutes.");
  if (!zone.factors.some((item) => item.on && item.weight > 0)) issues.push("Best driver: switch on at least one thing that counts.");
  const waits = zone.waiting.filter((step) => step.on);
  if (waits.some((step) => step.afterMin < 0 || step.afterMin > 30)) issues.push("Rider waiting: each step must start between 0 and 30 minutes.");
  if (waits.some((step) => !step.message.trim())) issues.push("Rider waiting: each step that is on needs a message.");
  if (zone.reservation.on && (zone.reservation.searchBeforeMin < 5 || zone.reservation.searchBeforeMin > 240)) issues.push("Reservations: start looking 5 to 240 minutes before pickup.");
  if (zone.reservation.on && zone.reservation.toExclusive && zone.reservation.exclusiveBeforeMin >= zone.reservation.searchBeforeMin) issues.push("Reservations: the switch to Exclusive must come after the search starts (a smaller number of minutes).");
  issues.push(...reservationIssues(zone.reservation, zone.zoneId, categories));
  if (zone.driverCancel.on && (zone.driverCancel.commissionCutPct < 0 || zone.driverCancel.commissionCutPct > 30)) issues.push("Driver cancels: lower commission must be 0 to 30%.");
  if (zone.riderCancel.on && (zone.riderCancel.closerPct < 5 || zone.riderCancel.closerPct > 100)) issues.push("Rider cancels: \"came closer\" must be 5 to 100%.");
  if (zone.riderCancel.on) issues.push(...cancelFeeIssues(zone.riderCancel.fees, "live", categories));
  if (zone.stops.on && (zone.stops.max < 1 || zone.stops.max > 5)) issues.push("Stops: max stops must be 1 to 5.");
  if (!Number.isInteger(zone.stops.answerSeconds) || zone.stops.answerSeconds < 15 || zone.stops.answerSeconds > 300) issues.push("Route change: the driver's time to answer must be 15 to 300 s.");
  if (!Number.isInteger(zone.pickupMove.maxMeters) || zone.pickupMove.maxMeters < 0 || zone.pickupMove.maxMeters > PICKUP_MOVE_MAX_METERS) issues.push(`Pickup move after accept: 0 to ${PICKUP_MOVE_MAX_METERS} m, in whole metres.`);
  if (zone.longTripKm < 10 || zone.longTripKm > 500) issues.push("Long trip must be 10 to 500 km.");
  if (!Number.isInteger(zone.pickupPin.maxAttempts) || zone.pickupPin.maxAttempts < 1 || zone.pickupPin.maxAttempts > 10) issues.push("Rider PIN: wrong tries before lock must be 1 to 10.");
  if (!Number.isInteger(zone.pickupPin.lockMinutes) || zone.pickupPin.lockMinutes < 1 || zone.pickupPin.lockMinutes > 60) issues.push("Rider PIN: lock minutes must be 1 to 60.");
  if (zone.safety.minRating && (zone.safety.ratingBelow < 1 || zone.safety.ratingBelow > 5)) issues.push("Safety: lowest rating must be 1 to 5.");
  issues.push(...rideCheckIssues(zone.rideCheck));
  issues.push(...destinationModeIssues(zone.destinationMode), ...nextTripsIssues(zone.nextTrips));
  if (zone.alerts.some((alert) => alert.on && !alert.panel && !alert.email && !alert.sms)) issues.push("Alerts: each alert that is on needs a place to show (panel, email or SMS).");
  return issues;
}

/** The reservation steps must come in order: Scheduled rides → Home popup → Exclusive → Radar trips. */
function reservationIssues(resv: ReservationRules, zoneId: string, categories: readonly FeeCategory[]): string[] {
  if (!resv.on) return [];
  const issues: string[] = [];
  if (resv.listTo === "rating" && (resv.listMinRating < 1 || resv.listMinRating > 5)) issues.push("Reservations: the lowest rating for Scheduled rides must be 1 to 5.");
  if (resv.listTo === "random" && (resv.listGroupSize < 1 || resv.listGroupSize > 500)) issues.push("Reservations: the random group must be 1 to 500 drivers.");
  if (resv.listTo === "homeNear" && (resv.listHomeKm < 0.5 || resv.listHomeKm > 50)) issues.push("Reservations: home near pickup must be 0.5 to 50 km.");
  if (resv.listTo === "nearNow" && (resv.listNearKm < 0.5 || resv.listNearKm > 50)) issues.push("Reservations: near pickup now must be 0.5 to 50 km.");
  if (resv.listTo === "areaRegulars" && (resv.listAreaTrips < 1 || resv.listAreaTrips > 200)) issues.push("Reservations: trips from the area must be 1 to 200.");
  if (resv.listTo !== "all" && resv.listOpenAll && (resv.listOpenAllAfterMin < 1 || resv.listOpenAllAfterMin > 1440)) issues.push("Reservations: opening to all drivers must be 1 to 1440 minutes after booking.");
  if (resv.homePopup && (resv.homePopupAfterMin < 1 || resv.homePopupAfterMin > 1440)) issues.push("Reservations: the Home popup must start 1 to 1440 minutes (24 h) after the rider booked.");
  if (resv.toExclusive && (resv.exclusiveBeforeMin < 1 || resv.exclusiveBeforeMin > 180)) issues.push("Reservations: Exclusive must start 1 to 180 minutes before pickup.");
  if (resv.toRadar && (resv.radarBeforeMin < 1 || resv.radarBeforeMin > 180)) issues.push("Reservations: Radar trips must start 1 to 180 minutes before pickup.");
  if (resv.toRadar && resv.radarBeforeMin >= resv.searchBeforeMin) issues.push("Reservations: Radar trips must come after the search starts (a smaller number of minutes).");
  if (resv.toRadar && resv.toExclusive && resv.radarBeforeMin >= resv.exclusiveBeforeMin) issues.push("Reservations: Radar trips must come after Exclusive (a smaller number of minutes before pickup).");
  if (resv.onDriverCancel === "home" && !resv.homePopup) issues.push("Reservations: after a driver cancels it cannot go to the Home popup, because the Home popup is off.");
  if (resv.onDriverCancel === "exclusive" && !resv.toExclusive) issues.push("Reservations: after a driver cancels it cannot become Exclusive, because \"Becomes an Exclusive trip\" is off.");
  if (resv.listTo === "group" && !resv.listGroupId) issues.push("Reservations: pick the driver group that gets Scheduled rides.");
  if (resv.lateBackupAfterMin < 1 || resv.lateBackupAfterMin > 60) issues.push("Reservations: an offline driver must lose the ride 1 to 60 minutes after Leave now.");
  if (resv.lateEta.on && (!Number.isInteger(resv.lateEta.toleranceMin) || resv.lateEta.toleranceMin < 0 || resv.lateEta.toleranceMin > 30)) issues.push("Reservations: minutes late allowed must be 0 to 30.");
  if (resv.lateEta.on && (!Number.isInteger(resv.lateEta.checkEverySeconds) || resv.lateEta.checkEverySeconds < 15 || resv.lateEta.checkEverySeconds > 600)) issues.push("Reservations: the arrival time must be checked every 15 to 600 seconds.");
  if (resv.towardPickup && (resv.towardPickupBeforeMin < 15 || resv.towardPickupBeforeMin > 240)) issues.push("Reservations: trips toward the pickup must start 15 to 240 minutes before pickup.");
  for (const type of RIDE_TYPES) {
    const rule = resv.types[type.id];
    if (rule.onlineBeforeMin < 5 || rule.onlineBeforeMin > 240) issues.push(`Reservations, ${type.label}: be online before must be 5 to 240 minutes.`);
    if (rule.spareMin < 0 || rule.spareMin > 60) issues.push(`Reservations, ${type.label}: spare minutes must be 0 to 60.`);
    if (rule.remindFirstMin < 1 || rule.remindFirstMin > 1440 || rule.remindLastMin < 1 || rule.remindLastMin > 1440) issues.push(`Reservations, ${type.label}: reminders must be 1 to 1440 minutes before pickup.`);
    else if (rule.remindFirstMin <= rule.remindLastMin) issues.push(`Reservations, ${type.label}: the first reminder must come before the second (a larger number of minutes).`);
  }
  issues.push(...cancelFeeIssues(resv.riderFees, "reservation", categories));
  if (resv.driverLateCancelHours < 0.5 || resv.driverLateCancelHours > 72) issues.push("Reservations: a driver's late cancel must be set 0.5 to 72 hours before pickup.");
  if (resv.latePause && (resv.latePauseAfter < 1 || resv.latePauseAfter > 20)) issues.push("Reservations: the pause must come after 1 to 20 late cancels.");
  if (resv.latePause && (resv.latePeriodDays < 1 || resv.latePeriodDays > 90)) issues.push("Reservations: late cancels must be counted over 1 to 90 days.");
  if (resv.latePause && (resv.latePauseDays < 1 || resv.latePauseDays > 365)) issues.push("Reservations: scheduled rides can be paused for 1 to 365 days.");
  const country = countryOfZone(zoneId);
  const cap = raiseCap(country);
  if (resv.raiseFare && (resv.raiseMax <= 0 || resv.raiseMax > cap)) issues.push(`Reservations: the highest fare raise must be above 0 and at most ${cap} ${currencySymbol(country)}.`);
  if (resv.assignAcceptSec < 10 || resv.assignAcceptSec > 600) issues.push("Reservations: the time to accept a ride assigned by Movera must be 10 to 600 seconds.");
  return issues;
}

/** Smart gap in minutes: the first ride's trip time + the drive to the next pickup + spare minutes. */
export function smartGapMin(tripMin: number, driveMin: number, spareMin: number): number {
  return Math.max(0, tripMin) + Math.max(0, driveMin) + Math.max(0, spareMin);
}

/**
 * Two scheduled rides clash for one driver when the later pickup comes before the smart gap of the earlier one.
 * Times are minutes from any fixed start. Once a driver takes one, the clashing one leaves that driver's list.
 */
export function ridesClash(first: { pickupMin: number; tripMin: number }, second: { pickupMin: number; tripMin: number }, driveMin: number, spareMin: number): boolean {
  const [a, b] = first.pickupMin <= second.pickupMin ? [first, second] : [second, first];
  return a.pickupMin + smartGapMin(a.tripMin, driveMin, spareMin) > b.pickupMin;
}

/** Leave now: how many minutes before pickup the ride lands on the driver's screen as the active trip. */
export function leaveNowBeforeMin(driveMin: number, spareMin: number): number {
  return Math.max(0, Math.round(driveMin)) + Math.max(0, spareMin);
}

/** How a fare raise is paid: from Movera's commission first, and Movera pays anything beyond it. */
export function raiseSplit(raise: number, fare: number, commissionPct: number): { commission: number; fromCommission: number; beyond: number } {
  const round = (value: number) => Math.round(value * 100) / 100;
  const commission = round(Math.max(0, fare) * Math.max(0, commissionPct) / 100);
  const amount = Math.max(0, raise);
  return { commission, fromCommission: round(Math.min(amount, commission)), beyond: round(Math.max(0, amount - commission)) };
}

export type ReservationTimelineStep = {
  id: ReservationStep | "pickup";
  title: string;
  detail: string;
  /** Minutes after the rider booked, and minutes left before pickup, when this step starts. */
  afterBookedMin: number;
  beforePickupMin: number;
  /** Why the step does not happen for this booking, or null when it does. */
  skipped: string | null;
};

function listWho(resv: ReservationRules, groups: readonly DriverGroup[]): string {
  if (resv.listTo === "category") return tr("Only drivers who drive the ride's category");
  if (resv.listTo === "rating") return tr("Only drivers rated {0} or more", [resv.listMinRating]);
  if (resv.listTo === "random") return tr("A random group of {0} drivers", [resv.listGroupSize]);
  if (resv.listTo === "homeNear") return tr("Only drivers whose home is within {0} km of the pickup", [resv.listHomeKm]);
  if (resv.listTo === "nearNow") return tr("Only drivers within {0} km of the pickup when the rider books", [resv.listNearKm]);
  if (resv.listTo === "favourites") return tr("Only the rider's favourite drivers");
  if (resv.listTo === "areaRegulars") return tr("Only drivers with {0}+ trips from the pickup area in 30 days", [resv.listAreaTrips]);
  if (resv.listTo === "group") {
    const group = groups.find((item) => item.id === resv.listGroupId);
    return group ? tr("Only drivers in the group {0}", [group.name]) : tr("Only drivers in the chosen group");
  }
  return tr("All drivers in the zone");
}

/** Exclusive and Radar steps only happen when the step and the zone's mode are both on. */
function activeUrgent(zone: ZoneDispatch): { exclusive: boolean; radar: boolean } {
  return { exclusive: zone.reservation.toExclusive && zone.exclusive.on, radar: zone.reservation.toRadar && zone.radar.on };
}

/**
 * What happens to a reservation nobody takes, booked this many minutes before pickup:
 * Scheduled rides → Home popup → Exclusive → Radar trips → pickup. Steps that are off or come too late are marked skipped.
 */
export function reservationTimeline(zone: ZoneDispatch, bookedBeforeMin: number, groups: readonly DriverGroup[] = []): ReservationTimelineStep[] {
  const resv = zone.reservation;
  const lead = Math.max(0, Math.round(bookedBeforeMin));
  const urgent = activeUrgent(zone);
  const startAt = (beforePickup: number) => Math.max(0, lead - beforePickup);
  const exclusiveAt = urgent.exclusive ? startAt(resv.exclusiveBeforeMin) : Infinity;
  const radarAt = urgent.radar ? startAt(resv.radarBeforeMin) : Infinity;
  const step = (id: ReservationTimelineStep["id"], title: string, detail: string, afterBookedMin: number, skipped: string | null): ReservationTimelineStep => {
    const at = Math.min(lead, Math.max(0, afterBookedMin));
    return { id, title, detail, afterBookedMin: at, beforePickupMin: lead - at, skipped };
  };
  const homeSkip = !resv.homePopup ? tr("Off.")
    : resv.homePopupAfterMin >= Math.min(exclusiveAt, radarAt) ? (exclusiveAt <= radarAt ? tr("Skipped: it is already Exclusive by then.") : tr("Skipped: it is already in Radar trips by then."))
      : resv.homePopupAfterMin >= lead ? tr("Skipped: pickup comes first.")
        : null;
  const modeSkip = (setting: boolean, mode: OfferMode) => (!setting ? tr("Off.") : !zone[mode].on ? tr("Skipped: {0} is off in this zone.", [trx(modeLabel(mode))]) : null);
  return [
    step("list", RESERVATION_STEP_LABEL.list, resv.listTo !== "all" && resv.listOpenAll ? tr("{0} see it in Scheduled rides. Still untaken after {1} min: every driver in the zone sees it.", [listWho(resv, groups), resv.listOpenAllAfterMin]) : tr("{0} see it in Scheduled rides.", [listWho(resv, groups)]), 0, null),
    step("home", RESERVATION_STEP_LABEL.home, [resv.homePopupTo === "zone" || resv.listTo === "all" ? tr("Nobody took it yet, so it also pops up on Home for every online driver in the zone. It stays in Scheduled rides.") : tr("Nobody took it yet, so it also pops up on Home for the same drivers as the list. It stays in Scheduled rides."), resv.popupClosedExclusive && (resv.toExclusive && zone.exclusive.on) ? tr("A driver who closes it with × can get it back as an Exclusive if nobody took it.") : ""].filter(Boolean).join(" "), resv.homePopupAfterMin, homeSkip),
    step("exclusive", RESERVATION_STEP_LABEL.exclusive, lead <= resv.exclusiveBeforeMin ? tr("Booked this close to pickup, so it is an Exclusive offer at once.") : tr("Close to pickup it becomes an Exclusive offer, like today's Exclusive."), lead - resv.exclusiveBeforeMin, modeSkip(resv.toExclusive, "exclusive")),
    step("radar", RESERVATION_STEP_LABEL.radar, tr("It also comes into Radar trips (Home deck and Live list) as a normal trip that needs a driver soon. Never labelled Exclusive there."), lead - resv.radarBeforeMin, modeSkip(resv.toRadar, "radar")),
    step("pickup", "Pickup", tr("Pickup time."), lead, null),
  ];
}

/** Rides booked with less time than this before pickup skip the Home popup: Exclusive or Radar comes first. Null when the popup is off. */
export function homePopupSkippedBelowMin(zone: ZoneDispatch): number | null {
  const resv = zone.reservation;
  if (!resv.homePopup) return null;
  const urgent = activeUrgent(zone);
  const first = Math.max(urgent.exclusive ? resv.exclusiveBeforeMin : 0, urgent.radar ? resv.radarBeforeMin : 0);
  return resv.homePopupAfterMin + first;
}

const STEP_ORDER: ReservationStep[] = ["list", "home", "exclusive", "radar"];

/** Where an untaken reservation is at a moment: minutes since the rider booked and minutes left before pickup. */
export function reservationStepAt(zone: ZoneDispatch, sinceBookedMin: number, beforePickupMin: number): ReservationStep {
  const resv = zone.reservation;
  const urgent = activeUrgent(zone);
  if (urgent.radar && beforePickupMin <= resv.radarBeforeMin) return "radar";
  if (urgent.exclusive && beforePickupMin <= resv.exclusiveBeforeMin) return "exclusive";
  if (resv.homePopup && sinceBookedMin >= resv.homePopupAfterMin) return "home";
  return "list";
}

/** Where it goes back when the driver who took it cancels. A step closer to pickup always wins over the chosen one. */
export function stepAfterDriverCancel(zone: ZoneDispatch, sinceBookedMin: number, beforePickupMin: number): ReservationStep {
  const resv = zone.reservation;
  const byTime = reservationStepAt(zone, sinceBookedMin, beforePickupMin);
  if (resv.onDriverCancel === "byTime") return byTime;
  // Back to the list: the Home popup waits its minutes again, counted from the cancel.
  if (resv.onDriverCancel === "list") return reservationStepAt(zone, 0, beforePickupMin);
  const chosen: ReservationStep = resv.onDriverCancel === "home" ? (resv.homePopup ? "home" : "list") : (activeUrgent(zone).exclusive ? "exclusive" : "list");
  return STEP_ORDER.indexOf(chosen) >= STEP_ORDER.indexOf(byTime) ? chosen : byTime;
}

export function countryIssues(country: CountryDispatch): string[] {
  const issues: string[] = [];
  if (country.cancelRateLimitPct < 1 || country.cancelRateLimitPct > 100) issues.push("Cancel rate limit must be 1 to 100%.");
  if (!(country.noShowDriverSharePct >= 0 && country.noShowDriverSharePct <= 100)) issues.push("The driver's share of the no-show fee must be 0 to 100%.");
  issues.push(...cancelReasonIssues(country.cancelReasons));
  if (!country.rest.on) return issues;
  if (country.rest.warnFirstMin < 1 || country.rest.warnFirstMin > 120 || country.rest.warnLastMin < 1 || country.rest.warnLastMin > 120) issues.push("Driving limit warnings must be 1 to 120 minutes before the limit.");
  else if (country.rest.warnFirstMin <= country.rest.warnLastMin) issues.push("Driving limit: the first warning must come before the second (a larger number of minutes).");
  if (country.rest.workHours < 4 || country.rest.workHours > 16) issues.push("Work hours before rest must be 4 to 16.");
  if (country.rest.restHours < 1 || country.rest.restHours > 12) issues.push("Rest hours must be 1 to 12.");
  return issues;
}

export function modeLabel(mode: OfferMode | "none"): string {
  return mode === "radar" ? "Radar" : mode === "exclusive" ? "Exclusive" : "None";
}

/** Readable labels for the settings, used in change lists and the history. */
const LABELS: Record<string, string> = {
  "rideCheck.farOn": "Ride check when finished far from drop-off",
  "rideCheck.stopOn": "Ride check on an unexpected long stop",
  "rideCheck.routeOn": "Ride check off the route", "rideCheck.routeKm": "Off the route from (km)",
  "rideCheck.longerOn": "Ride check when longer than expected", "rideCheck.longerPct": "Longer than expected from (%)",
  "rideCheck.crashOn": "Ride check on a possible crash",
  "rideCheck.on": "Ride check by the server", "rideCheck.stopMinutes": "Long stop (min)", "rideCheck.endFarMeters": "Ended far from the drop-off (m)",
  "rideCheck.noAnswerSeconds": "Time to answer (s)", "rideCheck.repeatMinutes": "Ask again after (min)", "rideCheck.noAnswerAlarm": "No answer rings the alarm",
  "radar.on": "Radar", "radar.drivers": "Radar drivers", "radar.seconds": "Radar time", "radar.then": "After Radar",
  "exclusive.on": "Exclusive", "exclusive.seconds": "Exclusive time to accept", "exclusive.drivers": "Exclusive drivers to try", "exclusive.then": "After Exclusive",
  "radarApp.fullOn": "Radar full screen", "radarApp.full": "Offers on full-screen radar", "radarApp.popupOn": "Radar popup", "radarApp.popup": "Offers in the popup",
  "radarApp.fullLockWhileDriving": "Full-screen radar locked while driving", "radarApp.popupSplitByDriving": "Own card limit while driving", "radarApp.popupWhileDriving": "Offer cards while driving",
  "radarApp.drivingOn": "Radar offers while driving", "radarApp.driving": "Offers while driving", "autoOffline.on": "Go offline automatically", "autoOffline.after": "Offline after offers not accepted", "autoOffline.noFixMinutes": "Set offline after minutes without position",
  "reservation.on": "Reservations", "reservation.searchBeforeMin": "Reservation search starts", "reservation.assignEarly": "Assign early", "reservation.assignHoursBefore": "Assign hours before",
  "reservation.backup": "Backup driver", "reservation.toExclusive": "Reservation to Exclusive", "reservation.exclusiveBeforeMin": "Exclusive before pickup",
  "reservation.listTo": "Scheduled rides go to", "reservation.listMinRating": "Lowest rating for Scheduled rides",
  "reservation.listGroupSize": "Random group size", "reservation.listHomeKm": "Home distance from pickup", "reservation.listNearKm": "Distance from pickup now",
  "reservation.listAreaTrips": "Trips from the area", "reservation.listOpenAll": "Open to all drivers", "reservation.listOpenAllAfterMin": "Open to all drivers after",
  "reservation.homePopup": "Reservation Home popup", "reservation.homePopupAfterMin": "Home popup after booking",
  "reservation.toRadar": "Reservation to Radar trips", "reservation.radarBeforeMin": "Radar trips before pickup", "reservation.onDriverCancel": "After a driver cancels",
  "choose.how": "How the mode is chosen", "choose.radarAbove": "Busy level for Radar", "choose.main": "Main mode", "choose.backup": "Backup mode", "choose.times": "Time rules",
  rulesFrom: "Whose rules", "radius.steps": "Search distance steps", "radius.maxWaitMin": "Longest search",
  "batching.on": "Smart waiting", "batching.seconds": "Smart waiting seconds", "batching.fromRatio": "Smart waiting from busy level",
  "finishing.radar": "Finishing nearby on Radar", "finishing.exclusive": "Finishing nearby on Exclusive", "finishing.withinMin": "Finishing within minutes", "finishing.withinKm": "Finishing within km",
  "favourite.on": "Favourite drivers", "favourite.maxKm": "Favourite max distance", "favourite.waitSec": "Wait for favourite",
  waiting: "Rider waiting steps", "driverCancel.on": "Driver cancels: search again", "driverCancel.commissionCutPct": "Lower commission after a driver cancel",
  "riderCancel.on": "Smart cancel check", "riderCancel.closerPct": "Came closer by",
  "riderCancel.priority": "Priority after rider cancel", "riderCancel.priorityMin": "Priority minutes",
  extras: "Special requests", longTripKm: "Long trip from", "stops.on": "Stops", "stops.max": "Max stops", "pickupMove.maxMeters": "Pickup move after accept (m)", "stops.freeWaitMin": "Free wait per stop",
  "stops.perMin": "Wait price per minute", "stops.perStop": "Fee per stop", "stops.changeDuring": "Change during the trip", "stops.driverCanRefuse": "Driver can refuse changes",
  "stops.answerSeconds": "Driver's time to answer a change", "stops.beforePickup": "Change before pickup", "stops.fixedPriceTrips": "Fixed-price trips",
  "airport.on": "Airport queue", "airport.order": "Airport order", "airport.maxQueueMin": "Longest time in queue", "airport.queueAreas": "Queue area",
  "goingHome.on": "Going home", "goingHome.perDay": "Going home per day", "goingHome.maxOffDeg": "Going home direction",
  "fairness.idleBoost": "Boost for waiting drivers", "fairness.idlePoints": "Boost points", "fairness.hourCap": "Rides per hour cap", "fairness.hourRides": "Rides per hour",
  "fairness.skipPause": "Pause after skips", "fairness.skips": "Skips in a row", "fairness.pauseMin": "Skip pause minutes",
  "decline.on": "Saying no rules", "decline.countsAcceptance": "No lowers acceptance", "decline.pauseAfter": "Pause after no's", "decline.pauseMin": "No pause minutes",
  "decline.longTripFree": "Long trips free to refuse", "decline.farPickupFree": "Far pickups free to refuse", "decline.farPickupKm": "Far pickup from",
  "safety.minRating": "Lowest rating check", "pickupPin.required": "Rider PIN before Start", "pickupPin.maxAttempts": "Wrong tries before lock", "pickupPin.lockMinutes": "Lock minutes", "safety.ratingBelow": "Lowest rating", "safety.maxCancel": "No requests over the cancel rate limit",
  "safety.doNotMatch": "Do not match list", "safety.womenOnly": "Women-only rides", alerts: "Alerts",
};

/** Labels for the offer and waiting settings (Round 3, Q14–Q20). */
Object.assign(LABELS, {
  "offerCard.netFare": "Offer card shows the driver's share", "offerCard.pickupAddress": "Offer card: pickup address", "offerCard.dropoffAreaOnly": "Offer card: drop-off area only",
  "offerCard.stops": "Offer card: stops", "offerCard.riderRating": "Show rider rating on offers", "offerCard.tripMinutesKm": "Offer card: trip minutes and km",
  "offerCard.pickupDistance": "Offer card: distance to pickup", "offerCard.badges": "Offer card: badges",
  "raisePrice.maxFactor": "Rider raise limit",
  hiddenComesBackMin: "Hidden Radar trip comes back after", "exclusiveWhileDriving.on": "Exclusive while driving", "exclusiveWhileDriving.count": "Exclusive offers while driving",
    "pickupWait.farPickupOn": "Rule for far pickups", "pickupWait.farPickupKm": "Far pickup from",
    "pickupWait.cancelAfterArrivedIsNoShow": "Cancel after the driver arrived counts as a no-show",
});
for (const reason of EXCLUSIVE_REASON_LIST) {
  LABELS[`exclusiveReasons.${reason.id}.text`] = `Exclusive reason (${reason.when.toLowerCase()})`;
  LABELS[`exclusiveReasons.${reason.id}.on`] = `Exclusive reason “${reason.text}”`;
}
for (const [rule, words] of [["farPickup", "Far pickup"], ["rideTypes.scheduled", "Scheduled ride pickup"], ["rideTypes.airport", "Airport pickup"], ["rideTypes.event", "Event pickup"]] as const) {
  for (const field of WAIT_FIELD_LIST) LABELS[`pickupWait.${rule}.${field.id}`] = `${words}: ${field.label.toLowerCase()}`;
  if (rule !== "farPickup") LABELS[`pickupWait.${rule}.on`] = `${words} rule`;
}

/** Labels for Destination mode and next trips (Round 13). */
Object.assign(LABELS, TRIP_RULE_LABELS);

/** Labels for the reservation settings in Dispatch › Reservations. */
Object.assign(LABELS, {
  "reservation.listGroupId": "Driver group for Scheduled rides", "reservation.homePopupTo": "Home popup goes to",
  "reservation.popupClosedExclusive": "Closed popup comes back as Exclusive", "reservation.hideClashing": "Clashing rides leave the list",
  "reservation.lateWarn": "Late warning", "reservation.lateBackupAfterMin": "Offline driver loses the ride after",
  "reservation.lateEta.on": "Watch arrival time", "reservation.lateEta.toleranceMin": "Minutes late allowed", "reservation.lateEta.checkEverySeconds": "Check arrival every (seconds)", "reservation.lateEta.reassignTo": "Late ride goes to",
  "reservation.towardPickup": "Trips toward the pickup before the ride", "reservation.towardPickupBeforeMin": "Trips toward the pickup from",
  "reservation.driverLateCancelHours": "Driver late cancel, hours before pickup", "reservation.latePause": "Pause after late cancels",
  "reservation.latePauseAfter": "Late cancels before a pause", "reservation.latePeriodDays": "Late cancels counted over days", "reservation.latePauseDays": "Scheduled rides paused for days",
  "reservation.showDriverOnAccept": "Rider sees the driver at once", "reservation.raiseFare": "Raise the driver's fare", "reservation.raiseMax": "Highest fare raise",
  "reservation.assignAcceptSec": "Time to accept a ride assigned by Movera",
});

/** Labels for the rider cancel fees per car type: "Live trips, Comfort: fee", "Reservations, Premium: highest fee". */
const FEE_FIELDS = { freeMin: "free cancel minutes", type: "fee type", value: "fee", min: "lowest fee", max: "highest fee" } as const;
const FEE_PATH = /^(riderCancel\.fees|reservation\.riderFees)\.([^.]+)\.(freeMin|type|value|min|max)$/;
/** Any car type, also ones added in Pricing: the label from the built-in list, else the id. */
function feeLabel(path: string): string | undefined {
  const match = FEE_PATH.exec(path);
  if (!match) return undefined;
  const [, part, id, field] = match;
  const name = DEFAULT_FEE_CATEGORIES.find((item) => item.id === id)?.label ?? id;
  return `${part === "riderCancel.fees" ? "Live trips" : "Reservations"}, ${name}: ${field === "freeMin" && part === "reservation.riderFees" ? "free cancel minutes before pickup" : FEE_FIELDS[field as keyof typeof FEE_FIELDS]}`;
}

/** Both sides get a row for every car type either has, so a car type that starts as a copy of Economy only shows what changed. */
function alignFees(a: CancelFeeTable, b: CancelFeeTable): CancelFeeTable {
  return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((id) => [id, feeRow(a, id)]));
}

const RIDE_TYPE_FIELDS: Record<keyof RideTypeRule, string> = { onlineBeforeMin: "be online before", spareMin: "spare minutes", remindFirstMin: "first reminder", remindLastMin: "second reminder" };
for (const type of RIDE_TYPES) {
  for (const [field, words] of Object.entries(RIDE_TYPE_FIELDS)) LABELS[`reservation.types.${type.id}.${field}`] = `${type.label} rides: ${words}`;
}

function flat(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (item && typeof item === "object" && !Array.isArray(item)) for (const [k, v] of flat(item, path)) out.set(k, v);
      else out.set(path, JSON.stringify(item));
    }
  }
  return out;
}

/** Words for the reservation choices, by setting, so "list" or "all" read well in change lines. */
const PATH_WORDS: Record<string, Record<string, string>> = {
  "reservation.listTo": { all: "all drivers in the zone", category: "drivers of the category", rating: "drivers with a high rating", random: "a random group of drivers", homeNear: "drivers whose home is near the pickup", nearNow: "drivers near the pickup now", favourites: "the rider's favourite drivers", areaRegulars: "drivers often in the area", group: "a driver group" },
  "reservation.homePopupTo": { list: "same drivers as the list", zone: "all drivers in the zone" },
  "reservation.listGroupId": { "": "none" },
  "reservation.onDriverCancel": { byTime: "by time left", list: "Scheduled rides", home: "Home popup", exclusive: "Exclusive" },
  "reservation.lateEta.reassignTo": { exclusive: "Exclusive offer to nearest driver", radar: "Radar", dispatch: "back to dispatch" },
};

function show(raw: string | undefined, path = ""): string {
  if (raw === undefined) return "";
  const value = JSON.parse(raw) as unknown;
  if (value === null) return /\.riderFees\.|\.fees\./.test(path) ? "none" : "same as the zone";
  if (/\.(riderFees|fees)\.\w+\.type$/.test(path) && typeof value === "string") return value === "percent" ? "% of price" : "fixed";
  if (typeof value === "string" && PATH_WORDS[path]?.[value]) return PATH_WORDS[path][value];
  if (value === true) return "on";
  if (value === false) return "off";
  if (Array.isArray(value)) return value.every((item) => typeof item === "number") ? value.join(", ") : `${value.length} items`;
  if (value === "widen_then_exclusive") return "wider area, then Exclusive";
  if (value === "widen_then_radar") return "wider area, then Radar";
  if (value === "widen") return "wider area";
  const words: Record<string, string> = { auto: "Automatic", manual: "By hand", driver: "the driver's zone", pickup: "the pickup zone", fifo: "first in the queue", best: "best driver", none: "none" };
  if (typeof value === "string" && words[value]) return words[value];
  if (typeof value === "string") return value === "radar" || value === "exclusive" ? modeLabel(value) : value;
  return String(value);
}

/** What changed between two rule sets, in plain lines like "Radar drivers: 5 → 8". */
export function changeLines(before: ZoneDispatch, after: ZoneDispatch): string[] {
  const withFees = (zone: ZoneDispatch, other: ZoneDispatch): ZoneDispatch => ({
    ...zone,
    riderCancel: { ...zone.riderCancel, fees: alignFees(zone.riderCancel.fees, other.riderCancel.fees) },
    reservation: { ...zone.reservation, riderFees: alignFees(zone.reservation.riderFees, other.reservation.riderFees) },
  });
  const a = flat(withFees(before, after));
  const b = flat(withFees(after, before));
  const lines: string[] = [];
  for (const [path, value] of b) {
    if (path === "zoneId" || a.get(path) === value) continue;
    const label = LABELS[path] ?? feeLabel(path) ?? path;
    lines.push(Array.isArray(JSON.parse(value)) && !(JSON.parse(value) as unknown[]).every((item) => typeof item === "number") ? `${label} changed` : `${label}: ${show(a.get(path), path)} → ${show(value, path)}`);
  }
  return lines;
}

export function countryLines(before: CountryDispatch, after: CountryDispatch): string[] {
  const lines: string[] = [];
  if (before.rest.on !== after.rest.on) lines.push(`Rest after long work: ${before.rest.on ? "on" : "off"} → ${after.rest.on ? "on" : "off"}`);
  if (before.rest.workHours !== after.rest.workHours) lines.push(`Work hours before rest: ${before.rest.workHours} → ${after.rest.workHours}`);
  if (before.rest.restHours !== after.rest.restHours) lines.push(`Rest hours: ${before.rest.restHours} → ${after.rest.restHours}`);
  if (before.rest.warnFirstMin !== after.rest.warnFirstMin) lines.push(`First driving limit warning: ${before.rest.warnFirstMin} → ${after.rest.warnFirstMin} min`);
  if (before.rest.warnLastMin !== after.rest.warnLastMin) lines.push(`Second driving limit warning: ${before.rest.warnLastMin} → ${after.rest.warnLastMin} min`);
  if (before.rest.blockOnline !== after.rest.blockOnline) lines.push(`Block going online at the limit: ${before.rest.blockOnline ? "on" : "off"} → ${after.rest.blockOnline ? "on" : "off"}`);
  if (before.cancelRateLimitPct !== after.cancelRateLimitPct) lines.push(`Cancel rate limit: ${before.cancelRateLimitPct}% → ${after.cancelRateLimitPct}%`);
  if (before.noShowDriverSharePct !== after.noShowDriverSharePct) lines.push(`Driver's share of the no-show fee: ${before.noShowDriverSharePct}% → ${after.noShowDriverSharePct}%`);
  lines.push(...cancelReasonLines(before.cancelReasons, after.cancelReasons));
  return lines;
}

/** The main way a zone offers rides, as a short badge. */
export function mainMode(zone: ZoneDispatch): "radar" | "exclusive" | "auto" {
  if (zone.choose.how === "auto") return "auto";
  return zone.choose.main;
}

/** Big changes need a second admin: switching the main way of offering, or switching a mode off. */
export function isBigChange(before: ZoneDispatch, after: ZoneDispatch): boolean {
  return mainMode(before) !== mainMode(after) || (before.radar.on && !after.radar.on) || (before.exclusive.on && !after.exclusive.on);
}

export type ZoneChange = { zoneId: string; lines: string[]; big: boolean; issues: string[] };

/** Zones whose working copy differs from what is live. */
export function pendingChanges(book: DispatchBook, working: Record<string, ZoneDispatch>, zoneIds: readonly string[]): ZoneChange[] {
  return zoneIds.flatMap((zoneId) => {
    const next = working[zoneId] ?? draftRules(book, zoneId);
    const lines = changeLines(liveRules(book, zoneId), next);
    return lines.length ? [{ zoneId, lines, big: isBigChange(liveRules(book, zoneId), next), issues: zoneIssues(next) }] : [];
  });
}

export function saveDraft(book: DispatchBook, working: Record<string, ZoneDispatch>, countries: Record<string, CountryDispatch>): DispatchBook {
  return { ...book, draftRev: book.draftRev + 1, draft: { ...book.draft, ...clone(working) }, countries: { ...book.countries, ...clone(countries) } };
}

/**
 * Make the working rules live. Big changes wait for a second admin; everything else goes live now.
 * Returns the new book, what went live and what waits.
 */
export function publish(
  book: DispatchBook,
  working: Record<string, ZoneDispatch>,
  countries: Record<string, CountryDispatch>,
  zoneIds: readonly string[],
  actorId: string,
  at: string,
  note: string,
  /** v0.8.0 (owner 2026-10-27): the live panel publishes at once, no second admin. */
  options: { direct?: boolean } = {},
): { book: DispatchBook; live: string[]; waiting: string[]; error?: string } {
  const changes = pendingChanges(book, working, zoneIds);
  const countryChanges = Object.values(countries).flatMap((item) => countryLines(liveCountry(book, item.country), item).map((line) => `${market(item.country).name}: ${line}`));
  const bad = changes.find((change) => change.issues.length);
  if (bad) return { book, live: [], waiting: [], error: `${zoneById(bad.zoneId)?.name ?? bad.zoneId}: ${bad.issues[0]}` };
  const badCountry = Object.values(countries).map(countryIssues).find((list) => list.length);
  if (badCountry) return { book, live: [], waiting: [], error: badCountry[0] };
  if (!changes.length && !countryChanges.length) return { book, live: [], waiting: [], error: "Nothing to publish. Change a rule first." };
  const now = changes.filter((change) => options.direct || !change.big);
  const later = changes.filter((change) => !options.direct && change.big);
  const nextLive = { ...book.live };
  for (const change of now) nextLive[change.zoneId] = clone(working[change.zoneId] ?? draftRules(book, change.zoneId));
  const nextCountries = { ...book.liveCountries, ...clone(countries) };
  const draft = { ...book.draft };
  for (const change of now) delete draft[change.zoneId];
  const draftCountries = { ...book.countries };
  for (const id of Object.keys(countries)) delete draftCountries[id];
  for (const change of later) draft[change.zoneId] = clone(working[change.zoneId] ?? draftRules(book, change.zoneId));
  const approvals = later.length ? [...book.approvals.filter((item) => !(item.kind === "publish" && item.zoneIds.some((id) => later.some((change) => change.zoneId === id)))), {
    id: `AP-${book.draftRev + 1}`,
    kind: "publish" as const,
    zoneIds: later.map((change) => change.zoneId),
    lines: later.flatMap((change) => change.lines.map((line) => `${zoneById(change.zoneId)?.name ?? change.zoneId}: ${line}`)),
    by: actorId,
    at,
    zones: Object.fromEntries(later.map((change) => [change.zoneId, clone(working[change.zoneId] ?? draftRules(book, change.zoneId))])),
  }] : book.approvals;
  const lines = [...now.flatMap((change) => change.lines.map((line) => `${zoneById(change.zoneId)?.name ?? change.zoneId}: ${line}`)), ...countryChanges];
  const versions = now.length || countryChanges.length
    ? [{ rev: book.draftRev + 1, at, actorId, note, zoneIds: now.map((change) => change.zoneId), lines, live: clone(nextLive), liveCountries: clone(nextCountries) }, ...book.versions].slice(0, 40)
    : book.versions;
  return {
    book: { ...book, draftRev: book.draftRev + 1, live: nextLive, liveCountries: nextCountries, draft, countries: draftCountries, approvals, versions },
    live: now.map((change) => change.zoneId),
    waiting: later.map((change) => change.zoneId),
  };
}

/** A second admin approves a waiting change. The person who asked cannot approve it. */
export function approve(book: DispatchBook, approvalId: string, actorId: string, at: string): { book: DispatchBook; error?: string } {
  const item = book.approvals.find((entry) => entry.id === approvalId);
  if (!item) return { book, error: "That approval is gone." };
  if (item.by === actorId) return { book, error: "A second admin must approve. You asked for this change." };
  const approvals = book.approvals.filter((entry) => entry.id !== approvalId);
  if (item.kind === "control" && item.control) {
    return { book: { ...book, draftRev: book.draftRev + 1, approvals, control: { ...book.control, [item.control.zoneId]: { ...item.control.value, at } } } };
  }
  const live = { ...book.live, ...clone(item.zones ?? {}) };
  const draft = { ...book.draft };
  for (const id of item.zoneIds) delete draft[id];
  const version: Version = { rev: book.draftRev + 1, at, actorId: item.by, approvedBy: actorId, note: "Approved by a second admin", zoneIds: item.zoneIds, lines: item.lines, live: clone(live), liveCountries: clone(book.liveCountries) };
  return { book: { ...book, draftRev: book.draftRev + 1, approvals, live, draft, versions: [version, ...book.versions].slice(0, 40) } };
}

export function decline(book: DispatchBook, approvalId: string): DispatchBook {
  return { ...book, draftRev: book.draftRev + 1, approvals: book.approvals.filter((entry) => entry.id !== approvalId) };
}

/** Go back to an older version: it becomes live again and is saved as a new version. */
export function undoTo(book: DispatchBook, rev: number, actorId: string, at: string): { book: DispatchBook; error?: string } {
  const index = book.versions.findIndex((entry) => entry.rev === rev);
  const target = book.versions[index];
  if (!target) return { book, error: "That version was not found." };
  // Undoing a version means going back to what was live just before it.
  const previous = book.versions[index + 1];
  const live = previous ? clone(previous.live) : {};
  const liveCountries = previous ? clone(previous.liveCountries) : {};
  const version: Version = { rev: book.draftRev + 1, at, actorId, note: `Undo of version ${rev}`, zoneIds: target.zoneIds, lines: target.lines.map((line) => `Undone: ${line}`), live: clone(live), liveCountries: clone(liveCountries) };
  return { book: { ...book, draftRev: book.draftRev + 1, live, liveCountries, versions: [version, ...book.versions].slice(0, 40) } };
}

/** Live switch from the Live tab: pause a zone or force a mode. Big ones wait for a second admin. */
export function requestControl(book: DispatchBook, zoneId: string, value: Omit<Control, "at" | "by">, actorId: string, at: string, options: { direct?: boolean } = {}): { book: DispatchBook; waiting: boolean } {
  const current = book.control[zoneId] ?? { paused: false, mode: null, by: "", at: "" };
  const big = value.paused !== current.paused || value.mode !== current.mode;
  const resume = !value.paused && !value.mode;
  if (!big || resume || options.direct) return { book: { ...book, draftRev: book.draftRev + 1, control: { ...book.control, [zoneId]: { ...value, by: actorId, at } } }, waiting: false };
  const lines = [`${zoneById(zoneId)?.name ?? zoneId}: ${value.paused ? "pause dispatch" : `use ${modeLabel(value.mode ?? "none")} now`}`];
  const approvals = [...book.approvals.filter((item) => !(item.kind === "control" && item.control?.zoneId === zoneId)), { id: `AP-${book.draftRev + 1}`, kind: "control" as const, zoneIds: [zoneId], lines, by: actorId, at, control: { zoneId, value: { ...value, by: actorId, at } } }];
  return { book: { ...book, draftRev: book.draftRev + 1, approvals }, waiting: true };
}

export type CopyPart = TabId;

const PART_KEYS: Record<TabId, (keyof ZoneDispatch)[]> = {
  modes: ["choose", "rulesFrom", "offerCard", "raisePrice"],
  radar: ["radar", "radarApp", "hiddenComesBackMin", "autoOffline"],
  exclusive: ["exclusive", "exclusiveWhileDriving"],
  reservations: ["reservation"],
  best: ["factors", "radius", "batching", "finishing", "favourite"],
  waiting: ["waiting"],
  rides: ["extras", "longTripKm", "stops", "pickupMove", "driverCancel", "riderCancel", "airport", "pickupWait"],
  drivers: ["goingHome", "fairness", "decline"],
  destination: ["destinationMode", "nextTrips"],
  safety: ["safety", "pickupPin", "rideCheck"],
  alerts: ["alerts"],
};

export function copyParts(from: ZoneDispatch, to: ZoneDispatch, parts: readonly TabId[]): ZoneDispatch {
  const next = clone(to) as unknown as Record<string, unknown>;
  for (const part of parts) for (const key of PART_KEYS[part]) next[key] = clone(from[key]);
  return next as unknown as ZoneDispatch;
}

export function applyPreset(zone: ZoneDispatch, preset: Preset, country: MarketId): ZoneDispatch {
  // G4-F2: a preset saved on the server holds a dispatch document's parts; only those parts of the zone change.
  if (preset.doc) return rulesOfDispatch(preset.doc, null, zone);
  const money = feeDefaults(country);
  // Presets saved before newer settings existed get those settings from the defaults.
  const values = complete(zone.zoneId, clone(preset.values) as Partial<ZoneDispatch>);
  return {
    ...values,
    zoneId: zone.zoneId,
    // Built-in presets carry no money, so fees stay in the country's currency.
    riderCancel: preset.builtIn ? { ...values.riderCancel, fees: cancelFeeDefaults("live", country) } : values.riderCancel,
    stops: preset.builtIn ? { ...values.stops, perMin: money.perMin, perStop: money.perStop } : values.stops,
    reservation: preset.builtIn ? { ...values.reservation, riderFees: cancelFeeDefaults("reservation", country), raiseMax: raiseCap(country) } : values.reservation,
  };
}

export function presetFrom(zone: ZoneDispatch, name: string, id: string): Preset {
  const { zoneId: _drop, ...values } = clone(zone);
  void _drop;
  return { id, name, note: `Saved from ${zoneById(zone.zoneId)?.name ?? zone.zoneId}`, builtIn: false, values };
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function inTime(rule: Pick<TimeRule, "from" | "to">, hhmm: string): boolean {
  const now = minutes(hhmm);
  const from = minutes(rule.from);
  const to = minutes(rule.to);
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/** Which mode a new request uses right now, and why. */
export function modeNow(zone: ZoneDispatch, control: Control | undefined, busy: number, hhmm: string): { mode: OfferMode | null; why: string } {
  if (control?.paused) return { mode: null, why: tr("Dispatch is paused in this zone.") };
  if (control?.mode) return { mode: control.mode, why: tr("An admin switched this zone to {0}.", [trx(modeLabel(control.mode))]) };
  const timed = zone.choose.times.find((rule) => rule.on && zone[rule.mode].on && inTime(rule, hhmm));
  if (timed) return { mode: timed.mode, why: tr("Time rule {0}–{1} uses {2}.", [timed.from, timed.to, trx(modeLabel(timed.mode))]) };
  if (zone.choose.how === "auto" && zone.radar.on && zone.exclusive.on) {
    return busy >= zone.choose.radarAbove
      ? { mode: "radar", why: tr("Busy: {0} requests per free driver (Radar from {1}).", [busy.toFixed(1), zone.choose.radarAbove]) }
      : { mode: "exclusive", why: tr("Calm: {0} requests per free driver (Radar from {1}).", [busy.toFixed(1), zone.choose.radarAbove]) };
  }
  const main = zone[zone.choose.main].on ? zone.choose.main : zone.radar.on ? "radar" : zone.exclusive.on ? "exclusive" : null;
  return main ? { mode: main, why: tr("Main mode is {0}.", [trx(modeLabel(main))]) } : { mode: null, why: tr("No mode is on.") };
}

export function insideRing(point: [number, number], ring: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ay, ax] = ring[i];
    const [by, bx] = ring[j];
    if ((ay > point[0]) !== (by > point[0]) && point[1] < ((bx - ax) * (point[0] - ay)) / (by - ay || 1e-12) + ax) inside = !inside;
  }
  return inside;
}

/** During an event, a pickup inside its area uses the event's mode (and radar size). */
export function withEvent(zone: ZoneDispatch, event: DispatchEvent | null, pickup: [number, number]): { rules: ZoneDispatch; event: DispatchEvent | null } {
  if (!event || !event.on || !insideRing(pickup, event.ring)) return { rules: zone, event: null };
  const rules: ZoneDispatch = {
    ...zone,
    radar: { ...zone.radar, on: zone.radar.on || event.mode === "radar", drivers: event.mode === "radar" ? event.radarDrivers : zone.radar.drivers },
    exclusive: { ...zone.exclusive, on: zone.exclusive.on || event.mode === "exclusive" },
    choose: { ...zone.choose, how: "manual", main: event.mode, backup: event.mode === "radar" ? (zone.exclusive.on ? "exclusive" : "none") : (zone.radar.on ? "radar" : "none"), times: [] },
  };
  return { rules, event };
}

export type DriverFacts = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoneId: string;
  /** free, or finishing a ride: minutes to the drop-off and its distance to the new pickup. */
  finishing: { inMin: number; dropKm: number } | null;
  rating: number;
  acceptancePct: number;
  cancelPct: number;
  idleMin: number;
  categories: string[];
  extras: ExtraId[];
  female: boolean;
  ridesThisHour: number;
  skipsInRow: number;
  noInRow: number;
  favourite: boolean;
  goingHome: boolean;
  homeDirectionOk: boolean;
  priorityUntilMin: number;
  queuePos: number | null;
  restNeeded: boolean;
};

export type TestRequest = {
  zoneId: string;
  at: [number, number];
  category: string;
  extras: ExtraId[];
  womenOnly: boolean;
  tripKm: number;
  blocked: string[];
};

export type Ranked = {
  driver: DriverFacts;
  km: number;
  etaMin: number;
  score: number;
  parts: { label: string; points: number }[];
  out: string | null;
  ring: number;
};

export function distanceKm(a: [number, number], b: [number, number]): number {
  const x = (b[1] - a[1]) * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  const y = b[0] - a[0];
  return Math.sqrt(x * x + y * y) * 111.32 * 1.25;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Score and order drivers for a request with the zone's rules. Drivers who cannot take it get a reason. */
export function rankDrivers(zone: ZoneDispatch, country: CountryDispatch, request: TestRequest, drivers: readonly DriverFacts[]): Ranked[] {
  const widest = zone.radius.steps[zone.radius.steps.length - 1] ?? 8;
  const weights = new Map(zone.factors.filter((item) => item.on).map((item) => [item.id, item.weight]));
  const total = [...weights.values()].reduce((sum, value) => sum + value, 0) || 1;
  const rows = drivers.map((driver): Ranked => {
    const finishingOk = driver.finishing && (zone.finishing.radar || zone.finishing.exclusive) && weights.has("finishing") && driver.finishing.inMin <= zone.finishing.withinMin && driver.finishing.dropKm <= zone.finishing.withinKm;
    const km = round1(driver.finishing ? driver.finishing.dropKm : distanceKm([driver.lat, driver.lng], request.at));
    const etaMin = Math.max(1, Math.round((km / 24) * 60) + (driver.finishing ? driver.finishing.inMin : 0));
    const ring = zone.radius.steps.findIndex((step) => km <= step);
    let out: string | null = null;
    if (country.rest.on && driver.restNeeded) out = `Needs ${country.rest.restHours} h rest after ${country.rest.workHours} h of work`;
    else if (driver.finishing && !finishingOk) out = "On a ride that does not end close enough or soon enough";
    else if (!driver.categories.includes(request.category)) out = "Not allowed to drive this category";
    else if (request.blocked.includes(driver.id) && zone.safety.doNotMatch) out = "On the do-not-match list with this rider";
    else if (request.womenOnly && zone.safety.womenOnly && !driver.female) out = "The rider asked for a woman driver";
    else if (zone.safety.minRating && driver.rating < zone.safety.ratingBelow) out = `Rating ${driver.rating.toFixed(1)} is under ${zone.safety.ratingBelow}`;
    else if (zone.safety.maxCancel && driver.cancelPct > country.cancelRateLimitPct) out = `Cancel rate ${driver.cancelPct}% is over the ${country.cancelRateLimitPct}% limit`;
    else if (zone.fairness.hourCap && driver.ridesThisHour >= zone.fairness.hourRides) out = `Already had ${driver.ridesThisHour} rides this hour (cap ${zone.fairness.hourRides})`;
    else if (zone.fairness.skipPause && driver.skipsInRow >= zone.fairness.skips) out = `Paused ${zone.fairness.pauseMin} min after ${driver.skipsInRow} skipped offers`;
    else if (zone.autoOffline.on && driver.noInRow >= zone.autoOffline.after) out = `Went offline after ${driver.noInRow} offers not accepted in a row`;
    else if (zone.decline.on && driver.noInRow >= zone.decline.pauseAfter) out = `Paused ${zone.decline.pauseMin} min after ${driver.noInRow} no's in a row`;
    else if (zone.goingHome.on && driver.goingHome && !driver.homeDirectionOk) out = "Going home, and this ride is the other way";
    else if (request.extras.some((extra) => zone.extras.find((item) => item.id === extra)?.on && extra !== "long_trip" && !driver.extras.includes(extra))) out = "Does not have what the rider asked for";
    else if (km > widest) out = `Too far: ${km} km (widest search ${widest} km)`;
    const parts: { label: string; points: number }[] = [];
    const add = (id: FactorId, label: string, ratio: number) => {
      const weight = weights.get(id);
      if (weight) parts.push({ label, points: Math.round((weight / total) * 100 * Math.max(0, Math.min(1, ratio))) });
    };
    add("eta", `${etaMin} min to pickup`, 1 - etaMin / 20);
    add("rating", `rating ${driver.rating.toFixed(1)}`, (driver.rating - 3.5) / 1.5);
    add("acceptance", `accepts ${driver.acceptancePct}%`, driver.acceptancePct / 100);
    add("cancel", `cancels ${driver.cancelPct}%`, 1 - driver.cancelPct / 30);
    add("idle", `waited ${driver.idleMin} min`, driver.idleMin / 30);
    if (finishingOk) add("finishing", `finishes in ${driver.finishing!.inMin} min nearby`, 1);
    if (driver.favourite && zone.favourite.on && km <= zone.favourite.maxKm) add("favourite", "rider's favourite", 1);
    if (zone.fairness.idleBoost && driver.idleMin >= 20) parts.push({ label: "fairness boost", points: zone.fairness.idlePoints });
    if (zone.riderCancel.on && zone.riderCancel.priority && driver.priorityUntilMin > 0) parts.push({ label: "first in line after a rider cancel", points: 25 });
    return { driver, km, etaMin, score: parts.reduce((sum, part) => sum + part.points, 0), parts, out, ring: ring < 0 ? zone.radius.steps.length : ring };
  });
  const airportFifo = zone.airport.on && zone.airport.order === "fifo";
  return rows.sort((a, b) => Number(Boolean(a.out)) - Number(Boolean(b.out))
    || (airportFifo ? (a.driver.queuePos ?? 999) - (b.driver.queuePos ?? 999) : 0)
    || b.score - a.score
    || a.km - b.km);
}

export type SimStep = { atSec: number; who: "system" | "driver" | "rider" | "admin"; title: string; detail: string };

/** What happens second by second when nobody accepts: every offer, every wider search, every message to the rider. */
export function simulate(zone: ZoneDispatch, ranked: readonly Ranked[], start: OfferMode | null): SimStep[] {
  const steps: SimStep[] = [];
  if (!start) return [{ atSec: 0, who: "system", title: "No offer", detail: "Dispatch is paused or no mode is on, so the request waits for an admin." }];
  const able = ranked.filter((row) => !row.out);
  let t = zone.batching.on ? zone.batching.seconds : 0;
  if (zone.batching.on) steps.push({ atSec: 0, who: "system", title: "Smart waiting", detail: `Collects requests for ${zone.batching.seconds} s, then matches them together.` });
  const limit = zone.radius.maxWaitMin * 60;
  let ring = 0;
  let mode: OfferMode = start;
  let tried = 0;
  // A driver who already said no to this request is not asked again on Exclusive.
  const asked = new Set<string>();
  const switched = new Set<OfferMode>();
  let guard = 0;
  while (t < limit && guard < 40) {
    guard += 1;
    const km = zone.radius.steps[ring] ?? zone.radius.steps[zone.radius.steps.length - 1];
    // A driver with a rider gets Exclusive offers only, when Exclusive while driving is on (Q18). Never Radar.
    const inRing = able.filter((row) => row.km <= km && (!row.driver.finishing || (mode === "exclusive" && zone.finishing.exclusive && zone.exclusiveWhileDriving.on)));
    if (mode === "radar") {
      const shown = inRing.slice(0, zone.radar.drivers);
      steps.push({ atSec: t, who: "driver", title: `Radar, ${km} km`, detail: shown.length ? `Shown to ${shown.length} driver${shown.length === 1 ? "" : "s"} at once for ${zone.radar.seconds} s: ${shown.map((row) => row.driver.name).join(", ")}.` : `No driver within ${km} km.` });
      t += zone.radar.seconds;
      const wider = ring < zone.radius.steps.length - 1;
      if ((zone.radar.then === "widen" || zone.radar.then === "widen_then_exclusive") && wider) ring += 1;
      else if ((zone.radar.then === "exclusive" || zone.radar.then === "widen_then_exclusive") && zone.exclusive.on && !switched.has("exclusive")) { switched.add("exclusive"); mode = "exclusive"; tried = 0; steps.push({ atSec: t, who: "system", title: "Switch to Exclusive", detail: "Nobody accepted on the radar." }); }
      else if (wider) ring += 1;
      else break;
    } else {
      const next = inRing.find((row) => !asked.has(row.driver.id));
      if (next && tried < zone.exclusive.drivers) {
        asked.add(next.driver.id);
        steps.push({ atSec: t, who: "driver", title: `Exclusive to ${next.driver.name}`, detail: `${next.km} km, ${next.etaMin} min away. ${zone.exclusive.seconds} s to accept.` });
        t += zone.exclusive.seconds;
        tried += 1;
        continue;
      }
      const wider = ring < zone.radius.steps.length - 1;
      if ((zone.exclusive.then === "widen" || zone.exclusive.then === "widen_then_radar") && wider) { ring += 1; tried = 0; steps.push({ atSec: t, who: "system", title: "Wider search", detail: `Now up to ${zone.radius.steps[ring]} km.${able.some((row) => row.km <= zone.radius.steps[ring] && !asked.has(row.driver.id)) ? "" : " No new driver in the wider area."}` }); }
      else if ((zone.exclusive.then === "radar" || zone.exclusive.then === "widen_then_radar") && zone.radar.on && !switched.has("radar")) { switched.add("radar"); mode = "radar"; steps.push({ atSec: t, who: "system", title: "Switch to Radar", detail: `${asked.size ? `${asked.size} driver${asked.size === 1 ? "" : "s"} said no.` : "No driver to try."} Many drivers see it now.` }); }
      else if (wider) { ring += 1; tried = 0; }
      else break;
    }
  }
  let end = limit;
  for (const step of zone.waiting.filter((item) => item.on).sort((a, b) => a.afterMin - b.afterMin)) {
    const at = step.afterMin * 60;
    if (at > end) break;
    const label = WAIT_KINDS.find((item) => item.id === step.kind)?.label ?? step.kind;
    steps.push({ atSec: at, who: step.kind === "alert_admin" ? "admin" : "rider", title: label, detail: step.kind === "keep_waiting" && step.extraMin ? `${step.message} (wait ${step.extraMin} more min)` : step.message });
    if (step.kind === "busy") end = at;
  }
  const shown = steps.filter((step) => step.atSec <= end);
  shown.push({ atSec: end, who: "system", title: "Search stops", detail: end < limit ? "The rider saw the busy message." : `Longest search is ${zone.radius.maxWaitMin} min.` });
  return shown.sort((a, b) => a.atSec - b.atSec);
}

export type CancelRecord = {
  id: string;
  tripId: string;
  zoneId: string;
  rider: string;
  driverId: string;
  driver: string;
  acceptedAt: string;
  cancelledAt: string;
  minutesAfterAccept: number;
  atAccept: { km: number; etaMin: number };
  atCancel: { km: number; etaMin: number };
  path: [number, number][];
  pickup: [number, number];
  /** The trip's car type and price (major units of the zone's money), for the fee of that car type. */
  category: string;
  fare: number;
};

/**
 * The rider's cancel fee for one trip in a zone: live (Radar and live Exclusive) or reservation (booked rides, Exclusive
 * reservations too), by car type. A % fee is of the trip price, rounded half-up to a whole minor unit and kept between its min and max.
 */
export function riderCancelFee(zone: ZoneDispatch, kind: CancelFeeKind, category: string, fare: number): number {
  const table = kind === "live" ? zone.riderCancel.fees : zone.reservation.riderFees;
  return cancelFeeAmount(feeRow(table, category), fare, countryOfZone(zone.zoneId));
}

/** The automatic fee decision for a rider cancel, the fee for the trip's car type, and the reason in words. */
export function cancelDecision(record: CancelRecord, zone: ZoneDispatch): { fee: boolean; why: string; closerPct: number; amount: number; freeMin: number } {
  const closerPct = record.atAccept.km > 0 ? Math.round(((record.atAccept.km - record.atCancel.km) / record.atAccept.km) * 100) : 0;
  const freeMin = feeRow(zone.riderCancel.fees, record.category).freeMin;
  const amount = riderCancelFee(zone, "live", record.category, record.fare);
  if (!zone.riderCancel.on) return { fee: false, why: tr("The smart cancel check is off in this zone."), closerPct, amount, freeMin };
  if (record.minutesAfterAccept < freeMin) return { fee: false, why: tr("Cancelled {0} min after accept, inside the free {1} min.", [record.minutesAfterAccept, freeMin]), closerPct, amount, freeMin };
  if (closerPct >= zone.riderCancel.closerPct) return { fee: true, why: tr("The driver came {0}% closer ({1} → {2} km). Fee applies.", [closerPct, record.atAccept.km, record.atCancel.km]), closerPct, amount, freeMin };
  return { fee: false, why: tr("The driver came only {0}% closer (needs {1}%). No fee.", [Math.max(0, closerPct), zone.riderCancel.closerPct]), closerPct, amount, freeMin };
}

/** Everything the backend needs, in one file: the live rules per zone, country rules, events and groups. */
export function rulesFile(book: DispatchBook, country: MarketId, at: string, thresholds: RideCheckThresholds = RIDE_CHECK_SETTINGS_DEFAULT, categories: readonly FeeCategory[] = DEFAULT_FEE_CATEGORIES) {
  const info = market(country);
  return {
    format: "movera.dispatch.rules",
    version: 1,
    exportedAt: at,
    revision: book.draftRev,
    /** Ride check numbers shared by every zone (admin Ride check triggers). */
    rideCheckThresholds: rideCheckThresholds(thresholds),
    country: { id: country, name: info.name, currency: info.currency, timeZone: info.timeZone, ...liveCountry(book, country) },
    glossary: {
      rideCheck: "When the driver and rider apps show \"Is everything OK?\". farOn: the driver tapped Finish more than rideCheckThresholds.finishFarFromDropoffKm km from the drop-off; the card opens right after finish. stopOn: no movement for more than rideCheckThresholds.longStopMinutes minutes mid-trip, not at a planned stop and not in traffic. The two numbers are the same for every zone. routeKm: this many km off the route; longerPct: the trip this much longer than expected. crashOn: a very hard stop or impact opens the card at once with Call 112 on top. Each part works only when its switch is on.",
      radar: "One request shown to the N nearest suitable drivers at once. The first to accept gets it.",
      exclusive: "One request offered to one driver at a time, best first, for a few seconds each.",
      busy: "Waiting requests divided by free online drivers in the zone.",
      score: "Each factor gives 0 to its weight; drivers are offered in order of total score.",
      radarApp: "The most Radar offers one driver sees at once, one setting per screen: the full-screen radar list (full; fullLockWhileDriving = the list cannot be opened while the car is moving, it opens again once stopped) and the offer cards over the map (popup while stopped; with popupSplitByDriving, popupWhileDriving while the car is moving). The app waits about 10 s before switching between stopped and driving, and cards never pop over navigation. No Radar offers while driving a rider.",
      autoOffline: "After this many Exclusive or hand-sent (assigned, Dispatch › send offer) offers of live trips in a row that the driver declined or let run out, sent while the driver was free, the driver is set offline (1 to 99, default 10; contract.json#autoOffline, owner G4-E2/E3). Radar offers (also admin radar groups), reservation offers and offers sent during a trip never count. Any accept or going online starts again from 0. noFixMinutes: no position for this many minutes (not during a trip) and the server sets the driver offline (0 = never, default 5).",
      offerCard: "What the driver app's offer cards show (Radar, Exclusive, the reservation popup): netFare = the driver's share instead of the full fare; dropoffAreaOnly = only the area of the drop-off; the other switches show or hide pickup address, stops, the rider's rating (riderRating: off = the server sends none; a rider with no rating shows nothing), trip minutes and km, distance to pickup and badges.",
      raisePrice: "raisePrice.maxFactor: the rider may raise the fare to at most this many times the booked fare while searching (1 to 3, default 2; owner G4-E4). The server refuses a higher raise (400 raise_too_high) and copies the limit into the zone's rider app config.",
      exclusiveReasons: "Not used since v0.18.6 (owner G4-E7): the driver app shows no 'why you' line and the server no longer sends Offer.reasonCode.",
      hiddenComesBackMin: "A trip the driver hid with × in the Live list can come back after this many minutes if nobody took it and it is still in Radar. It never counts against the driver.",
      exclusiveWhileDriving: "While driving a rider the driver gets Exclusive offers only (at most count at a time), never Radar trips.",
      pickupWait: "Waiting at pickup. Free wait, price per minute and the no-show fee come from Pricing per category (one source); the driver can cancel for no-show when the free wait ends (Q41). Then rideTypes (scheduled, airport, event; a scheduled ride's free wait is the reservation policy's included waiting) and farPickup (pickups over farPickupKm). A later rule wins where it sets a value; null = same as before. The waiting money goes 100% to the driver; country.noShowDriverSharePct is the driver's part of the no-show fee.",
      destinationMode: "driverApp.destinationMode[zoneId]: enabled = the whole Destination mode. timeLimitOn/timeLimitHours: how long a destination stays active. dailyLimitOn/destinationsPerDay: destinations one driver can set per day. corridorOn/corridorKm: a trip qualifies when its drop-off is within corridorKm of the driver's road route to the destination AND the trip brings the driver closer. focusFinalDestinationOn: trips ending near the destination; focusOnTheWayOn: trips along the route; focus = both, final, onTheWay or none. A part whose switch is off has no limit.",
      nextTrips: "driverApp.nextTrips[zoneId]: while driving a rider only Exclusive offers and Exclusive reservations come as next trips (offerTypes), never Radar cards, and only on the way to the final drop-off, never while heading to a stop or before pickup. Offers start within withinKmOfDropoff km (withinKmOfDropoffOn) or withinMinutesOfDropoff minutes (withinMinutesOfDropoffOn) of the final drop-off, whichever comes first (startWhen either); both off = the whole last leg (startWhen wholeLastLeg). A destination the driver sets during a trip uses destinationMode. The demo keeps today's next-trip behaviour (no limits).",
      driverApp: "driverApp has the same values in the driver app's shapes: cancelReasons per language with English filled in where a language is empty, destinationMode and nextTrips per zone.",
      countryRules: "country.rest: work and rest hours, warnings warnFirstMin and warnLastMin before the limit, blockOnline at the limit. country.cancelRateLimitPct: the cancel rate drivers should stay under, never shown to drivers (they see a rule text). It is the only cancel rate number: in zones where safety.maxCancel is on, drivers over it get no requests. Only normal-trip cancels count, without pause or fee; reasons with counts=false never count. country.cancelReasons: per group and language (en, sv, fr, ar); an empty language uses English.",
      reservationWho: "listTo group = only the drivers of the saved group listGroupId (groups below). homePopupTo: list = the same drivers as the list, zone = every online driver in the zone. popupClosedExclusive: a driver who closed the Home popup with × can get it back as an Exclusive if nobody took it.",
      smartGap: "A driver cannot hold two scheduled rides whose times are the same or close. Gap = the first ride's trip time + the drive to the next pickup + types[kind].spareMin. With hideClashing, once a driver takes one, the rides that do not fit leave that driver's list (they still see them all before taking one).",
      leaveNow: "Leave now: at the driver's estimated drive time to the pickup + types[kind].spareMin before pickup, the ride always lands on the driver's screen as the active trip with Head to pickup (no switch, contract v0.4.2). lateWarn: when Leave now cannot start the trip (driver offline or busy), an island warning at once. lateBackupAfterMin: only an offline driver loses the ride that many minutes after Leave now; an online driver keeps it. lateEta: from Leave now until arrival the driver's ETA is checked every checkEverySeconds; when now + ETA is later than pickup + toleranceMin the ride goes early to reassignTo (exclusive, radar or dispatch). towardPickup: from towardPickupBeforeMin before pickup, offers head toward the scheduled pickup, each checked with the smart gap.",
      rideTypes: "types: normal, airport, long (over longTripKm), premium (Comfort and Premium) and event, each with onlineBeforeMin, spareMin and two reminders (remindFirstMin, remindLastMin) before pickup.",
      riderCancelFees: "Rider cancel fees per car type (Pricing's category ids; a car type without its own row uses the economy row), two sets. riderCancel.fees = live trips (Radar and live Exclusive): free for freeMin minutes after the driver accepts. reservation.riderFees = booked rides, Exclusive reservations too: free until freeMin minutes before pickup. Then the fee: type fixed = value in country money (major units); type percent = value % of the trip price, rounded half-up to a whole minor unit (öre, cent, millime), then kept between min and max (major units, null = no limit).",
      reservationCancels: "Drivers never pay. Riders cancel for free and then pay the late cancel fee by car type, see riderCancelFees. A driver cancel under driverLateCancelHours before pickup is a late cancel; latePauseAfter late cancels in latePeriodDays = no scheduled rides for latePauseDays. Every driver cancel counts in the cancel rate.",
      showDriverOnAccept: "true = the rider sees the driver's name, photo and car as soon as a driver accepts, and the new driver if it changes.",
      raiseFare: "No driver near pickup: an admin can raise the driver's fare up to raiseMax (country money, never over 500 kr or the same value in local money). It is paid from Movera's commission; the admin sees when it goes beyond it. The rider pays the same.",
      riderApp: "riderApp[zoneId] is what the rider app reads at GET /api/v1/rider/scheduled-rides/rules: {freeCancelMinutesBeforePickup, lateCancelFeeMinor, currency, showDriverOnAccept, byCategory}. byCategory[car type] = {freeCancelMinutesBeforePickup, feeType fixed|percent, feeMinor, feePct, minFeeMinor, maxFeeMinor} (minor units, null = not used). The top-level free time and fee are the Economy row, for older rider apps.",
      assignAccept: "An admin gives the ride to one driver: it comes like an Exclusive, labelled Assigned by Movera, with assignAcceptSec seconds to accept. Not accepted: the admin sees it and picks someone else.",
      reservation: "A ride booked for later. Nobody took it yet: first in Scheduled rides (for listTo drivers), then also the Home popup homePopupAfterMin minutes after booking, then Exclusive exclusiveBeforeMin minutes before pickup, then also Radar trips radarBeforeMin minutes before pickup (never labelled Exclusive there). When a driver takes it, it leaves every other driver's app at once.",
      reservationCancel: "onDriverCancel: where it goes back when the driver who took it cancels. byTime = the step the time says; list = Scheduled rides, the Home popup waits again from the cancel; home or exclusive = that step at once. A step closer to pickup always wins.",
      reservationTie: "Several drivers take it at the same time: the first tap wins; at exactly the same moment the server picks one at random. The server decides, never the app.",
    },
    zones: info.zones.map((zone) => ({ id: zone.id, name: zone.name, kind: zone.kind, control: book.control[zone.id] ?? { paused: false, mode: null }, rules: liveRules(book, zone.id) })),
    events: book.events.filter((event) => event.country === country),
    groups: book.groups.filter((group) => group.country === country),
    riderApp: Object.fromEntries(info.zones.map((zone) => [zone.id, riderScheduledRules(liveRules(book, zone.id).reservation, country, categories)])),
    driverApp: {
      cancelReasons: Object.fromEntries(LANG_LIST.map((lang) => [lang.id, cancelReasonsFor(liveCountry(book, country).cancelReasons, lang.id)])),
      destinationMode: Object.fromEntries(info.zones.map((zone) => [zone.id, destinationModeForDriverApp(liveRules(book, zone.id).destinationMode)])),
      nextTrips: Object.fromEntries(info.zones.map((zone) => [zone.id, nextTripsForDriverApp(liveRules(book, zone.id).nextTrips)])),
    },
  };
}
