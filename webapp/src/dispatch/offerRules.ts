import contract from "../../../contracts/contract.json" with { type: "json" };
import type { AppLanguage } from "../config/zoneDefaults.ts";
import { currentLanguage, fill } from "../i18n/core.ts";

/**
 * Driver group 4 (contract v0.18.6, Rules decisions/driver-g4.md): the offer rules the admin sets per zone, read from
 * the shared contract so the panel, the server and the apps say the same.
 */

/**
 * Owner G4-E4 "2×, admin can change (Recommended)": the rider may raise the fare to at most maxFactor × the booked fare.
 * DispatchDocument.raisePrice.maxFactor, per zone or the country standard; default 2, range 1–3
 * (contract.json#dispatch.raisePrice). The server copies it into the zone's rider app config.
 */
const RAISE = contract.dispatch.raisePrice;
export const RAISE_MAX_FACTOR_DEFAULT: number = RAISE.maxFactor;
export const RAISE_FACTOR_RANGE: readonly [number, number] = [RAISE.range[0], RAISE.range[1]];
/** The field moves in tenths (1.5×, 2×): what the admin can type and what raiseFactorLabel shows. */
export const RAISE_FACTOR_STEP = 0.1;

/** The "Rider raise limit" field's bounds from the contract (min, max, step), so the box refuses 0.5× or 4× before any send. */
export const raiseFactorField = (): { min: number; max: number; step: number } => ({ min: RAISE_FACTOR_RANGE[0], max: RAISE_FACTOR_RANGE[1], step: RAISE_FACTOR_STEP });

/** The factor when it is a number inside the contract's range, else null. */
export function validRaiseFactor(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= RAISE_FACTOR_RANGE[0] && value <= RAISE_FACTOR_RANGE[1] ? value : null;
}

/** "2×", "1.5×" (one decimal at most). */
export function raiseFactorLabel(factor: number): string {
  return `${Math.round(factor * 10) / 10}×`;
}

/**
 * Owner G4-E3 "Count them" and G4-E2 "Set 10 everywhere": the auto-offline rule as the admin reads it, with the zone's
 * limit, in the panel's language (contract.json#autoOffline.adminText; {n} = the limit). Hand-sent offers count; Radar
 * and offers sent during a trip do not.
 */
const AUTO_OFFLINE_TEXT: Record<AppLanguage, string> = contract.autoOffline.adminText;

export function autoOfflineText(limit: number, language: AppLanguage = currentLanguage()): string {
  return fill(AUTO_OFFLINE_TEXT[language] ?? AUTO_OFFLINE_TEXT.en, { n: limit });
}

/** contract.json#autoOffline.counts: the offer kinds that count toward the limit (exclusive and assigned = hand-sent). */
export const AUTO_OFFLINE_COUNTS: readonly string[] = contract.autoOffline.counts;

/** contract.json#configDefaults: the limit every zone starts with (10, owner G4-E2). */
export const AUTO_OFFLINE_DEFAULT: number = contract.configDefaults.missedExclusiveBeforeOffline;

/** contract.json#configDefaults.offerCardRiderRating: the rider rating shows on offers unless the admin turns it off. */
export const RIDER_RATING_DEFAULT: boolean = contract.configDefaults.offerCardRiderRating;

/* ---------- Driver group 5 (contract v0.18.7, Rules decisions/driver-g5.md) ---------- */

/**
 * Status item 4 + note check (owner "200 m default, admin can change"): how far the rider may move the pickup after
 * booking. DriverAppConfig.booking.maxPickupMoveMeters per zone or country standard; the server refuses a bigger move
 * (400 pickup_move_too_far). Default 200 (was 500), range 0–2000 (contract.json#pickupWaiting.pickupMove).
 * v0.18.160 (owner 2026-11-23, free pickup move): the default is 300 m now (was 200); the range is unchanged.
 */
const PICKUP_MOVE = contract.pickupWaiting.pickupMove;
export const PICKUP_MOVE_DEFAULT: number = PICKUP_MOVE.default;
export const PICKUP_MOVE_RANGE: readonly [number, number] = [PICKUP_MOVE.range[0], PICKUP_MOVE.range[1]];
/** Whole metres, in steps of 10 (what the box moves by). */
export const PICKUP_MOVE_STEP = 10;

