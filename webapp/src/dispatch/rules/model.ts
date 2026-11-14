import { market, type MarketId } from "../../markets/markets.ts";
import { PICKUP_MOVE_RANGE } from "../offerRules.ts";
import { DEFAULT_FEE_CATEGORIES, RESERVATION_FREE_MAX_MIN, feeRow, type CancelFeeTable, type CancelFeeType, type FeeCategory } from "../cancelFees.ts";
import { type CancelReasonBook, type ExclusiveReason, type ExclusiveReasonId, type OfferCardDetails, type PickupWait } from "../offers.ts";
import { type DestinationModeRules, type NextTripRules } from "../tripRules.ts";

/** Dispatch rules, part: Types, option lists, limits and the small helpers for one zone's rules (was rules.ts lines 22–587). rules.ts re-exports everything; import from "../rules.ts" as before. */
/** Dispatch rules: how a ride request finds its driver. One set per zone, plus country rules, events and driver groups. */

/** v0.18.10 (G8 Q2, contract.json#finish.earlyEnd.settings): defaults and ranges. */
/** v0.18.58 §80: + arrivedWithinMeters (300, 50–2000) and airportArrivedWithinMeters (1000, 100–3000, never below the normal one). */
export type EarlyEnd = { repriceOverKm: number; repriceOverMin: number; arrivedWithinMeters: number; airportArrivedWithinMeters: number };
/** v0.18.33 (fix job 5, owner fix-plan Q1): minutes default 10, and the rule is BOTH (km AND minutes). */
export const EARLY_END_DEFAULT: EarlyEnd = { repriceOverKm: 2, repriceOverMin: 10, arrivedWithinMeters: 300, airportArrivedWithinMeters: 1000 };
export const EARLY_END_LIMITS = { repriceOverKm: { min: 0, max: 50 }, repriceOverMin: { min: 0, max: 120 }, arrivedWithinMeters: { min: 50, max: 2000 }, airportArrivedWithinMeters: { min: 100, max: 3000 } } as const;
export function completeEarlyEnd(stored: unknown): EarlyEnd {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const pick = (key: keyof EarlyEnd) => {
    const v = raw[key];
    return typeof v === "number" && Number.isFinite(v) && v >= EARLY_END_LIMITS[key].min && v <= EARLY_END_LIMITS[key].max ? v : EARLY_END_DEFAULT[key];
  };
  const arrived = pick("arrivedWithinMeters");
  const airport = pick("airportArrivedWithinMeters");
  const pair = airport >= arrived ? { arrivedWithinMeters: arrived, airportArrivedWithinMeters: airport } : { arrivedWithinMeters: EARLY_END_DEFAULT.arrivedWithinMeters, airportArrivedWithinMeters: EARLY_END_DEFAULT.airportArrivedWithinMeters };
  return { repriceOverKm: pick("repriceOverKm"), repriceOverMin: pick("repriceOverMin"), ...pair };
}

/** v0.18.58 §80 (contract.json#arrivedDistance): the arrived distances out of range, or airport below normal (server 400 invalid_arrived_distance). */
export function arrivedDistanceIssues(earlyEnd: Partial<EarlyEnd> | undefined): string[] {
  if (!earlyEnd) return [];
  const issues: string[] = [];
  const inRange = (key: "arrivedWithinMeters" | "airportArrivedWithinMeters") => {
    const v = earlyEnd[key];
    return v === undefined || (Number.isInteger(v) && v >= EARLY_END_LIMITS[key].min && v <= EARLY_END_LIMITS[key].max);
  };
  if (!inRange("arrivedWithinMeters")) issues.push("Ended early: counts as arrived must be 50 to 2000 m.");
  if (!inRange("airportArrivedWithinMeters")) issues.push("Ended early: at an airport, counts as arrived must be 100 to 3000 m.");
  if ((earlyEnd.airportArrivedWithinMeters ?? EARLY_END_DEFAULT.airportArrivedWithinMeters) < (earlyEnd.arrivedWithinMeters ?? EARLY_END_DEFAULT.arrivedWithinMeters)) issues.push("Ended early: the airport distance must not be below the normal one.");
  return issues;
}

