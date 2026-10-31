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
 */
const PICKUP_MOVE = contract.pickupWaiting.pickupMove;
export const PICKUP_MOVE_DEFAULT: number = PICKUP_MOVE.default;
export const PICKUP_MOVE_RANGE: readonly [number, number] = [PICKUP_MOVE.range[0], PICKUP_MOVE.range[1]];
/** Whole metres, in steps of 10 (what the box moves by). */
export const PICKUP_MOVE_STEP = 10;

/** The "Pickup move limit" field's bounds from the contract (min, max, step), so the box refuses 2500 m before any send. */
export const pickupMoveField = (): { min: number; max: number; step: number } => ({ min: PICKUP_MOVE_RANGE[0], max: PICKUP_MOVE_RANGE[1], step: PICKUP_MOVE_STEP });

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