/** The "Pickup move limit" field's bounds from the contract (min, max, step), so the box refuses 2500 m before any send. */
export const pickupMoveField = (): { min: number; max: number; step: number } => ({ min: PICKUP_MOVE_RANGE[0], max: PICKUP_MOVE_RANGE[1], step: PICKUP_MOVE_STEP });

/** FIX JOB 7 (owner Q9, contract.json#smallFixes.samePoint): "Shortest ride (m)", whole metres 0–1000 (0 = never warn). */
export const SAME_POINT_RANGE: readonly [number, number] = [0, 1000];
export function validSamePoint(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= SAME_POINT_RANGE[0] && value <= SAME_POINT_RANGE[1] ? value : null;
}

/** The limit when it is a whole number inside the contract's range, else null. */
export function validPickupMove(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= PICKUP_MOVE_RANGE[0] && value <= PICKUP_MOVE_RANGE[1] ? value : null;
}

/**
 * Q2 (owner 2026-10-31 "This can be adjusted by admin"): "Cancel after the driver arrived counts as a no-show",
 * DriverAppConfig.waiting.cancelAfterArrivedIsNoShow per zone or country standard, default on. The server copies it to
 * the rider document when serving (contract.json#pickupWaiting.servedConfig.cancelAfterArrivedIsNoShow).
 */
const CANCEL_AFTER_ARRIVED = contract.pickupWaiting.servedConfig.cancelAfterArrivedIsNoShow;
export const CANCEL_AFTER_ARRIVED_DEFAULT: boolean = CANCEL_AFTER_ARRIVED.default;
const CANCEL_AFTER_ARRIVED_TEXT: Record<AppLanguage, string> = CANCEL_AFTER_ARRIVED.adminText;

/** The switch's own words in the panel's language, from the contract (sv / fr / en), never retyped. */
export function cancelAfterArrivedText(language: AppLanguage = currentLanguage()): string {
  return CANCEL_AFTER_ARRIVED_TEXT[language] ?? CANCEL_AFTER_ARRIVED_TEXT.en;
}

/**
 * v0.18.93 (job C9, contract.json#autoArrive; owner 2026-11-02 review Q3 "Both: auto + button", Rules
 * decisions/driver-g7.md:83-84): the server marks the driver arrived within DriverAppConfig.waiting.autoArriveMeters of
 * the pickup (default 100 m, 30–300) and stops the waiting clock while he is farther than waiting.leaveMeters (default
 * 200 m, 100–2000, above autoArriveMeters), per zone or the country standard. Read from the contract, never retyped.
 */
const AUTO_ARRIVE = contract.autoArrive.settings;
export const AUTO_ARRIVE_DEFAULT_METERS: number = AUTO_ARRIVE.arriveMeters.default;
export const LEAVE_DEFAULT_METERS: number = AUTO_ARRIVE.leaveMeters.default;
export const AUTO_ARRIVE_RANGE = AUTO_ARRIVE.arriveMeters.range as [number, number];
export const LEAVE_RANGE = AUTO_ARRIVE.leaveMeters.range as [number, number];
const wholeIn = (value: unknown, [min, max]: [number, number]): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** The pair as the server reads it: a bad value or leave not above arrive takes the defaults (100 / 200). */
export function validAutoArrive(arrive: unknown, leave: unknown): { autoArriveMeters: number; leaveMeters: number } | null {
  if (!wholeIn(arrive, AUTO_ARRIVE_RANGE) || !wholeIn(leave, LEAVE_RANGE) || leave <= arrive) return null;
  return { autoArriveMeters: arrive, leaveMeters: leave };
}

/** The problems the server would refuse with 400 invalid_auto_arrive_distance (English keys, shown through tr). */
export function autoArriveIssues(arrive: number, leave: number): string[] {
  const issues: string[] = [];
  if (!wholeIn(arrive, AUTO_ARRIVE_RANGE)) issues.push(`Waiting at pickup: "Auto arrived within" must be whole metres from ${AUTO_ARRIVE_RANGE[0]} to ${AUTO_ARRIVE_RANGE[1]}.`);
  if (!wholeIn(leave, LEAVE_RANGE)) issues.push(`Waiting at pickup: "Waiting stops beyond" must be whole metres from ${LEAVE_RANGE[0]} to ${LEAVE_RANGE[1]}.`);
  if (leave <= arrive) issues.push('Waiting at pickup: "Waiting stops beyond" must be more than "Auto arrived within".');
  return issues;
}
