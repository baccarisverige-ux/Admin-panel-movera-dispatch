import { z } from "zod";
import { formatMoney } from "./money.ts";

export { CURRENCIES, formatMoney, isMoney, moneySchema, toMajorString, type CurrencyCode, type Money } from "./money.ts";

/** Version of the shared Movera contract this admin follows (contracts/contract.json). */
export const CONTRACT_VERSION = "0.10.0" as const;

/** The 19 trip statuses of contract v0.3.0 (contract.json#tripStatus.values), in lifecycle order. */
export const TRIP_STATUSES = [
  "draft",
  "quoted",
  "requested",
  "searching",
  "offered",
  "accepted",
  "driver_to_pickup",
  "arrived",
  "rider_onboard",
  "in_trip",
  "approaching_dropoff",
  "completed",
  "cancelled_by_rider",
  "cancelled_by_driver",
  "cancelled_by_admin",
  "cancelled_by_system",
  "no_show",
  "expired",
  "failed",
] as const;

export const tripStatusSchema = z.enum(TRIP_STATUSES);
export type TripStatus = z.infer<typeof tripStatusSchema>;

/** Statuses after which the trip lifecycle never moves again (contract.json#tripStatus.terminal). */
export const TERMINAL_STATUSES = [
  "completed",
  "cancelled_by_rider",
  "cancelled_by_driver",
  "cancelled_by_admin",
  "cancelled_by_system",
  "no_show",
  "expired",
  "failed",
] as const satisfies readonly TripStatus[];

/** A driver is on the trip (contract.json#tripStatus.driverAssigned). */
export const DRIVER_ASSIGNED_STATUSES = ["accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"] as const satisfies readonly TripStatus[];

/** The rider is in the car (contract.json#tripStatus.riderOnboard). */
export const RIDER_ONBOARD_STATUSES = ["rider_onboard", "in_trip", "approaching_dropoff"] as const satisfies readonly TripStatus[];

export function isTripStatus(value: unknown): value is TripStatus {
  return typeof value === "string" && (TRIP_STATUSES as readonly string[]).includes(value);
}

/** True for a terminal status. Unknown strings are not terminal. */
export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export const ACTORS = ["rider", "driver", "admin", "system"] as const;
export type Actor = (typeof ACTORS)[number];
export type TripKind = "live" | "scheduled";

export type TripCommand =
  | "quote" | "request" | "start_search" | "raise_price" | "send_offer" | "offer_lapsed" | "accept" | "assign"
  | "head_to_pickup" | "arrive" | "board" | "start_trip" | "near_dropoff" | "complete"
  | "cancel" | "end_early" | "no_show" | "reassign" | "expire" | "system_cancel" | "fail";

export type Transition = {
  command: TripCommand;
  actor: Actor;
  from: readonly TripStatus[];
  to: TripStatus;
  /** Set only where the target differs between live and scheduled trips. */
  when?: TripKind;
};

const ACTIVE: readonly TripStatus[] = ["requested", "searching", "offered", "accepted", "driver_to_pickup", "arrived", "rider_onboard", "in_trip", "approaching_dropoff"];

/**
 * The single trip state machine, mirroring contract.json#transitions entry for entry (same order).
 * `src/domain/contract.test.ts` asserts equality with the shared file and replays fixtures/scenarios.json.
 */