export const DISPATCH_KEY = "dispatchRules";

export type OfferMode = "radar" | "exclusive";
export type StartMode = "auto" | "radar" | "exclusive" | "both" | "byDistance";
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
export type ReservationListTo = "all" | "category" | "rating" | "random" | "homeNear" | "nearNow" | "favourites" | "areaRegulars" | "group" | "nearAtTime";
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
  { id: "homeNear", label: "Home near pickup", help: "Drivers whose home area (set by the driver in the app) is near the pickup, within the distance you set. Good for early-morning rides." },
  { id: "nearNow", label: "Near pickup now", help: "Drivers who are near the pickup when the rider books, within the distance you set." },
  { id: "favourites", label: "Rider's favourites", help: "Drivers this rider marked as favourite after a ride." },
  { id: "nearAtTime", label: "Near pickup at that time", help: "Drivers whose last booked ride ends near the pickup just before its time, within the distance and minutes you set." },
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

/** v0.18.17 (contract.json#bookLater): the zone's booking policy, every value an admin setting with the owner's defaults. */
export type BookingWindow = {
  /** Q1: the earliest pickup, minutes after booking (default 15). */
  minAheadMin: number;
  /** Q1: the latest pickup, days after booking (default 90). */
  maxAheadDays: number;
  /** Q2: closer than this, the ride goes out at once like a live ride (default 30). */
  soonBeforeMin: number;
  /** Q2: the reservation notice at booking, to at most noticeMaxDrivers of the drivers who see it. */
  noticeOn: boolean;
  noticeMaxDrivers: number;
  /** Q3: no driver this many minutes before pickup → admin alert + rider told (default 10). */
  noDriverAlertMin: number;
  /** Q5 rider: reminder this many minutes before pickup (default 60; 0 = off). */
  riderReminderMin: number;
  /** Q6: change or cancel free only more than this many minutes before pickup (default 60). */
  freeChangeBeforeMin: number;
  /** The demo admin's Max Trip Distance (Reservations): the longest booked ride; null = no limit (owner BL-Q5, default). */
  maxTripKm: number | null;
  /** BL-Q6: minutes the driver has to answer "Keep it at the new time?" (default 15). */
  changeAnswerMin: number;
  /** BL-Q4 "Near pickup at that time": the last ride ends within this many km, at most this many minutes before. */
  listAtTimeKm: number;
  listAtTimeMin: number;
  /** Owner (v0.18.19): arrive this many minutes before the pickup time; the server works out when to start (default 10). */
  arriveEarlyMin: number;
  /**
   * v0.18.35 FIX JOB 4 (contract.json#bookedTakeBack, owner Q2 / Q-B / fix-plan Q2): a held booked ride is taken back only
   * when the driver would be MORE than takeBackLateMin late, is MORE than takeBackKeepIfDriveMin minutes' drive away, and
   * the pickup is at least takeBackUntilMinBeforePickup minutes away. Published in DriverAppConfig.reservations.
   */
  takeBackLateMin: number;
  takeBackKeepIfDriveMin: number;
  takeBackUntilMinBeforePickup: number;
  /** v0.18.35 (owner Q-A, job 4 Q4): "You are not driving towards the rider" every N minutes; published in DriverAppConfig.headingCheck. */
  notHeadingNotice: boolean;
  /** v0.18.39 §63 (P17, owner "15 min after pickup past"): a booked ride with no driver ends this many minutes after its pickup time (no fee). */
  noDriverStopAfterMin: number;
  notHeadingNoticeEveryMin: number;
  /** v0.18.81 B1.34 (contract.json#bookLater.riderCap, owner Q94 "A) Yes", 2026-11-13): booked rides a rider may hold that have not ended (default 3, 1-50). */
  maxOpenPerRider: number;
};

export const BOOKING_WINDOW_DEFAULT: BookingWindow = { minAheadMin: 15, maxAheadDays: 90, soonBeforeMin: 30, noticeOn: true, noticeMaxDrivers: 20, noDriverAlertMin: 10, riderReminderMin: 60, freeChangeBeforeMin: 60, maxTripKm: null, changeAnswerMin: 15, listAtTimeKm: 5, listAtTimeMin: 30, arriveEarlyMin: 10, takeBackLateMin: 5, takeBackKeepIfDriveMin: 10, takeBackUntilMinBeforePickup: 15, notHeadingNotice: true, notHeadingNoticeEveryMin: 1, noDriverStopAfterMin: 15, maxOpenPerRider: 3 };

/** Limits for each booking window number (contract.json#bookLater, gen_openapi DriverReservations). */
export const BOOKING_LIMITS: Record<Exclude<keyof BookingWindow, "noticeOn" | "maxTripKm" | "notHeadingNotice">, { min: number; max: number }> = {
  minAheadMin: { min: 5, max: 240 }, maxAheadDays: { min: 1, max: 365 }, soonBeforeMin: { min: 0, max: 240 }, noticeMaxDrivers: { min: 1, max: 500 },
  noDriverAlertMin: { min: 1, max: 120 }, riderReminderMin: { min: 0, max: 1440 }, freeChangeBeforeMin: { min: 0, max: 1440 },
  changeAnswerMin: { min: 1, max: 120 }, listAtTimeKm: { min: 0.5, max: 50 }, listAtTimeMin: { min: 5, max: 240 },
  arriveEarlyMin: { min: 0, max: 60 },
  takeBackLateMin: { min: 1, max: 60 }, takeBackKeepIfDriveMin: { min: 0, max: 60 }, takeBackUntilMinBeforePickup: { min: 0, max: 180 }, notHeadingNoticeEveryMin: { min: 1, max: 10 },
  noDriverStopAfterMin: { min: 1, max: 240 },
  maxOpenPerRider: { min: 1, max: 50 },
};
export const MAX_TRIP_KM_LIMIT = { min: 1, max: 1000 };

export const BOOKING_LABELS: Record<keyof typeof BOOKING_LIMITS, string> = {
  minAheadMin: "book from (minutes ahead)", maxAheadDays: "book up to (days ahead)", soonBeforeMin: "sent at once under (minutes ahead)", noticeMaxDrivers: "drivers who get the notice",
  noDriverAlertMin: "no-driver alert (minutes before pickup)", riderReminderMin: "rider reminder (minutes before pickup)", freeChangeBeforeMin: "free change (minutes before pickup)",
  changeAnswerMin: "time to answer a changed ride (minutes)", listAtTimeKm: "near pickup at that time (km)", listAtTimeMin: "near pickup at that time (minutes)",
  arriveEarlyMin: "arrive before pickup (minutes)",
  takeBackLateMin: "take back when late more than (minutes)", takeBackKeepIfDriveMin: "keep if the driver is within (minutes' drive)", takeBackUntilMinBeforePickup: "take back only until (minutes before pickup)", notHeadingNoticeEveryMin: "not-heading notice every (minutes)",
  noDriverStopAfterMin: "stop a booked ride with no driver after pickup + (minutes)",
  maxOpenPerRider: "open booked rides per rider",
};