export const TRANSITIONS: readonly Transition[] = [
  { command: "quote", actor: "system", from: ["draft"], to: "quoted" },
  { command: "request", actor: "rider", from: ["quoted"], to: "requested" },
  { command: "start_search", actor: "system", from: ["requested"], to: "searching" },
  // v0.5.5: the rider raises their offer while the search is on; a new search starts.
  { command: "raise_price", actor: "rider", from: ["searching", "offered"], to: "searching" },
  { command: "send_offer", actor: "system", from: ["searching"], to: "offered" },
  { command: "offer_lapsed", actor: "system", from: ["offered"], to: "searching" },
  { command: "accept", actor: "driver", from: ["offered"], to: "accepted" },
  { command: "accept", actor: "driver", from: ["requested"], to: "accepted", when: "scheduled" },
  { command: "assign", actor: "admin", from: ["requested", "searching", "offered"], to: "offered" },
  { command: "head_to_pickup", actor: "driver", from: ["accepted"], to: "driver_to_pickup" },
  { command: "arrive", actor: "driver", from: ["driver_to_pickup"], to: "arrived" },
  { command: "board", actor: "driver", from: ["arrived"], to: "rider_onboard" },
  { command: "start_trip", actor: "driver", from: ["rider_onboard"], to: "in_trip" },
  { command: "near_dropoff", actor: "system", from: ["in_trip"], to: "approaching_dropoff" },
  { command: "complete", actor: "driver", from: ["in_trip", "approaching_dropoff"], to: "completed" },
  { command: "complete", actor: "admin", from: ["rider_onboard", "in_trip", "approaching_dropoff"], to: "completed" },
  { command: "cancel", actor: "rider", from: ["requested", "searching", "offered", "accepted", "driver_to_pickup", "arrived"], to: "cancelled_by_rider" },
  { command: "end_early", actor: "rider", from: ["rider_onboard", "in_trip", "approaching_dropoff"], to: "cancelled_by_rider" },
  { command: "cancel", actor: "driver", from: ["accepted", "driver_to_pickup", "arrived"], to: "searching", when: "live" },
  { command: "cancel", actor: "driver", from: ["accepted"], to: "requested", when: "scheduled" },
  { command: "cancel", actor: "driver", from: ["driver_to_pickup", "arrived"], to: "searching", when: "scheduled" },
  { command: "cancel", actor: "driver", from: ["rider_onboard", "in_trip", "approaching_dropoff"], to: "cancelled_by_driver" },
  { command: "no_show", actor: "driver", from: ["arrived"], to: "no_show" },
  { command: "no_show", actor: "admin", from: ["arrived", "accepted", "driver_to_pickup"], to: "no_show" },
  { command: "reassign", actor: "admin", from: ["offered", "accepted", "driver_to_pickup", "arrived"], to: "searching" },
  { command: "cancel", actor: "admin", from: ["draft", "quoted", ...ACTIVE], to: "cancelled_by_admin" },
  { command: "expire", actor: "system", from: ["quoted", "requested", "searching", "offered"], to: "expired" },
  { command: "system_cancel", actor: "system", from: ["requested", "searching", "offered", "accepted"], to: "cancelled_by_system" },
  { command: "fail", actor: "system", from: ACTIVE, to: "failed" },
];

/**
 * Where `command` by `actor` takes a trip in `status`, or null when the contract says
 * `invalid_transition` (the status then stays the same). Same rule as contracts/reference_check.py.
 */
export function nextStatus(status: string, command: TripCommand, actor: Actor, kind: TripKind = "live"): TripStatus | null {
  for (const rule of TRANSITIONS) {
    if (rule.command === command && rule.actor === actor && (rule.from as readonly string[]).includes(status) && (rule.when ?? kind) === kind) return rule.to;
  }
  return null;
}

/** One row of contract.json#ratingAllowed.rules: `rater` may rate a trip that ended in `status`, through `command` when set. */
export type RatingRule = { rater: "rider" | "driver"; status: TripStatus; command?: TripCommand };

/**
 * Who may rate a finished trip (contract.json#ratingAllowed, same order). The rider also rates a trip they ended early
 * (`end_early` → cancelled_by_rider); a plain rider `cancel` is never rated. Anything else is `invalid_transition`.
 */
export const RATING_ALLOWED: readonly RatingRule[] = [
  { rater: "rider", status: "completed" },
  { rater: "driver", status: "completed" },
  { rater: "rider", status: "cancelled_by_rider", command: "end_early" },
];

/** Whether `rater` may rate a trip in `status` that `endedBy` (the command that ended it, when known) brought there. */
export function ratingAllowed(rater: "rider" | "driver", status: string, endedBy?: TripCommand): boolean {
  return RATING_ALLOWED.some((rule) => rule.rater === rater && rule.status === status && (rule.command === undefined || rule.command === endedBy));
}

/** Every status `command` by `actor` may start from (any trip kind), in lifecycle order. */
export function statesFor(command: TripCommand, actor: Actor): TripStatus[] {
  const from = new Set(TRANSITIONS.filter((rule) => rule.command === command && rule.actor === actor).flatMap((rule) => rule.from));
  return TRIP_STATUSES.filter((status) => from.has(status));
}

/** Cancel reason codes per group (contract.json#cancelReasons). Texts live in Dispatch › Cancel reasons. */
export const CANCEL_REASON_CODES = {
  rider: ["pickup_incorrect", "wrong_ride_option", "requested_by_mistake", "wait_too_long", "destination_change", "driver_not_suitable", "plans_changed", "something_else"],
  driverBeforeTrip: ["rider_requested_cancel", "rider_not_at_pickup", "unsafe_pickup", "vehicle_issue_before_start", "driver_emergency_before_start", "other_before_start"],
  driverDuringTrip: ["rider_requested_early_end", "safety_concern_on_trip", "vehicle_issue_on_trip", "accident_or_road_emergency", "rider_behavior", "trip_or_destination_issue", "other_on_trip"],
  driverNextTrip: ["next_trip_current_running_late", "next_trip_pickup_too_far", "next_trip_rider_requested", "next_trip_vehicle_issue", "next_trip_driver_emergency", "next_trip_other"],
  scheduled: ["scheduled_cannot_make_time", "scheduled_vehicle_issue", "scheduled_personal_emergency", "scheduled_pickup_too_far", "scheduled_trip_details", "scheduled_other"],
  noShow: ["rider_no_show"],
  admin: ["admin_safety", "admin_fraud", "admin_rider_request", "admin_driver_request", "admin_operational", "admin_other"],
  system: ["system_no_driver", "system_payment_failed", "system_zone_closed", "system_error"],
} as const;

export type CancelReasonGroup = keyof typeof CANCEL_REASON_CODES;
export type CancelReasonCode = (typeof CANCEL_REASON_CODES)[CancelReasonGroup][number];
export type AdminCancelReasonCode = (typeof CANCEL_REASON_CODES)["admin"][number];

/** Which reason groups each actor may send with a cancel (the backend validates reasonCode per actor). */
export const CANCEL_REASON_GROUPS_BY_ACTOR: Record<Actor, readonly CancelReasonGroup[]> = {
  rider: ["rider"],
  driver: ["driverBeforeTrip", "driverDuringTrip", "driverNextTrip", "scheduled", "noShow"],
  admin: ["admin"],
  system: ["system"],
};

export function isCancelReasonCode(code: string, actor?: Actor): code is CancelReasonCode {
  const groups = actor ? CANCEL_REASON_GROUPS_BY_ACTOR[actor] : (Object.keys(CANCEL_REASON_CODES) as CancelReasonGroup[]);
  return groups.some((group) => (CANCEL_REASON_CODES[group] as readonly string[]).includes(code));
}

/** Seven category ids. `economy` is the Movera alias shown in the apps. */
export const CATEGORIES = [
  { id: "economy", label: "Movera", seats: 4 },
  { id: "comfort", label: "Comfort", seats: 4 },
  { id: "premium", label: "Premium", seats: 4 },
  { id: "priority", label: "Priority", seats: 4 },
  { id: "xl", label: "XL", seats: 6 },
  { id: "electric", label: "Electric", seats: 4 },
  { id: "pet", label: "Pet", seats: 4 },
] as const;

export const categoryIdSchema = z.enum([
  "economy",
  "comfort",
  "premium",
  "priority",
  "xl",
  "electric",
  "pet",
]);

/** contract.json#paymentMethods (v0.4.0, owner Q7): no swish, no d17. `wallet` is the per-currency balance, used first. */
export const PAYMENT_METHODS = [
  "card",
  "apple_pay",
  "google_pay",
  "cash",
  "wallet",
] as const;

/** @deprecated The admin is multi-market: use the zone's market currency and `Money` (domain/money.ts). Default market only. */
export const CURRENCY = "SEK" as const;
export const TIME_ZONE = "Europe/Stockholm" as const;

/** Whole kronor to öre. */
export function kronorToOre(kronor: number): number {
  return Math.round(kronor * 100);
}

/** @deprecated SEK only. Use `formatMoney({ amountMinor, currency })`. Kept with its exact old output ("1234,50 kr", no grouping). */
export function formatOre(ore: number): string {
  return formatMoney({ amountMinor: ore, currency: "SEK" }, "sv-SE", { grouping: false });
}