export function completeBookingWindow(raw: unknown): BookingWindow {
  const own = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const next = { ...BOOKING_WINDOW_DEFAULT };
  if (typeof own["noticeOn"] === "boolean") next.noticeOn = own["noticeOn"];
  if (typeof own["notHeadingNotice"] === "boolean") next.notHeadingNotice = own["notHeadingNotice"];
  // BL-Q5: null (or a missing value) = no limit.
  const km = own["maxTripKm"];
  next.maxTripKm = typeof km === "number" && Number.isFinite(km) && km >= MAX_TRIP_KM_LIMIT.min && km <= MAX_TRIP_KM_LIMIT.max ? km : null;
  for (const [key, limit] of Object.entries(BOOKING_LIMITS) as [keyof typeof BOOKING_LIMITS, { min: number; max: number }][]) {
    const value = own[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= limit.min && value <= limit.max) next[key] = value;
  }
  return next;
}

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
  /** v0.18.17 Book later (owner 2026-11-03 Q1–Q6, contract.json#bookLater), saved on the server in the zone's driver document. */
  booking: BookingWindow;
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
  /** v0.18.9 (owner 2026-11-01, rule 16): steps = the mode's own search distance steps; missing = the shared search distance. */
  radar: { on: boolean; drivers: number; seconds: number; then: "widen" | "exclusive" | "widen_then_exclusive"; steps?: number[] };
  exclusive: { on: boolean; seconds: number; drivers: number; then: "radar" | "widen" | "widen_then_radar"; steps?: number[] };
  /**
   * v0.18.9 (owner 2026-11-01 "choose which starts first", DispatchDocument.start): auto = Which mode runs decides (as before);
   * radar / exclusive = that mode first; byDistance = Exclusive first when the nearest not-yet-asked driver (smallest km, not the best score) is within nearKm, else Radar;
   * both = Exclusive to the best driver and Radar to the next ones at the same time.
   */
  start: { mode: StartMode; nearKm: number };
  /** v0.18.9: farthest pickup in km (0 = the widest search step) and longest pickup time in min (0 = off). */
  limits: { maxPickupKm: number; maxPickupEtaMin: number; farReachKm: number };
  /**
   * v0.18.39 §63 (owner N2 "'No driver nearby' after 5 min", per zone): a live ride still without a driver afterSec seconds
   * after its search started shows the rider the message once (Keep waiting / Cancel free); the search goes on.
   */
  noDriverNearby: { on: boolean; afterSec: number; message: string };
  /** v0.18.39 §63 (boss 1 for the owner): a driver who let this many offers of a trip pass is not asked again in that search (1–5, default 2). */
  reaskLimit: number;
  /** v0.18.9: drivers of these zones also get offers from search step afterStep (0 = the last step). */
  neighbours: { on: boolean; zoneIds: string[]; afterStep: number };
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
  /** v0.18.33 (fix job 5, owner Q7): a driver on a trip can get a booked ride starting within withinMin minutes (Exclusive only). DispatchDocument.bookedNext. */
  bookedNext: { on: boolean; withinMin: number };
  /** Q19/Q20: waiting at pickup. The free wait, price per minute and no-show fee per category come from Pricing. */
  pickupWait: PickupWait;
  reservation: ReservationRules;
  /** backup: deprecated (v0.18.9), never used by the server; no longer shown. Kept so older saves and documents still read. */
  choose: { how: "auto" | "manual"; radarAbove: number; main: OfferMode; backup?: OfferMode | "none"; times: TimeRule[] };
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
  /** v0.18.10 (G8 Q2): earlyEnd = DriverAppConfig.cancelFees.earlyEnd — a driver's early end re-prices only when more than repriceOverKm km AND more than repriceOverMin min shorter (v0.18.33 BOTH; default 2 / 10). */
  /** BQ-V22 (owner G5-8): headingPct / notHeadingMinutes = DriverAppConfig.headingCheck of the zone (default 80 % / 2 min). */
  riderCancel: { on: boolean; priority: boolean; priorityMin: number; fees: CancelFeeTable; driverSharePct: number; earlyEnd: EarlyEnd; headingPct: number; notHeadingMinutes: number };
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
  /**
   * FIX JOB 7 (owner Q9 "Warn him but can accept booking", contract v0.18.30 contract.json#smallFixes.samePoint):
   * "Shortest ride (m)": the rider is warned (and can still book) when pickup and drop-off are this close. 0 = never warn.
   * Optional so rules saved before v0.18.30 still load (the default is used then).
   */
  samePoint?: { warnMeters: number };
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
  /**
   * SV (decisions/driving-time-limits.md:2-4; contract.json#drivingLimits): workHours = DriverAppConfig.drivingLimits.maxHoursPerDay
   * (driving only, 0-24, 0 = no limit, default 12); resetAfterOfflineHours = "6 hours offline so reset all time" (1-24,
   * default 6); restMinutes = the break length the app shows (contract default 30, not enforced). Older saves had restHours
   * (the rest = the reset): completeCountry moves it to resetAfterOfflineHours.
   */
  rest: { on: boolean; workHours: number; restMinutes: number; resetAfterOfflineHours: number; warnFirstMin: number; warnLastMin: number; blockOnline: boolean };
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

